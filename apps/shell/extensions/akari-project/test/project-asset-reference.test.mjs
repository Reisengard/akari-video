import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordProjectReference } from '../../../../../packages/asset-resolver/src/project-references.mjs';
import { resolveProjectAssetPath, projectReferenceMediaUris, listProjectReferenceAssets } from '../../../../../packages/asset-resolver/src/shell-reference.mjs';
import { assetResolveOutcome, referencePresentation, restrictedReferenceCount } from '../lib/common/project-asset-reference.js';
import { buildMaterialContextMenuItems } from '../lib/common/material-context-menu-items.js';

async function fixture(t) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'reference-shell-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    const project = join(root, 'project'), library = join(root, 'library'), home = join(root, 'home');
    const env = { AKARI_HOME: home, AKARI_LIBRARY_ROOT: library, AKARI_CREATOR_ROOT: join(root, 'creator') };
    await mkdir(project);
    const put = async (base, name, value = 'media') => { const p = join(base, name); await mkdir(join(p, '..'), { recursive: true }); await writeFile(p, value); return p; };
    return { root, project, library, home, env, put, declared: 'assets/audio/sample/sound.wav' };
}

test('return type: all reference, existing copy, and failure branches', () => {
    assert.deepEqual(assetResolveOutcome({ success: true, referenced: true, dir: '/library/audio/x' }, '/project/assets/audio/x'),
        { success: true, reference: true, libraryDir: '/library/audio/x', projectAssetPath: '/project/assets/audio/x' });
    assert.deepEqual(assetResolveOutcome({ success: true, projectDir: '/old' }, '/unused'), { success: true, projectAssetPath: '/old' });
    assert.equal(assetResolveOutcome({ success: true }, '/unused').success, false);
    assert.deepEqual(assetResolveOutcome({ success: false, error: 'offline' }, '/unused'), { success: false, error: 'offline' });
});

test('node resolution: physical files win; no registry means unresolved; two storage roots sort newest first', async t => {
    const f = await fixture(t);
    const newer = await f.put(f.library, 'audio/sample/sound.wav', 'new');
    const older = await f.put(join(f.home, 'assets'), 'audio/sample/sound.wav', 'old');
    assert.equal(await resolveProjectAssetPath(f.project, f.declared, f.env), null);
    await recordProjectReference(f.project, { category: 'audio', id: 'sample' });
    assert.equal(await resolveProjectAssetPath(f.project, f.declared, f.env), newer);
    await rm(newer);
    assert.equal(await resolveProjectAssetPath(f.project, f.declared, f.env), older);
    const local = await f.put(f.project, f.declared, 'copy-era');
    assert.equal(await resolveProjectAssetPath(f.project, f.declared, f.env), local);
    assert.equal((await projectReferenceMediaUris(f.project, f.env))[f.declared], pathToFileURL(local).href);
});

test('node resolution: rejects lexical traversal and Library/project symlink escapes', async t => {
    const f = await fixture(t);
    await recordProjectReference(f.project, { category: 'audio', id: 'sample' });
    const outside = await f.put(f.root, 'outside.wav');
    await mkdir(join(f.library, 'audio/sample'), { recursive: true });
    await symlink(outside, join(f.library, 'audio/sample/sound.wav'));
    assert.equal(await resolveProjectAssetPath(f.project, f.declared, f.env), null);
    await assert.rejects(resolveProjectAssetPath(f.project, 'assets/audio/sample/../../../outside.wav', f.env), /素材パスがプロジェクトの外を指しています/);
    await mkdir(join(f.project, 'assets/audio/sample'), { recursive: true });
    await symlink(outside, join(f.project, f.declared));
    await assert.rejects(resolveProjectAssetPath(f.project, f.declared, f.env), /素材パスがプロジェクトの外を指しています/);
    await rm(join(f.project, 'assets'), { recursive: true });
    await symlink(f.library, join(f.project, 'assets'));
    await assert.rejects(resolveProjectAssetPath(f.project, 'assets/audio/sample/absent.wav', f.env), /素材パスがプロジェクトの外を指しています/);
});

test('registry returns both downloaded and missing references as card inputs', async t => {
    const f = await fixture(t);
    await recordProjectReference(f.project, { category: 'audio', id: 'sample' });
    await recordProjectReference(f.project, { category: 'still', id: 'missing' });
    await f.put(f.library, 'audio/sample/sound.wav');
    const entries = await listProjectReferenceAssets(f.project, f.env);
    assert.equal(entries.length, 2);
    assert.equal(referencePresentation(entries[0]).badge, 'Reference');
    assert.equal(referencePresentation(entries[1]).badge, 'Not found');
    assert.equal(referencePresentation(entries[1]).recovery, 'Please add it again');
    assert.equal(referencePresentation(entries[1], true).recovery, 'Download again');
});

// 2026-09-26 オーナー指示: 参照カードでも素材カードと同じ操作ができるようにする
// （実体がライブラリ側にあるだけで素材であることは変わらない）。rename / delete /
// assets へ移動だけは参照に意味が無いので出さない。
test('reference menus expose the same Footage actions except destructive ones', () => {
    assert.deepEqual(buildMaterialContextMenuItems('material', true, { reference: true, assetGroup: true, materialKind: 'audio' }).map(item => item.label),
        ['Open', 'Add to timeline', 'View in library', 'Show asset information', 'Show in Finder', 'Copy file', 'Copy path',
            'Ask agent…', 'Remove from this project']);
    // macOS 以外では「ファイルをコピー」を出さない（素材カードと同じ規則）。
    assert.ok(!buildMaterialContextMenuItems('material', false, { reference: true, materialKind: 'audio' })
        .some(item => item.id === 'copy-file'));
    // other 種別はタイムラインに置けないので出さない。
    assert.ok(!buildMaterialContextMenuItems('material', true, { reference: true, materialKind: 'other' })
        .some(item => item.id === 'add-to-timeline'));
});

test('references missing physical files show Redownload first and omit file actions', () => {
    const labels = buildMaterialContextMenuItems('material', true, { reference: true, missing: true, materialKind: 'audio' });
    assert.deepEqual(labels.map(item => item.id),
        ['retry-reference', 'view-library', 'show-info', 'ask-agent', 'remove-reference']);
});

test('pre-collection warning count is the union of own/site/subscription without duplicates', () => {
    const entry = tags => ({ category: 'audio', id: 'sample', tags, files: [] });
    assert.equal(restrictedReferenceCount([
        entry([]), entry(['origin:own']), entry(['origin:site', 'license:subscription']), entry(['license:subscription']),
        { ...entry([]), sourceKind: 'own' }, { ...entry([]), sourceKind: 'lab' }
    ]), 4);
});
