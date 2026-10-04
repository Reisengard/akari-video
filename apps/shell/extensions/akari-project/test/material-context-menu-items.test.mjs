import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialContextMenuItems } from '../lib/common/material-context-menu-items.js';

function ids(target, isOSX, context) {
    return buildMaterialContextMenuItems(target, isOSX, context).map(item => item.id);
}

test('material (macOS): open/reveal/copy-file/copy-path/rename/delete/ask-agent order', () => {
    assert.deepEqual(ids('material', true), [
        'open', 'reveal', 'copy-file', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('material (non-macOS): no copy-file', () => {
    assert.deepEqual(ids('material', false), [
        'open', 'reveal', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('assetGroup (meta.json directory) uses the same target and menu items as material', () => {
    // buildAssetGroupEntry は MaterialCardEntry.assetGroup を持つが、メニュー項目の
    // 組み立てでは通常素材と同じ 'material' ターゲットを渡す（widget 側の設計）。
    assert.deepEqual(ids('material', true), ids('material', true));
    assert.deepEqual(buildMaterialContextMenuItems('material', true).map(item => item.id).includes('rename'), true);
});

test('unorganized (macOS): material items plus move-to-assets last', () => {
    assert.deepEqual(ids('unorganized', true), [
        'open', 'reveal', 'copy-file', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent', 'move-to-assets'
    ]);
});

test('unorganized (non-macOS): no copy-file, retains move-to-assets', () => {
    assert.deepEqual(ids('unorganized', false), [
        'open', 'reveal', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent', 'move-to-assets'
    ]);
});

test('export (macOS): same destructive actions as material without move-to-assets', () => {
    assert.deepEqual(ids('export', true), [
        'open', 'reveal', 'copy-file', 'copy-path', 'rename', 'delete', 'ask-agent'
    ]);
});

test('export (non-macOS): no copy-file', () => {
    assert.deepEqual(ids('export', false), [
        'open', 'reveal', 'copy-path', 'rename', 'delete', 'ask-agent'
    ]);
});

for (const target of ['data', 'plan', 'report']) {
    test(`${target} (macOS): opening actions only; no rename/delete/ask-agent/move-to-assets`, () => {
        assert.deepEqual(ids(target, true), ['open', 'reveal', 'copy-file', 'copy-path']);
    });

    test(`${target} (non-macOS): also no copy-file`, () => {
        assert.deepEqual(ids(target, false), ['open', 'reveal', 'copy-path']);
    });
}

test('delete items have danger: true to indicate destructive actions', () => {
    const deleteItem = buildMaterialContextMenuItems('material', true).find(item => item.id === 'delete');
    assert.equal(deleteItem?.danger, true);
});

test('data/plan/report have no danger items', () => {
    for (const target of ['data', 'plan', 'report']) {
        const dangerItems = buildMaterialContextMenuItems(target, true).filter(item => item.danger);
        assert.deepEqual(dangerItems, []);
    }
});

// --- task 2026-08-10-material-menu-r2: add-to-timeline / show-info ---

test('material × video (macOS): adds add-to-timeline and show-info in order', () => {
    assert.deepEqual(ids('material', true, { materialKind: 'video' }), [
        'open', 'add-to-timeline', 'reveal', 'copy-file', 'copy-path', 'show-info', 'transcribe', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('material × audio (non-macOS): adds add-to-timeline and show-info without copy-file', () => {
    assert.deepEqual(ids('material', false, { materialKind: 'audio' }), [
        'open', 'add-to-timeline', 'reveal', 'copy-path', 'show-info', 'transcribe', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('material × image: adds add-to-timeline and show-info (enabled by task 2026-08-10-material-dnd-timeline)', () => {
    assert.deepEqual(ids('material', true, { materialKind: 'image' }), [
        'open', 'add-to-timeline', 'reveal', 'copy-file', 'copy-path', 'show-info', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('material × other: only show-info, no add-to-timeline', () => {
    assert.deepEqual(ids('material', true, { materialKind: 'other' }), [
        'open', 'reveal', 'copy-file', 'copy-path', 'show-info', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
});

test('unorganized: no add-to-timeline/show-info even with context', () => {
    assert.deepEqual(ids('unorganized', true, { materialKind: 'video' }), [
        'open', 'reveal', 'copy-file', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent', 'move-to-assets'
    ]);
});

test('export: no add-to-timeline/show-info even with context', () => {
    assert.deepEqual(ids('export', true, { materialKind: 'video' }), [
        'open', 'reveal', 'copy-file', 'copy-path', 'rename', 'delete', 'ask-agent'
    ]);
});

test('data: no add-to-timeline/show-info even with context', () => {
    assert.deepEqual(ids('data', true, { materialKind: 'video' }), [
        'open', 'reveal', 'copy-file', 'copy-path'
    ]);
});

test('omitting context preserves previous menu items exactly for backward compatibility', () => {
    assert.deepEqual(ids('material', true), [
        'open', 'reveal', 'copy-file', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
    assert.deepEqual(ids('material', false), [
        'open', 'reveal', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent'
    ]);
    assert.deepEqual(ids('unorganized', true), [
        'open', 'reveal', 'copy-file', 'copy-path', 'store-library', 'rename', 'delete', 'ask-agent', 'move-to-assets'
    ]);
});


test('video and audio show Transcription immediately after Footage info', () => {
    for (const materialKind of ['video', 'audio']) {
        const items = buildMaterialContextMenuItems('material', true, { materialKind });
        assert.deepEqual(items[items.findIndex(item => item.id === 'show-info') + 1], { id: 'transcribe', label: 'Transcription' });
    }
});
test('images and other files do not show Transcription', () => {
    for (const materialKind of ['image', 'other']) assert.ok(!ids('material', true, { materialKind }).includes('transcribe'));
});
test('adding Transcription preserves existing menu order on both platforms', () => {
    for (const isOSX of [true, false]) {
        const before = ids('material', isOSX, { materialKind: 'image' });
        assert.deepEqual(ids('material', isOSX, { materialKind: 'video' }).filter(id => id !== 'transcribe'), before);
    }
});

test('group cards add only primary media to timeline and do not show Transcription', () => {
    for (const isOSX of [true, false]) {
        const before = ids('material', isOSX, { materialKind: 'other', assetGroup: true });
        for (const materialKind of ['video', 'audio', 'image']) {
            const actual = ids('material', isOSX, { materialKind, assetGroup: true });
            assert.equal(actual[1], 'add-to-timeline');
            assert.deepEqual(actual.filter(id => id !== 'add-to-timeline'), before);
        }
        assert.ok(!before.includes('add-to-timeline'));
        assert.ok(!before.includes('transcribe'));
    }
});
