import assert from 'node:assert/strict';
import test from 'node:test';

// update-feed.test.mjs と同じ理由でこのファイルは src/common/ に同居させている
// （`test/` は本タスクの所有パス外）。`npm run build:ext`（tsc -b）でこの隣の
// shell-version-notice.ts をコンパイルした後、
// `node --test src/common/shell-version-notice.test.mjs` として直接実行できる。
import {
    buildReleaseNotesUrl,
    evaluateVersionNotice,
    formatVersionNoticeText,
    parseShellLastVersion,
    withRecordedVersion
} from '../../lib/common/shell-version-notice.js';

test('parseShellLastVersion returns null for malformed JSON without throwing', () => {
    assert.equal(parseShellLastVersion('{ not json'), null);
});

test('parseShellLastVersion preserves valid JSON', () => {
    const record = parseShellLastVersion(JSON.stringify({ lastVersion: '0.1.2', updatedAt: '2026-08-01T00:00:00.000Z' }));
    assert.equal(record.lastVersion, '0.1.2');
});

test('First launch without a version record does not notify', () => {
    assert.deepEqual(evaluateVersionNotice('0.1.3', null), { shouldNotify: false });
});

test('A malformed record without lastVersion does not notify', () => {
    assert.deepEqual(evaluateVersionNotice('0.1.3', { updatedAt: 'x' }), { shouldNotify: false });
});

test('The same version does not notify', () => {
    assert.deepEqual(evaluateVersionNotice('0.1.3', { lastVersion: '0.1.3' }), { shouldNotify: false });
});

test('A different version notifies with previousVersion', () => {
    const status = evaluateVersionNotice('0.1.3', { lastVersion: '0.1.2' });
    assert.equal(status.shouldNotify, true);
    assert.equal(status.previousVersion, '0.1.2');
});

test('Downgrades also notify when versions differ', () => {
    // task.md は「前回起動時と違う版」とだけ指定しており、上下方向は問わない
    // （壊れた配布 / ロールバックでの実機確認を優先する）。
    const status = evaluateVersionNotice('0.1.2', { lastVersion: '0.1.3' });
    assert.equal(status.shouldNotify, true);
    assert.equal(status.previousVersion, '0.1.3');
});

test('Version notice wording matches the task contract', () => {
    assert.equal(formatVersionNoticeText('0.2.0'), 'AKARI Video  v0.2.0 updated');
});

test('withRecordedVersion preserves version and updatedAt', () => {
    assert.deepEqual(
        withRecordedVersion('0.2.0', '2026-08-03T00:00:00.000Z'),
        { lastVersion: '0.2.0', updatedAt: '2026-08-03T00:00:00.000Z' }
    );
});

test('Release note URLs follow GitHub tag conventions', () => {
    assert.equal(buildReleaseNotesUrl('0.2.0'), 'https://github.com/AkariLabs/akari-video/releases/tag/v0.2.0');
});
