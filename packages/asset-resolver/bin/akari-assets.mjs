#!/usr/bin/env node
// akari-assets — 素材 resolver v0 の CLI（list / add / fetch / bundle / migrate / sync / browse）。
//
//   akari-assets list [--category <c>] [--source <lab|site|own>] [--json]
//   akari-assets add <path...> --plan [--json]
//   akari-assets add --apply <plan.json> [--json]
//   akari-assets fetch <id> [--project <dir>] [--reference] [--force]
//   akari-assets bundle --project <dir> [--dry-run]
//   akari-assets sync
//   akari-assets browse [--port <n>]

import { readFile } from 'node:fs/promises';
import { planAdd, applyAdd } from '../src/add.mjs';
import { migrateAssetLibrary } from '../../creator-root/src/index.mjs';
import { startBrowseServer } from '../src/browse-server.mjs';
import { bundleProjectReferences } from '../src/bundle.mjs';
import { cacheCatalog, loadCatalog } from '../src/catalog.mjs';
import { resolve as resolveAsset } from '../src/resolve.mjs';
import { DEFAULT_CATALOG_URL, DEFAULT_STORE_API } from '../src/service-urls.mjs';
import { composeState } from '../src/state.mjs';
import { checkLibrary, projectCredits } from '../src/library-check.mjs';

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

// Validate the entire command before any handler can read or mutate user data.
function validateArgs(sub, args) {
  const specs = {
    list: { values: ['--category', '--source'], flags: ['--json'], max: 0 },
    add: { values: ['--apply'], flags: ['--plan', '--json'], max: Infinity },
    fetch: { values: ['--project'], flags: ['--reference', '--force'], min: 1, max: 1 },
    bundle: { values: ['--project'], flags: ['--dry-run'], max: 0 },
    migrate: { values: [], flags: ['--dry-run'], max: 0 },
    sync: { values: [], flags: [], max: 0 },
    browse: { values: ['--port'], flags: [], max: 0 },
    check: { values: ['--project'], flags: ['--json'], max: 0 },
    credits: { values: ['--project'], flags: [], max: 0 },
  };
  const spec = specs[sub];
  if (!spec) throw new Error(`Unknown command: ${sub}`);
  const seen = new Set();
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) { positional.push(arg); continue; }
    if (!spec.values.includes(arg) && !spec.flags.includes(arg)) throw new Error(`Unknown option: ${arg}`);
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (spec.values.includes(arg) && (!args[++i] || args[i].startsWith('-'))) throw new Error(`${arg} needs a value`);
  }
  if (positional.length < (spec.min ?? 0) || positional.length > spec.max) throw new Error('Wrong number of arguments');
  if (sub === 'add' && (seen.has('--plan') === seen.has('--apply')
    || (seen.has('--apply') ? positional.length !== 0 : positional.length === 0))) {
    throw new Error('add needs <path...> --plan, or --apply <plan.json>');
  }
  if (sub === 'bundle' && !seen.has('--project')) throw new Error('--project <dir> is required');
  if (sub === 'credits' && !seen.has('--project')) throw new Error('--project <dir> is required');
  if (sub === 'fetch') {
    if (args[0] !== positional[0]) throw new Error('Put the footage id first for fetch');
    if (seen.has('--reference') && !seen.has('--project')) throw new Error('--reference needs --project <dir>');
  }
}

const STATE_BADGE = { cached: '✓', locked: '¥', available: '☁' };

function badgeOf(item) {
  if (item.source === 'installed') return '[installed]';
  if (item.state === 'locked') return `¥${(item.price ?? 0).toLocaleString()}`;
  return STATE_BADGE[item.state] ?? '?';
}

async function cmdList(args, env) {
  const category = flagValue(args, '--category');
  const asJson = args.includes('--json');
  const source = flagValue(args, '--source');
  if (args.includes('--source') && !['lab', 'site', 'own'].includes(source)) throw new Error('--source must be lab, site, or own');
  const { libraryRoots, items, warnings } = await composeState({ env });
  for (const warning of warnings) console.error(`Warning: ${warning}`);
  const filtered = items.filter(item => (!category || item.category === category) && (!source || item.sourceKind === source));

  if (asJson) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  console.log(`${filtered.length} footage items (library: ${libraryRoots.write})`);
  for (const item of filtered) {
    console.log(`  ${badgeOf(item)}  ${item.id}\t${item.sourceKind}\t[${item.category}]\t${item.title}`);
  }
}

async function cmdAdd(args, env) {
  const apply = flagValue(args, '--apply');
  if (args.includes('--plan') === args.includes('--apply')) throw new Error('add needs either --plan or --apply <plan.json>');
  let result;
  if (args.includes('--apply')) {
    if (!apply || args.some((arg, index) => !['--apply', '--json'].includes(arg) && index !== args.indexOf('--apply') + 1)) throw new Error('Usage: akari-assets add --apply <plan.json> [--json]');
    result = await applyAdd(JSON.parse(await readFile(apply, 'utf8')), { env });
    if (result.failures.length) process.exitCode = 1;
  } else {
    if (args.some(arg => arg.startsWith('--') && !['--plan', '--json'].includes(arg))) throw new Error('Usage: akari-assets add <path...> --plan [--json]');
    result = await planAdd(args.filter(arg => !['--plan', '--json'].includes(arg)), { env });
  }
  console.log(JSON.stringify(result, null, 2));
}

async function cmdFetch(args, env) {
  const id = args[0];
  if (!id || id.startsWith('--')) {
    console.error('Usage: akari-assets fetch <id> [--project <dir>] [--reference] [--force]');
    process.exitCode = 1;
    return;
  }
  const project = flagValue(args, '--project');
  const reference = args.includes('--reference');
  const force = args.includes('--force');
  if (reference && !project) {
    console.error('--reference needs --project <dir>');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await resolveAsset(id, { env, project, force, reference });
    console.log(`${result.cached ? 'Using the cached copy' : 'Fetched'}: ${result.dir}`);
    if (result.projectDir) console.log(`  Copied into the project: ${result.projectDir}`);
    if (result.referenced) console.log(`  Recorded a reference: ${result.category}/${result.id}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function cmdBundle(args, env) {
  const project = flagValue(args, '--project');
  const dryRun = args.includes('--dry-run');
  if (!project) {
    console.error('Usage: akari-assets bundle --project <dir> [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const result = await bundleProjectReferences({ project, env, dryRun });
  if (result.planned.length === 0) {
    console.log('No references to materialize');
    return;
  }
  if (dryRun) {
    for (const reference of result.planned) {
      console.log(`To be materialized: ${reference.category}/${reference.id}`);
    }
    return;
  }

  for (const materialized of result.materialized) {
    console.log(
      `Materialized: ${materialized.category}/${materialized.id} -> ${materialized.projectDir}`,
    );
  }
  if (result.failures.length > 0) {
    console.error(`Could not materialize ${result.failures.length} references:`);
    for (const failure of result.failures) {
      console.error(
        `  ${failure.reference.category}/${failure.reference.id}: ${failure.message}`,
      );
    }
    process.exitCode = 1;
  }
}

async function cmdSync(_args, env) {
  const catalog = await loadCatalog({ env, includeInstalled: false });
  await cacheCatalog(env, catalog);
  console.log(`Synced the catalog: ${catalog.items.length} items (version ${catalog.version ?? 'unknown'})`);
}

async function cmdBrowse(args, env) {
  const port = Number(flagValue(args, '--port') ?? 8910);
  await startBrowseServer({ env, port });
  // サーバプロセスを起動したまま維持する（declare-server.mjs 等と同じ流儀）
}

async function cmdCheck(args, env) {
  const result = await checkLibrary({ env, project: flagValue(args, '--project') });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok} ok / ${result.warnings.length} warnings / ${result.errors.length} errors`);
    for (const row of result.findings) console.log(`${row.level === 'error' ? 'error' : 'warning'}: ${row.category}/${row.id}: ${row.message} (${row.dir})`);
  }
  if (result.errors.length) process.exitCode = 1;
}

async function cmdCredits(args, env) {
  console.log((await projectCredits(flagValue(args, '--project'), env)).join('\n'));
}

function printUsage() {
  console.log(`Usage: akari-assets <list|add|fetch|bundle|migrate|sync|browse|check|credits> [options]

  list [--category <c>] [--source <lab|site|own>] [--json]
                                          List footage with origin and fetch state
  add <path...> --plan [--json]           Plan a local import (no writes)
  add --apply <plan.json> [--json]        Copy the footage selected in a plan and register it
  fetch <id> [--project <dir>] [--reference] [--force]
                                          Resolve footage and register it (--reference records a reference and does not copy)
  bundle --project <dir> [--dry-run]      Materialize referenced footage into the project
  migrate [--dry-run]                     Move the library into the workspace
  sync                                    Fetch the catalog and cache it locally
  browse [--port <n>]                     Browse and fetch the catalog over local HTTP (default 8910)
  check [--project <dir>] [--json]        Read-only library check
  credits --project <dir>                 List credit lines for the project

Environment:
  AKARI_HOME             Machine config directory (default: ~/.akari)
  AKARI_LIBRARY_ROOT     Override the library location
  AKARI_ASSETS_CATALOG   Catalog source. URL or local path (default: ${DEFAULT_CATALOG_URL})
  AKARI_ASSETS_BASE      Override the footage delivery base (default: the catalog "base" field)
  AKARI_STORE_API        Override the entitlements API host (default: ${DEFAULT_STORE_API})`);
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const env = process.env;

  if (!sub || process.argv.slice(2).some(arg => arg === '--help' || arg === '-h')) {
    printUsage();
    return;
  }
  try { validateArgs(sub, rest); }
  catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (sub === 'migrate') {
    const result = await migrateAssetLibrary({ env, dryRun: rest.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) process.exitCode = 1;
    return;
  }
  if (sub === 'list') return cmdList(rest, env);
  if (sub === 'add') return cmdAdd(rest, env);
  if (sub === 'fetch') return cmdFetch(rest, env);
  if (sub === 'bundle') return cmdBundle(rest, env);
  if (sub === 'sync') return cmdSync(rest, env);
  if (sub === 'browse') return cmdBrowse(rest, env);
  if (sub === 'check') return cmdCheck(rest, env);
  if (sub === 'credits') return cmdCredits(rest, env);

  printUsage();
  process.exitCode = sub && sub !== '--help' && sub !== '-h' ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
