#!/usr/bin/env node
// AKARI Sounds（自社 first-party 音源ライブラリ）を GitHub Release から一括取得し、
// user スコープ（<ライブラリの置き場>/audio/akari-sounds-<kind>/）へ登録する。
//
// 第三者配布元と違い AKARI Sounds は自社が配布主体のため、一括ダウンロードを許可する
// （2026-08-03 オーナー裁定。規律の境界は skills/setup-audio-library/first-party.md）。
// 第三者サイト向けのルール（直リンク禁止・直列取得・ユーザー指示必須）はこのスクリプトの
// 対象外だが、取得先は catalog/audio/candidates.json の first_party に宣言された
// AkariLabs/akari-sounds の Release アセットだけに限る（他ホストへは一切アクセスしない）。
//
// Usage: node bin/fetch-akari-sounds.mjs [options]
//   --variant mp3|wav   取得する形式（既定: mp3）
//   --pack <id>         指定したパックだけ登録する
//   --tag <tag>         Release タグ（既定: v0）
//   --dest <dir>        登録先ライブラリルート（既定: <ライブラリの置き場>/audio）
//   --catalog <path>    catalog.json をローカルファイルから読む（オフライン・検証用）
//   --zips-dir <path>   Release zip をローカルディレクトリから読む（オフライン・検証用）
//   --dry-run           取得せずプランだけ表示する
//   --force             既存ファイルが揃っていても再取得する
//   -y, --yes           受理する（対話プロンプトがないため動作は変わらない）
//   -h, --help          このヘルプを表示する

import { resolveAssetLibraryRoots } from '../../creator-root/src/index.mjs';
import { spawnSync } from 'node:child_process';
import { createWriteStream, realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { extractZipWithTools } from '../../asset-resolver/src/paid-zip.mjs';
import { generateWaveformPreview } from '../shared/waveform-preview.mjs';
import {
    AKARI_SOUNDS_DEFAULT_TAG,
    buildPackLibraryMeta,
    planFromCatalog,
    rawFileUrl,
    releaseAssetUrl,
    zipAssetNames,
} from '../shared/akari-sounds.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const validateAssetScript = path.join(repoRoot, 'packages', 'schemas', 'bin', 'validate-asset.mjs');

export const usage = `Usage: node bin/fetch-akari-sounds.mjs [options]
  --variant mp3|wav   Format to fetch (default: mp3)
  --pack <id>         Register only this pack
  --tag <tag>         Release tag (default: v0)
  --dest <dir>        Library root to register into (default: <library>/audio)
  --catalog <path>    Read catalog.json from a local file (offline, for checks)
  --zips-dir <path>   Read release zips from a local directory (offline, for checks)
  --dry-run           Show the plan and do not fetch
  --force             Fetch again even when the files are already there
  -y, --yes           Accept (no prompt, so this changes nothing)
  -h, --help          Show this help`;

export function parseArguments(argv) {
    const options = {
        variant: 'mp3',
        pack: null,
        tag: AKARI_SOUNDS_DEFAULT_TAG,
        // AKARI_HOME はテスト・隔離実行用の差し替え規約（launcher の update-check / sounds-setup と同じ）
        dest: path.join(resolveAssetLibraryRoots().write, 'audio'),
        catalog: null,
        zipsDir: null,
        dryRun: false,
        force: false,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--variant') { options.variant = argv[++i]; continue; }
        if (arg === '--pack') {
            const pack = argv[++i];
            if (!pack || pack.startsWith('--')) throw new Error('--pack requires an id');
            options.pack = pack;
            continue;
        }
        if (arg === '--tag') { options.tag = argv[++i]; continue; }
        if (arg === '--dest') { options.dest = path.resolve(argv[++i]); continue; }
        if (arg === '--catalog') { options.catalog = path.resolve(argv[++i]); continue; }
        if (arg === '--zips-dir') { options.zipsDir = path.resolve(argv[++i]); continue; }
        if (arg === '--dry-run') { options.dryRun = true; continue; }
        if (arg === '--force') { options.force = true; continue; }
        if (arg === '--help' || arg === '-h') { options.help = true; continue; }
        if (arg === '--yes' || arg === '-y') {
            // launcher 共通オプションとして受理する。このスクリプトは対話プロンプトを持たないため no-op。
            continue;
        }
        throw new Error(`Unknown option: ${arg}`);
    }
    zipAssetNames(options.variant); // variant の妥当性を先に検証（不正なら throw）
    return options;
}

async function loadCatalog(options) {
    if (options.catalog) {
        return JSON.parse(await readFile(options.catalog, 'utf8'));
    }
    const url = rawFileUrl('catalog.json', options.tag);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Could not fetch catalog.json: ${url} → HTTP ${res.status}`);
    }
    return res.json();
}

async function fileExists(filePath) {
    try {
        const info = await stat(filePath);
        return info.isFile() && info.size > 0;
    } catch {
        return false;
    }
}

/** pack ごとに、登録先にまだ無いファイルを列挙する */
async function computeMissing(plan, dest) {
    const missing = new Map();
    for (const pack of plan.packs) {
        const packDir = path.join(dest, pack.id);
        const absent = [];
        for (const name of pack.files) {
            if (!(await fileExists(path.join(packDir, name)))) {
                absent.push(name);
            }
        }
        missing.set(pack.id, absent);
    }
    return missing;
}

async function downloadToFile(url, destPath) {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
        throw new Error(`Download failed: ${url} → HTTP ${res.status}`);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

export function unzipInto(zipPath, extractDir, {
    platform = process.platform,
    spawn = spawnSync,
    env = process.env,
} = {}) {
    return extractZipWithTools(zipPath, extractDir, { platform, spawn, env });
}

/** 展開ディレクトリ以下を再帰走査し、ファイル名（basename）→ 絶対パスの索引を作る */
async function indexExtractedFiles(rootDir) {
    const index = new Map();
    const entries = await readdir(rootDir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        index.set(entry.name, path.join(entry.parentPath, entry.name));
    }
    return index;
}

export async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        console.log(usage);
        return;
    }
    const catalog = await loadCatalog(options);
    const fullPlan = planFromCatalog(catalog, { variant: options.variant });
    const packs = options.pack ? fullPlan.packs.filter(pack => pack.id === options.pack) : fullPlan.packs;
    if (options.pack && packs.length === 0) throw new Error(`Unknown pack id: ${options.pack}`);
    const plan = { ...fullPlan, packs, totalFiles: packs.reduce((sum, pack) => sum + pack.files.length, 0) };
    const zipNames = zipAssetNames(options.variant);

    console.log(`AKARI Sounds bulk fetch (${plan.library} ${plan.version ?? ''} / ${options.variant} / tag ${options.tag})`);
    for (const pack of plan.packs) {
        console.log(`  ${pack.id}: ${pack.trackCount} tracks / ${pack.takeCount} takes`);
    }
    console.log(`  Destination: ${options.dest}`);

    const missingBefore = await computeMissing(plan, options.dest);
    const totalMissing = [...missingBefore.values()].reduce((n, list) => n + list.length, 0);

    if (options.dryRun) {
        for (const name of zipNames) {
            console.log(`  Zip to fetch: ${options.zipsDir ? path.join(options.zipsDir, name) : releaseAssetUrl(name, options.tag)}`);
        }
        console.log(`dry-run: ${totalMissing} / ${plan.totalFiles} files are missing. Stop here (no download).`);
        return;
    }

    if (totalMissing === 0 && !options.force) {
        console.log('Every file is already fetched. Skip the download and update meta.json only (pass --force to fetch again).');
    } else {
        const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akari-sounds-fetch-'));
        try {
            const extractDir = path.join(tempRoot, 'extract');
            await mkdir(extractDir, { recursive: true });
            for (const name of zipNames) {
                let zipPath;
                if (options.zipsDir) {
                    zipPath = path.join(options.zipsDir, name);
                } else {
                    zipPath = path.join(tempRoot, name);
                    const url = releaseAssetUrl(name, options.tag);
                    console.log(`  Downloading: ${url}`);
                    await downloadToFile(url, zipPath);
                }
                unzipInto(zipPath, extractDir);
            }
            const extractedIndex = await indexExtractedFiles(extractDir);

            for (const pack of plan.packs) {
                const packDir = path.join(options.dest, pack.id);
                await mkdir(packDir, { recursive: true });
                let placed = 0;
                const notInZip = [];
                for (const name of pack.files) {
                    const from = extractedIndex.get(name);
                    if (!from) {
                        notInZip.push(name);
                        continue;
                    }
                    const to = path.join(packDir, name);
                    if (options.force || !(await fileExists(to))) {
                        await copyFile(from, to);
                        placed += 1;
                    }
                }
                console.log(`  ${pack.id}: ${placed} files placed${notInZip.length ? ` / missing from the zip, ${notInZip.length}: ${notInZip.slice(0, 5).join(', ')}${notInZip.length > 5 ? ' …' : ''}` : ''}`);
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    }

    // meta.json + 取得時点のカタログスナップショット（生成記録の来歴）を毎回書き直す。
    // preview.png は harvest-asset の規律どおり実波形から生成する（代表 = パック先頭ファイル。
    // ffmpeg が無い等で作れないときは実物と違う mock を作らず、理由を記録して正直にスキップ —
    // register-drop-folder と同じ規律）
    const fetchedAt = new Date().toISOString().slice(0, 10);
    const previewSkipped = new Map();
    for (const pack of plan.packs) {
        const packDir = path.join(options.dest, pack.id);
        await mkdir(packDir, { recursive: true });
        const meta = buildPackLibraryMeta(pack, { tag: options.tag, fetchedAt });
        await writeFile(path.join(packDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
        await writeFile(path.join(packDir, '.origin-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
        const previewPath = path.join(packDir, 'preview.png');
        if (options.force || !(await fileExists(previewPath))) {
            const representative = pack.files.find((name) => name);
            const previewResult = representative
                ? generateWaveformPreview(path.join(packDir, representative), previewPath)
                : { ok: false, reason: 'The pack has no files' };
            if (!previewResult.ok) {
                previewSkipped.set(pack.id, previewResult.reason);
                console.error(`  preview.png was not generated for ${pack.id}: ${previewResult.reason}`);
            }
        }
    }

    // 検収: 期待ファイルの欠品と meta.json のスキーマ妥当性
    const missingAfter = await computeMissing(plan, options.dest);
    let incomplete = 0;
    for (const pack of plan.packs) {
        const absent = missingAfter.get(pack.id) ?? [];
        if (absent.length > 0) {
            incomplete += absent.length;
            console.error(`  Missing ${pack.id}: ${absent.length} (for example ${absent.slice(0, 5).join(', ')})`);
        }
        const result = spawnSync(process.execPath, [validateAssetScript, path.join(options.dest, pack.id)], { encoding: 'utf8' });
        if (result.status !== 0) {
            const output = `${result.stderr ?? ''}${result.stdout ?? ''}`;
            const failureLines = output.split('\n').filter((line) => line.startsWith('- '));
            const onlyPreviewMissing = previewSkipped.has(pack.id)
                && failureLines.length > 0
                && failureLines.every((line) => line.includes('preview.png'));
            if (onlyPreviewMissing) {
                // 音源の実体は揃っている。preview は正直スキップ済みなので致命扱いにしない
                // （register-drop-folder の「honestly skipped」と同じ扱い）
                console.error(`  Note ${pack.id}: validate-asset failed because preview.png was not generated (${previewSkipped.get(pack.id)}). The audio is in place. Install ffmpeg and pass --force to regenerate it.`);
            } else {
                incomplete += 1;
                console.error(`  validate-asset failed for ${pack.id}: ${output}`);
            }
        }
    }

    if (incomplete > 0) {
        console.error(`Incomplete: ${incomplete} missing files or validation failures`);
        process.exitCode = 1;
        return;
    }
    console.log(`Done: registered ${plan.totalFiles} files / ${plan.packs.length} packs (${options.dest})`);
}

if (process.argv[1]
    && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main().catch((error) => {
        console.error(error.stack ?? String(error));
        process.exitCode = 1;
    });
}
