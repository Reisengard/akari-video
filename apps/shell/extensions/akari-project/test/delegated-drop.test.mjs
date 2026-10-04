import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LIBRARY_DRAG_MIME,
    MATERIAL_DRAG_MIME,
    isDelegatedDropInput
} from '../lib/common/delegated-drop.js';

// task 2026-09-08-timeline-file-drop 指示14 / issue #63。
// 委譲判定は「dropzone の内側か」だけを見ていたため、OS からのファイルドロップまで
// 委譲され、委譲先（自 MIME 以外を無視して return する）との間で落ちて無反応になっていた。
// (b) が本 issue の核 — Files だけのドロップは委譲せず、グローバル経路が拾う。

test('(a) internal MIME + inside dropzone → true (delegates Footage card D&D)', () => {
    assert.equal(isDelegatedDropInput({
        insideDropzone: true, types: [MATERIAL_DRAG_MIME]
    }), true);
    assert.equal(isDelegatedDropInput({
        insideDropzone: true, types: [LIBRARY_DRAG_MIME]
    }), true);
});

test('(b) Files only + inside dropzone → false (global path handles OS file drops)', () => {
    assert.equal(isDelegatedDropInput({
        insideDropzone: true, types: ['Files']
    }), false);
});

test('(c) outside dropzone → false', () => {
    assert.equal(isDelegatedDropInput({
        insideDropzone: false, types: ['Files']
    }), false);
    assert.equal(isDelegatedDropInput({
        insideDropzone: false, types: [] }), false);
});

test('(d) internal MIME + outside dropzone → false', () => {
    assert.equal(isDelegatedDropInput({
        insideDropzone: false, types: [MATERIAL_DRAG_MIME]
    }), false);
});

test('delegates when Files and internal MIME are both present (observed internal drag format)', () => {
    assert.equal(isDelegatedDropInput({
        insideDropzone: true, types: ['Files', MATERIAL_DRAG_MIME]
    }), true);
});
