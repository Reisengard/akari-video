#!/usr/bin/env node
/**
 * 幾何の統一 G1 — 既存プロジェクトを実寸基準（`output.geometry: "source"`）へ移行する CLI。
 *
 *   node packages/edit-store/bin/normalize-geometry.mjs <projectDir> [--dry-run] [--revert <backup>]
 *
 * 素材の寸法は ffprobe（media-bin）で読み、表示回転後の画素数で `fit` を求める。
 * 書き込みの直前に edit-lint ゲートを通し、原文は .akari/backup/ へ退避してから atomic に置き換える。
 * G1 ではエンジンはマーカーを読まないため、この移行だけでは描画は変わらない。
 */

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { probeMediaDimensions } from "../../media-bin/src/media-dimensions.mjs";

const require = createRequire(import.meta.url);
const migrate = require("../lib/migrate/index.js");
const writeGate = require("../lib/write-gate.js");

const USAGE = [
  "Usage: normalize-geometry <projectDir> [--dry-run] [--revert <backup>]",
  "",
  "  Migrate version 2 edit.json visual items onto source-sized geometry.",
  "  Bake the current fit scale into transform.scale once for cuts drawn in fit mode,",
  "  and set output.geometry: \"source\". The picture does not change.",
  "",
  "  --dry-run           Print the change table and do not write",
  "  --revert <backup>   Restore edit.json from a file under .akari/backup/",
  "  --help, -h          Show this help",
].join("\n");

export function parseArguments(argv) {
  const positional = [];
  let dryRun = false;
  let revert = null;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") dryRun = true;
    else if (value === "--help" || value === "-h") help = true;
    else if (value === "--revert") {
      revert = argv[index + 1];
      index += 1;
      if (typeof revert !== "string" || revert.length === 0) {
        return { ok: false, message: "--revert needs the backup file path." };
      }
    } else if (value.startsWith("-")) {
      return { ok: false, message: `Unknown option: ${value}` };
    } else positional.push(value);
  }
  if (help) return { ok: true, help: true };
  if (positional.length !== 1) {
    return { ok: false, message: "Specify one project directory." };
  }
  return { ok: true, help: false, projectRoot: path.resolve(positional[0]), dryRun, revert };
}

/** dry-run の表。列は itemId / source / fit / scale before → after。 */
export function formatChangeTable(changes) {
  if (changes.length === 0) return ["No changes. Every footage item already matches the output size, or there is nothing to migrate."];
  const header = ["itemId", "source", "fit", "scale before", "scale after"];
  const rows = changes.map((change) => [
    change.itemId,
    change.sourceId,
    String(change.fit),
    String(change.before),
    String(change.after),
  ]);
  const widths = header.map((label, column) =>
    Math.max(label.length, ...rows.map((row) => row[column].length)));
  const line = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [line(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)];
}

async function collectDimensions(projectRoot, edit) {
  const sources = Array.isArray(edit?.sources) ? edit.sources : [];
  const entries = await Promise.all(sources.map(async (source) => {
    if (!source || typeof source.id !== "string" || typeof source.path !== "string") return null;
    const filePath = path.isAbsolute(source.path) ? source.path : path.join(projectRoot, source.path);
    try {
      const probed = await probeMediaDimensions(filePath);
      // fit は表示回転を適用した後の画素数で決まる。
      return [source.id, { width: probed.displayWidth, height: probed.displayHeight }];
    } catch {
      // 音声素材・欠損ファイルはここで落ちる。移行対象だった場合だけ blockers になる。
      return null;
    }
  }));
  return new Map(entries.filter(Boolean));
}

async function runRevert(projectRoot, backup, log, error) {
  const editPath = path.join(projectRoot, "edit.json");
  const backupPath = path.resolve(backup);
  let backupText;
  try {
    backupText = await readFile(backupPath, "utf8");
  } catch (cause) {
    error(`Cannot read the backup file: ${backupPath} (${messageOf(cause)})`);
    return 2;
  }
  const currentText = await readFile(editPath, "utf8");
  if (currentText === backupText) {
    log("edit.json already matches the backup file.");
    return 0;
  }
  await migrate.revertMigration({
    filePath: editPath,
    version: 2,
    changes: [],
    warnings: [],
    nextText: currentText,
    previousText: backupText,
    backupPath,
  });
  log(`Restored edit.json from ${backupPath}.`);
  return 0;
}

export async function run(argv, io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const error = io.error ?? ((line) => console.error(line));
  const parsed = parseArguments(argv);
  if (!parsed.ok) {
    error(parsed.message);
    error(USAGE);
    return 2;
  }
  if (parsed.help) {
    log(USAGE);
    return 0;
  }
  const projectRoot = parsed.projectRoot;
  const editPath = path.join(projectRoot, "edit.json");
  if (parsed.revert !== null) return runRevert(projectRoot, parsed.revert, log, error);

  let text;
  try {
    text = await readFile(editPath, "utf8");
  } catch (cause) {
    error(`Cannot read edit.json: ${editPath} (${messageOf(cause)})`);
    return 2;
  }
  let edit;
  try {
    edit = JSON.parse(text);
  } catch (cause) {
    error(`edit.json is not valid JSON: ${messageOf(cause)}`);
    return 2;
  }
  const dimensions = await collectDimensions(projectRoot, edit);
  const proposal = migrate.planGeometryNormalization(projectRoot, editPath, text, {
    dimensionsOf: (sourceId) => dimensions.get(sourceId),
  });
  if (proposal.ok === false) {
    error("This project cannot be migrated.");
    for (const blocker of proposal.blockers) error(`- ${blocker}`);
    return 2;
  }
  if (proposal.noop === true) {
    log("Already source-sized (output.geometry: \"source\"). No migration is needed.");
    return 0;
  }
  log(`Migration target: ${proposal.filePath}`);
  for (const line of formatChangeTable(proposal.geometry)) log(line);
  log(`Will set output.geometry: "source" (blockers 0).`);
  if (parsed.dryRun) {
    log("--dry-run, so no file was changed.");
    return 0;
  }
  const gate = await writeGate.lintProjectCandidatesOnDisk(projectRoot, { "edit.json": proposal.nextText });
  if (!gate.pass) {
    error("edit-lint rejected the migrated edit.json.");
    for (const message of gate.errors) error(`- ${message}`);
    return 1;
  }
  await migrate.applyMigration(proposal);
  log(`Migrated. Original file: ${proposal.backupPath}`);
  log(`To restore: normalize-geometry ${projectRoot} --revert ${proposal.backupPath}`);
  return 0;
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
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

if (isDirectRun()) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (cause) => {
    console.error(messageOf(cause));
    process.exitCode = 1;
  });
}
