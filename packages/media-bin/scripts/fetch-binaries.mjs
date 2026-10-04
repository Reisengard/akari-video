#!/usr/bin/env node
// fetch-binaries — binary-manifest.mjs に基づき ffmpeg/ffprobe を取得・検証・展開する。
//
// npm install の postinstall から自動実行される（従来の ffmpeg-static/ffprobe-static の
// postinstall と同じタイミング）ほか、apps/shell/resources/scripts/bundle-ffmpeg-binaries.mjs
// からも ensureVendorBinaries() を直接 import して同梱前の自己修復に使う。
//
// 取得先ドメインはピン留めした配布元のみ（martin-riedl.de / github.com とそのリダイレクト先
// CDN である *.githubusercontent.com）。sha256 不一致は即エラーで停止する（サイレント続行しない）。

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, realpathSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { BINARY_MANIFEST, VENDOR_ROOT, currentTarget, vendorBinaryPath } from "../src/binary-manifest.mjs";

const MAX_REDIRECTS = 5;

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl, redirectsLeft) => {
      const request = https.get(
        currentUrl,
        { headers: { "user-agent": "akari-video-media-bin-fetch (+https://github.com)" } },
        (res) => {
          const { statusCode } = res;
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error(`too many redirects fetching ${url}`));
              return;
            }
            attempt(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1);
            return;
          }
          if (statusCode !== 200) {
            res.resume();
            reject(new Error(`GET ${currentUrl} -> HTTP ${statusCode}`));
            return;
          }
          const file = createWriteStream(destPath);
          res.pipe(file);
          file.on("finish", () => file.close((err) => (err ? reject(err) : resolve())));
          file.on("error", reject);
        },
      );
      request.on("error", reject);
    };
    attempt(url, MAX_REDIRECTS);
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function extractArchive(archivePath, destDir) {
  // martin-riedl.de は .zip、BtbN は .tar.xz を配布する。両方とも system `tar` で展開できる
  // （macOS/Windows の tar は bsdtar = libarchive ベースで zip も読める。Linux の GNU tar は
  // xz を組み込みサポート）。新規 npm 依存（zip/xz パーサ）を増やさないための選択
  const result = spawnSync("tar", ["-xf", archivePath, "-C", destDir], { stdio: "inherit" });
  if (result.error) {
    throw new Error(`Could not start tar (needed to extract ${archivePath}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar -xf ${archivePath} failed (exit ${result.status})`);
  }
}

/**
 * 現在の対象（既定はプロセスの platform/arch）向けに ffmpeg/ffprobe を取得・検証・配置する。
 * @param {{ target?: string, force?: boolean, log?: (msg: string) => void }} [opts]
 */
export async function ensureVendorBinaries({ target = currentTarget(), force = false, log = () => {} } = {}) {
  const config = BINARY_MANIFEST[target];
  if (!config) {
    log(`media-bin: no pinned download for ${target} in the manifest. Falling back to ffmpeg/ffprobe on PATH.`);
    return { ffmpeg: null, ffprobe: null, supported: false };
  }

  const vendorDir = path.join(VENDOR_ROOT, target);
  await mkdir(vendorDir, { recursive: true });

  const byUrl = new Map();
  for (const [name, entry] of Object.entries(config.entries)) {
    if (!byUrl.has(entry.url)) byUrl.set(entry.url, []);
    byUrl.get(entry.url).push([name, entry]);
  }

  // entry.extraMembers（例: whisper-cli.exe が実行時に必要とする ggml/whisper の DLL 群）は
  // vendorBinaryPath の隣に basename でコピーされる、名前解決されないコンパニオンファイル。
  // 「揃っているか」の判定にも含める（DLL だけ欠けた中途半端な vendor 状態を「取得済み」と
  // 誤判定しないため）。
  const extraDestPath = (name, extraMember, targetName) =>
    path.join(path.dirname(vendorBinaryPath(name, targetName)), path.basename(extraMember));

  for (const [url, entries] of byUrl) {
    const alreadyPresent = entries.every(
      ([name, entry]) =>
        existsSync(vendorBinaryPath(name, target)) &&
        (entry.extraMembers ?? []).every((extraMember) => existsSync(extraDestPath(name, extraMember, target))),
    );
    if (alreadyPresent && !force) continue;

    const expectedSha = entries[0][1].sha256;
    for (const [name, entry] of entries) {
      if (entry.sha256 !== expectedSha) {
        throw new Error(`Manifest mismatch: ${name} has conflicting sha256 values for the same URL (${url})`);
      }
    }

    const tmpDir = await mkdtemp(path.join(tmpdir(), "akari-media-bin-"));
    try {
      const archivePath = path.join(tmpDir, path.basename(new URL(url).pathname));
      log(`media-bin: fetching ${url}`);
      await download(url, archivePath);

      const actualSha = await sha256File(archivePath);
      if (actualSha !== expectedSha) {
        throw new Error(
          `sha256 mismatch: ${url}\n  expected: ${expectedSha}\n  actual:   ${actualSha}\n` +
            "The source changed or the download is corrupt. Fetch aborted.",
        );
      }

      const extractDir = path.join(tmpDir, "extract");
      await mkdir(extractDir, { recursive: true });
      extractArchive(archivePath, extractDir);

      for (const [name, entry] of entries) {
        const src = path.join(extractDir, entry.member);
        if (!existsSync(src)) {
          throw new Error(`Expected file missing after extraction: ${entry.member} (archive: ${url})`);
        }
        const dest = vendorBinaryPath(name, target);
        await copyFile(src, dest);
        if (!target.startsWith("win32-")) {
          await chmod(dest, 0o755);
        }
        log(`media-bin: ${name} -> ${path.relative(VENDOR_ROOT, dest)}`);

        for (const extraMember of entry.extraMembers ?? []) {
          const extraSrc = path.join(extractDir, extraMember);
          if (!existsSync(extraSrc)) {
            throw new Error(`Expected bundled file missing after extraction: ${extraMember} (archive: ${url})`);
          }
          const extraDest = extraDestPath(name, extraMember, target);
          await copyFile(extraSrc, extraDest);
          log(`media-bin: ${name} (companion) -> ${path.relative(VENDOR_ROOT, extraDest)}`);
        }
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  const result = { supported: true };
  for (const name of Object.keys(config.entries)) {
    result[name] = vendorBinaryPath(name, target);
  }
  return result;
}

// 両辺 realpath（AGENTS.md の規約）。失敗時は false = 実行しない（fail-closed）
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

const isMainModule = isDirectRun();
if (isMainModule) {
  ensureVendorBinaries({ log: (msg) => console.log(msg) })
    .then((result) => {
      if (result.supported === false) {
        console.log(
          "media-bin: no bundled binaries for this platform. " +
            "resolveFfmpeg() and resolveFfprobe() fall back to PATH or AKARI_FFMPEG_BIN / AKARI_FFPROBE_BIN.",
        );
        return;
      }
      console.log(`media-bin: done (ffmpeg: ${result.ffmpeg} / ffprobe: ${result.ffprobe})`);
    })
    .catch((error) => {
      console.error(`media-bin: could not fetch binaries: ${error.message}`);
      process.exit(1);
    });
}
