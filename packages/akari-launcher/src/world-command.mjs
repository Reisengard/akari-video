import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { resolveLauncherAssets, WORLD_CLI_RELATIVE } from './repo-assets.mjs';

export async function runWorldCommand(args, options = {}) {
  const logError = options.logError ?? ((line) => console.error(line));
  const assets = options.assets ?? resolveLauncherAssets();
  const script = assets.repoRoot ? path.join(assets.repoRoot, WORLD_CLI_RELATIVE) : null;
  if (!script || !existsSync(script)) {
    logError('The script for the internal command world was not found. Check that you have a complete AKARI Video checkout or distribution.');
    return { exitCode: 1 };
  }
  const result = (options.spawn ?? spawnSync)(process.execPath, [script, ...args], { stdio: 'inherit' });
  return { exitCode: typeof result?.status === 'number' ? result.status : 1 };
}
