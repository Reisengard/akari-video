#!/usr/bin/env node
// SFX / ジングル自動提案 CLI — 「場面の意味」から AKARI Sounds の候補（+ 外部補完の参照）を返す。
//
// suggest-bgm.mjs の姉妹 CLI。読み先は fetch-akari-sounds.mjs が書いた取得時点スナップショット
// （どのパックの .origin-catalog.json も全 kind を含む）。ネットワークには一切触れない。
// これは**候補の提示まで** — 発火タイミングの設計は beat-sync、採用は素材計画の承認で決める。
//
// Usage:
//   node bin/suggest-sfx.mjs --meaning <値> [--count N] [--catalog path] [--json]
//   node bin/suggest-sfx.mjs --list          # 意味の語彙一覧

import { audioReadPath } from '../shared/library-roots.mjs';
import { resolveAssetLibraryRoots } from '../../creator-root/src/index.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MEANING_VOCABULARY, suggestSfx } from '../shared/sfx-suggest.mjs';

const SNAPSHOT_PACKS = ['akari-sounds-sfx', 'akari-sounds-jingle', 'akari-sounds-bgm'];

function resolveLibraryRoot(env = process.env) {
  return path.join(resolveAssetLibraryRoots(env).write, 'audio');
}

function parseArguments(argv) {
  const options = { meaning: null, count: 5, catalog: null, json: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--meaning') { options.meaning = argv[++i]; continue; }
    if (arg === '--count') { options.count = Number(argv[++i]); continue; }
    if (arg === '--catalog') { options.catalog = path.resolve(argv[++i]); continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--list') { options.list = true; continue; }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function loadCatalog(options, libraryRoot) {
  if (options.catalog) {
    return { catalog: JSON.parse(await readFile(options.catalog, 'utf8')), source: options.catalog };
  }
  for (const pack of SNAPSHOT_PACKS) {
    const snapshotPath = audioReadPath(libraryRoot, pack, '.origin-catalog.json');
    if (existsSync(snapshotPath)) {
      return { catalog: JSON.parse(await readFile(snapshotPath, 'utf8')), source: snapshotPath };
    }
  }
  throw new Error(
    'AKARI Sounds is not installed (.origin-catalog.json was not found).\n' +
    'Run `akari sounds` first to download the official audio library.',
  );
}

function attachPaths(result, libraryRoot) {
  const first = result.first.map((candidate) => {
    if (candidate.absent) {
      return candidate;
    }
    const takes = candidate.takes.map((take) => {
      const localPath = take.mp3 ? audioReadPath(libraryRoot, `akari-sounds-${candidate.kind}`, take.mp3) : null;
      return { ...take, path: localPath, exists: localPath ? existsSync(localPath) : false };
    });
    return { ...candidate, takes };
  });
  const external = result.external.map((entry) => {
    const libraryDir = audioReadPath(libraryRoot, entry.id);
    const owned = existsSync(path.join(libraryDir, 'meta.json'));
    return { ...entry, owned, library_dir: owned ? libraryDir : null };
  });
  return { ...result, first, external };
}

function formatHuman(result) {
  const lines = [`Sound candidates for "${result.meaning}" (priority order)`];
  result.first.forEach((c, index) => {
    if (c.absent) {
      lines.push(`${index + 1}. ${c.id} — not in the catalog (it may have left the release. Consider updating the map)`);
      return;
    }
    lines.push(`${index + 1}. ${c.id} — ${c.title} (${c.kind})`);
    for (const take of c.takes) {
      lines.push(`   ${take.exists ? 'path' : 'not fetched'}: ${take.path}${take.duration_sec ? ` (${take.duration_sec}s)` : ''}`);
    }
  });
  if (result.external.length > 0) {
    lines.push('External fill-in (families AKARI Sounds does not have. Fetch the files yourself. See catalog/audio):');
    for (const entry of result.external) {
      lines.push(`- ${entry.id} — ${entry.note} ${entry.owned ? `[fetched: ${entry.library_dir}]` : '[not fetched: catalog/audio/' + entry.id + ' or the candidate list]'}`);
    }
  }
  if (result.first.length === 0 && result.external.length === 0) {
    lines.push('No candidates (that row of the map is empty)');
  }
  lines.push('beat-sync places the hit. Approve the choice at the footage plan (Checkpoint 2).');
  return lines.join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.list) {
    console.log(MEANING_VOCABULARY.join('\n'));
    return;
  }
  if (!options.meaning) {
    throw new Error(`Pass --meaning (see --list). Allowed values: ${MEANING_VOCABULARY.join(' / ')}`);
  }
  const libraryRoot = resolveLibraryRoot();
  const { catalog, source } = await loadCatalog(options, libraryRoot);
  const result = attachPaths(suggestSfx(catalog, { meaning: options.meaning, count: options.count }), libraryRoot);

  if (options.json) {
    console.log(JSON.stringify({ source, library_root: libraryRoot, meaning_vocabulary: MEANING_VOCABULARY, ...result }, null, 2));
    return;
  }
  console.log(formatHuman(result));
}

main().catch((error) => {
  console.error(error.message ?? String(error));
  process.exitCode = 1;
});
