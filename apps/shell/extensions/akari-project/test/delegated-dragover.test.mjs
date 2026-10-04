import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LIBRARY_DRAG_MIME,
    MATERIAL_DRAG_MIME,
    isDelegatedDragOverInput,
    isDelegatedDropInput,
    isOsFileDropInput
} from '../lib/common/delegated-drop.js';

// task 2026-09-23-finder-drop-frame: dragover だけ素材パネルへ Files を通し、
// drop の委譲規約と内部 MIME の取り込み除外は維持する。
test('delegates dragging only Files inside an OS file drop receiver', () => {
    const input = { insideDropzone: true, insideOsFileDropTarget: true, types: ['Files'] };
    assert.equal(isDelegatedDragOverInput(input), true);
    assert.equal(isDelegatedDropInput(input), false, 'video drops remain on the global path');
});

test('internal MIME with Files does not delegate as OS files', () => {
    for (const mime of [MATERIAL_DRAG_MIME, LIBRARY_DRAG_MIME]) {
        const input = { insideDropzone: true, insideOsFileDropTarget: true, types: ['Files', mime] };
        assert.equal(isOsFileDropInput(input.types), false, mime);
        assert.equal(isDelegatedDragOverInput(input), isDelegatedDropInput(input), mime);
    }
});

test('internal MIME alone follows the existing delegation rule', () => {
    for (const mime of [MATERIAL_DRAG_MIME, LIBRARY_DRAG_MIME]) {
        const input = { insideDropzone: true, insideOsFileDropTarget: false, types: [mime] };
        assert.equal(isDelegatedDragOverInput(input), isDelegatedDropInput(input), mime);
        assert.equal(isDelegatedDragOverInput(input), true, mime);
    }
});

test('dropzones that reject OS files, such as the timeline, do not delegate Files alone', () => {
    assert.equal(isDelegatedDragOverInput({
        insideDropzone: true, insideOsFileDropTarget: false, types: ['Files']
    }), false);
});

test('does not delegate Files alone outside a dropzone', () => {
    assert.equal(isDelegatedDragOverInput({
        insideDropzone: false, insideOsFileDropTarget: false, types: ['Files']
    }), false);
    assert.equal(isDelegatedDragOverInput({
        insideDropzone: false, insideOsFileDropTarget: true, types: ['Files']
    }), false);
});
