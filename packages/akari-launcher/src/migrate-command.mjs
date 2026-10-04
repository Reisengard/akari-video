import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import { resolveLauncherAssets } from './repo-assets.mjs';

const require = createRequire(import.meta.url);

export async function runMigrateCommand(args, options = {}) {
  const log = options.log ?? ((line) => console.log(line));
  const error = options.error ?? ((line) => console.error(line));
  const cwd = options.cwd ?? process.cwd();
  const parsed = parseArguments(args, cwd);
  if (!parsed.ok) {
    error(parsed.message);
    return { exitCode: 2 };
  }
  if (parsed.help) {
    for (const line of migrateHelp()) log(line);
    return { exitCode: 0 };
  }
  const projectRoot = parsed.projectRoot;
  const editPath = path.join(projectRoot, 'edit.json');
  const captionsPath = path.join(projectRoot, 'captions.json');
  const readText = options.readFile ?? readFile;
  let text;
  try {
    text = await readText(editPath, 'utf8');
  } catch (cause) {
    error(`Cannot read edit.json: ${editPath} (${messageOf(cause)})`);
    return { exitCode: 2 };
  }
  const migrate = options.migrate ?? loadMigrateModule(options.assets ?? resolveLauncherAssets());
  let captionsRoot;
  try {
    captionsRoot = JSON.parse(await readText(captionsPath, 'utf8'));
  } catch {
    // captions.json の不在・読み取り失敗・壊れた JSON は cue なしとして移行を続ける。
  }
  const hasCaptions = migrate.captionsHaveRenderableCues(captionsRoot);
  let editVersion;
  try {
    editVersion = migrate.detectEditVersion(JSON.parse(text));
  } catch {
    // JSON error の文言は従来どおり planMigration に一元化する。
  }
  const proposal = editVersion === 2
    ? migrate.planV2Normalization(projectRoot, editPath, text, { now: options.now })
    : migrate.planMigration(projectRoot, editPath, text, { hasCaptions, now: options.now });
  if (proposal.ok === false) {
    if (parsed.json) {
      log(JSON.stringify({ ok: false, error: 'This project cannot be converted', blockers: proposal.blockers }));
    } else {
      error('This project cannot be converted.');
      for (const blocker of proposal.blockers) error(`- ${blocker}`);
    }
    return { exitCode: 2 };
  }
  if (proposal.noop === true) {
    if (parsed.json) log(JSON.stringify({ ok: true, noop: true, version: proposal.version }));
    else log('No conversion is needed.');
    return { exitCode: 0, proposal };
  }
  if (parsed.json) {
    log(JSON.stringify({
      ok: true, dryRun: parsed.dryRun, version: proposal.version,
      filePath: proposal.filePath, backupPath: proposal.backupPath, changes: proposal.changes
    }));
  } else {
    log(`To convert: ${proposal.filePath} (version ${proposal.version}${proposal.version === 2 ? ' normalize' : ' -> 2'})`);
    for (const change of proposal.changes) log(`- ${change.path}: ${change.note}`);
    log(`Backup before conversion: ${proposal.backupPath}`);
  }
  if (parsed.dryRun) {
    if (!parsed.json) log('--dry-run: no file is changed.');
    return { exitCode: 0, proposal };
  }
  if (!parsed.yes) {
    const isTTY = options.isTTY ?? (process.stdin.isTTY && process.stdout.isTTY);
    if (!isTTY) {
      error('A non-TTY session needs explicit approval. Check the details, then run again with --yes.');
      return { exitCode: 2, proposal };
    }
    const accepted = options.confirm
      ? await options.confirm()
      : await promptForConfirmation();
    if (!accepted) {
      if (!parsed.json) log('Not converted. edit.json is unchanged.');
      return { exitCode: 0, proposal };
    }
  }
  await migrate.applyMigration(proposal);
  if (!parsed.json) {
    log(proposal.version === 2
      ? `Normalized version 2. Original file: ${proposal.backupPath}`
      : `Converted to version 2. Original file: ${proposal.backupPath}`);
  }
  return { exitCode: 0, proposal };
}

function loadMigrateModule(assets) {
  const modulePath = path.join(assets.repoRoot, 'packages', 'edit-store', 'lib', 'migrate', 'index.js');
  try {
    return require(modulePath);
  } catch (cause) {
    throw new Error(`Cannot load the converter: ${modulePath} (${messageOf(cause)})`);
  }
}

function parseArguments(args, cwd) {
  const flags = new Set(args.filter(value => value.startsWith('-')));
  const unknown = [...flags].filter(value => !['--yes', '-y', '--dry-run', '--json', '--help', '-h'].includes(value));
  if (unknown.length > 0) return { ok: false, message: `Unknown option: ${unknown.join(', ')}` };
  const positional = args.filter(value => !value.startsWith('-'));
  if (positional.length > 1) return { ok: false, message: 'Only one project directory can be given.' };
  return {
    ok: true,
    help: flags.has('--help') || flags.has('-h'),
    yes: flags.has('--yes') || flags.has('-y'),
    dryRun: flags.has('--dry-run'),
    json: flags.has('--json'),
    projectRoot: path.resolve(cwd, positional[0] ?? '.')
  };
}

async function promptForConfirmation() {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question('Convert to version 2 with the changes above? [y/N] ');
    return /^(?:y|yes)$/iu.test(answer.trim());
  } finally {
    readline.close();
  }
}

export function migrateHelp() {
  return [
    'Usage: akari migrate [dir] [--yes] [--dry-run] [--json]',
    '',
    'Converts a v0/v1 edit.json to v2 (one way), and moves a v2 file to its canonical form.',
    'By default it shows the changes and asks y/n, and saves the full original to .akari/backup/ first.',
    '',
    '  --yes, -y   Skip the confirmation after showing the changes',
    '  --dry-run   Only show the proposal and write nothing',
    '  --json      Print machine-readable JSON',
    '  --help, -h  Show this help'
  ];
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
