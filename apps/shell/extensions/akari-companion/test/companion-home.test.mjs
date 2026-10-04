import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readCompanionAddress,
  resolveAkariHomeDir
} from '../lib/node/companion-home.js';

test('Resolve configuration paths from AKARI_HOME and default home', () => {
  assert.equal(resolveAkariHomeDir({ AKARI_HOME: '/custom' }, '/home'), '/custom');
  assert.equal(resolveAkariHomeDir({}, '/home'), join('/home', '.akari'));
});

test('Read only valid configuration with mode 600', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'akari-companion-home-'));
  const file = join(dir, 'companion.json');
  try {
    await writeFile(file, JSON.stringify({ port: 4567, token: 'secret' }), { mode: 0o600 });
    await chmod(file, 0o600);
    assert.deepEqual(await readCompanionAddress(file), { port: 4567, token: 'secret' });
    await chmod(file, 0o644);
    assert.equal(await readCompanionAddress(file), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Reject malformed JSON and port/token type mismatches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'akari-companion-home-'));
  const file = join(dir, 'companion.json');
  try {
    for (const source of [
      '{',
      JSON.stringify({ port: '4567', token: 'secret' }),
      JSON.stringify({ port: 0, token: 'secret' }),
      JSON.stringify({ port: 65536, token: 'secret' }),
      JSON.stringify({ port: 4567, token: 1 }),
      JSON.stringify({ port: 4567, token: '' })
    ]) {
      await writeFile(file, source, { mode: 0o600 });
      await chmod(file, 0o600);
      assert.equal(await readCompanionAddress(file), undefined, source);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
