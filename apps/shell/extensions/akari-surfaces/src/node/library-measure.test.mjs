import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { measureLibraryBytes } = require('../../lib/node/library-measure.js');

test('Declining migration still measures old storage without double-counting symlink targets', async t => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'akari-library-measure-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const asset = path.join(root, 'audio', 'theme');
    await fs.mkdir(asset, { recursive: true });
    await fs.writeFile(path.join(asset, 'sound.wav'), Buffer.alloc(4096));
    await fs.symlink(asset, path.join(root, 'audio', 'alias'));
    assert.equal(await measureLibraryBytes(root), 4096);
    assert.equal(await measureLibraryBytes(path.join(root, 'missing')), 0);
});
