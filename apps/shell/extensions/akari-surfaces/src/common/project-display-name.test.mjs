import assert from 'node:assert/strict';
import test from 'node:test';

// shell-version-notice.test.mjs と同じ理由でこのファイルは src/common/ に同居させている
// （`test/` は本タスクの所有パス外）。`npm run build:ext`（tsc -b）でこの隣の
// project-display-name.ts をコンパイルした後、
// `node --test src/common/project-display-name.test.mjs` として直接実行できる。
import { parseIntakeTitle, resolveProjectDisplayName } from '../../lib/common/project-display-name.js';

test('parseIntakeTitle returns a string title unchanged', () => {
    assert.equal(parseIntakeTitle({ title: '夏祭りレポート' }), '夏祭りレポート');
});

test('parseIntakeTitle returns null for null title', () => {
    assert.equal(parseIntakeTitle({ title: null }), null);
});

test('parseIntakeTitle returns null for missing title in existing projects', () => {
    assert.equal(parseIntakeTitle({ version: 1, status: 'draft' }), null);
});

test('parseIntakeTitle treats empty or whitespace-only titles as unset', () => {
    assert.equal(parseIntakeTitle({ title: '' }), null);
    assert.equal(parseIntakeTitle({ title: '   ' }), null);
});

test('parseIntakeTitle returns null for non-string titles', () => {
    assert.equal(parseIntakeTitle({ title: 123 }), null);
});

test('parseIntakeTitle handles null or undefined input without throwing', () => {
    assert.equal(parseIntakeTitle(null), null);
    assert.equal(parseIntakeTitle(undefined), null);
});

test('resolveProjectDisplayName prefers title over folder name', () => {
    assert.equal(resolveProjectDisplayName('夏祭りレポート', '2026-08-09-new-video'), '夏祭りレポート');
});

test('resolveProjectDisplayName falls back to folder name for null title', () => {
    assert.equal(resolveProjectDisplayName(null, '2026-08-09-new-video'), '2026-08-09-new-video');
});

test('resolveProjectDisplayName falls back to folder name for missing title', () => {
    assert.equal(resolveProjectDisplayName(undefined, '2026-08-08-video-13'), '2026-08-08-video-13');
});
