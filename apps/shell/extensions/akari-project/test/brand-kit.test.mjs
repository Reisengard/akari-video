import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addBrandColor, BRAND_KIT_ADD_COLOR_COMMAND_ID, BRAND_KIT_GET_COMMAND_ID, BRAND_KIT_REMOVE_COLOR_COMMAND_ID, BRAND_KIT_SCHEMA,
    normalizeBrandColor, parseBrandKit, removeBrandColor, serializeBrandKit
} from '../lib/common/brand-kit.js';
import { brandKitPath, readBrandKit, updateBrandKit } from '../lib/node/brand-kit-store.js';

test('colors: normalizes #RRGGBB(AA) to uppercase and drops invalid values', () => {
    assert.equal(normalizeBrandColor('#00c4cc'), '#00C4CC');
    assert.equal(normalizeBrandColor('abc'), '#AABBCC');
    assert.equal(normalizeBrandColor('#00c4ccff'), '#00C4CC');
    assert.equal(normalizeBrandColor('#00c4cc80'), '#00C4CC80');
    for (const bad of ['', 'blue', '#12', null, 3]) assert.equal(normalizeBrandColor(bad), undefined);
});

test('read: tolerates old and broken data while deduplicating in order', () => {
    assert.deepEqual(parseBrandKit(undefined), []);
    assert.deepEqual(parseBrandKit('{broken'), []);
    assert.deepEqual(parseBrandKit('["#ff0000", "#FF0000", "bogus", "#00ff00"]'), ['#FF0000', '#00FF00']);
    assert.deepEqual(parseBrandKit(JSON.stringify({ schema: BRAND_KIT_SCHEMA, colors: ['#123456'] })), ['#123456']);
    assert.deepEqual(JSON.parse(serializeBrandKit(['#ff0000', '#ff0000'])), { schema: BRAND_KIT_SCHEMA, colors: ['#FF0000'] });
});

test('add: appends unique colors; remove deletes them', () => {
    assert.deepEqual(addBrandColor(['#FF0000'], '#00ff00'), ['#FF0000', '#00FF00']);
    assert.deepEqual(addBrandColor(['#FF0000'], '#ff0000'), ['#FF0000']);
    assert.throws(() => addBrandColor([], 'blue'));
    assert.deepEqual(removeBrandColor(['#FF0000', '#00FF00'], '#ff0000'), ['#00FF00']);
});

test('save: one AKARI_HOME/brand-kit.json shared across projects with serial writes', async () => {
    const home = await mkdtemp(join(tmpdir(), 'libcanvas-k1-brand-'));
    try {
        const file = brandKitPath({ AKARI_HOME: home });
        assert.equal(file, join(home, 'brand-kit.json'));
        assert.deepEqual(await readBrandKit(file), []);
        await Promise.all(['#111111', '#222222', '#333333'].map(color => updateBrandKit(file, 'add', color)));
        assert.deepEqual(await readBrandKit(file), ['#111111', '#222222', '#333333']);
        assert.deepEqual(await updateBrandKit(file, 'remove', '#222222'), ['#111111', '#333333']);
        assert.equal(JSON.parse(await readFile(file, 'utf8')).schema, BRAND_KIT_SCHEMA);
        await writeFile(file, '{broken');
        assert.deepEqual(await readBrandKit(file), []);
    } finally {
        await rm(home, { recursive: true, force: true });
    }
});

test('command IDs match the inspector across extensions', async () => {
    const host = await readFile(new URL('../../akari-annotations/src/browser/inspector/color-panel-host.ts', import.meta.url), 'utf8');
    for (const id of [BRAND_KIT_GET_COMMAND_ID, BRAND_KIT_ADD_COLOR_COMMAND_ID, BRAND_KIT_REMOVE_COLOR_COMMAND_ID]) {
        assert.ok(host.includes(`'${id}'`), id);
    }
});
