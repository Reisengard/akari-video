import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { WorldCliRunner } = require('../lib/node/world-cli.js');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null;
  return child;
}

test('moveStop spawns launcher with expected arguments and environment and reads final JSON', async () => {
  let call;
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs', KEEP: 'yes' }, spawnImpl: (...args) => { call = args; queueMicrotask(() => { child.stdout.write('note\n'); child.stdout.end('{"ok":true,"stopId":"a","before":[0,0,1],"after":[1,2,1],"changed":true}\n'); child.emit('close', 0); }); return child; } });
  const result = await runner.moveStop('/project', 'a', [1, 2, 1]);
  assert.equal(result.ok, true);
  assert.equal(call[0], process.execPath);
  assert.deepEqual(call[1], ['/cli.mjs', 'world', 'move-stop', '/project', '--stop', 'a', '--c', '1,2,1', '--json']);
  assert.equal(call[2].detached, false); assert.equal(call[2].env.ELECTRON_RUN_AS_NODE, '1'); assert.equal(call[2].env.KEEP, 'yes');
});

test('Invalid arguments do not spawn', async () => {
  let count = 0;
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { count += 1; return fakeChild(); } });
  assert.equal((await runner.moveStop('/p', '../bad', [1, 2])).code, 'ARG');
  assert.equal((await runner.moveStop('/p', 'ok', [1])).code, 'ARG');
  assert.equal(count, 0);
});

test('Wrap malformed JSON and spawn failures in results', async () => {
  const child = fakeChild();
  const invalid = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { queueMicrotask(() => { child.stdout.end('not-json\n'); child.emit('close', 1); }); return child; } });
  assert.equal((await invalid.moveStop('/p', 'a', [1, 2])).code, 'OUTPUT');
  const failed = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { throw new Error('boom'); } });
  assert.equal((await failed.moveStop('/p', 'a', [1, 2])).code, 'SPAWN');
});

test('Concurrent execution for the same stopId returns BUSY', async () => {
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => child });
  const first = runner.moveStop('/p', 'a', [1, 2]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await runner.moveStop('/p', 'a', [2, 3])).code, 'BUSY');
  child.stdout.end('{"ok":true}\n'); child.emit('close', 0);
  assert.equal((await first).ok, true);
});

test('overview reads generated HTML from CLI JSON output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'akari-world-overview-'));
  const output = join(dir, 'overview.html'); await writeFile(output, '<h1>atlas</h1>');
  let call; const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: (...args) => { call = args; queueMicrotask(() => { child.stdout.end(JSON.stringify({ output, fallback: false, atlas: true }) + '\n'); child.emit('close', 0); }); return child; } });
  const result = await runner.overview('/project');
  assert.equal(result.html, '<h1>atlas</h1>'); assert.equal(result.atlas, true);
  assert.deepEqual(call[1], ['/cli.mjs', 'world', 'overview', '/project', '--json']);
  assert.equal(call[2].env.ELECTRON_RUN_AS_NODE, '1'); assert.equal(call[2].detached, false);
});

test('overview returns stderr as error on empty stdout', async () => {
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { queueMicrotask(() => { child.stderr.end('specific failure'); child.stdout.end(); child.emit('close', 1); }); return child; } });
  assert.equal((await runner.overview('/p')).error, 'specific failure');
});

test('overview wraps malformed JSON in error', async () => {
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { queueMicrotask(() => { child.stdout.end('not-json\n'); child.emit('close', 1); }); return child; } });
  assert.match((await runner.overview('/p')).error, /Could not parse/);
});

test('overview wraps spawn exceptions in error', async () => {
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { throw new Error('boom'); } });
  assert.match((await runner.overview('/p')).error, /boom/);
});

test('overview rejects concurrent generation for the same root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'akari-world-overview-busy-'));
  const output = join(dir, 'overview.html'); await writeFile(output, 'ok');
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => child });
  const first = runner.overview('/same'); await new Promise(resolve => setImmediate(resolve));
  assert.match((await runner.overview('/same')).error, /being generated/);
  child.stdout.end(`${JSON.stringify({ output })}\n`); child.emit('close', 0); await first;
});

test('overview rejects JSON whose output is not a string', async () => {
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { queueMicrotask(() => { child.stdout.end('{"output":42}\n'); child.emit('close', 0); }); return child; } });
  assert.match((await runner.overview('/p')).error, /Missing output/);
});

test('overview errors when the generated file cannot be read', async () => {
  const child = fakeChild();
  const runner = new WorldCliRunner({ env: { AKARI_WORLD_CLI: '/cli.mjs' }, spawnImpl: () => { queueMicrotask(() => { child.stdout.end('{"output":"/missing/world-overview.html"}\n'); child.emit('close', 0); }); return child; } });
  assert.match((await runner.overview('/p')).error, /Could not parse/);
});

test('overview does not spawn when CLI is missing', async () => {
  let spawns = 0;
  const runner = new WorldCliRunner({ env: {}, dirnameValue: '/definitely-missing/akari-world-view', spawnImpl: () => { spawns += 1; return fakeChild(); } });
  const result = await runner.overview('/p');
  assert.equal(spawns, 0); assert.match(result.error, /CLI not found/);
});
