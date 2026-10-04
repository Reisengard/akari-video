import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LINT_RECHECK_WATCHED_FILES,
    formatLintCheckedAt,
    lintRecheckHint,
    shouldRecheckLintForPath,
    shouldWatchForLintRecheck
} from '../lib/common/export-lint-recheck.js';

test('shouldRecheckLintForPath triggers only on edit document changes', () => {
    assert.equal(shouldRecheckLintForPath('/project/edit.json'), true);
    assert.equal(shouldRecheckLintForPath('/project/captions.json'), true);
    assert.equal(shouldRecheckLintForPath('C:\\project\\edit.json'), true);
    assert.equal(shouldRecheckLintForPath('edit.json'), true);
    assert.equal(shouldRecheckLintForPath('/project/edit.v20.json'), true);
    assert.equal(shouldRecheckLintForPath('/project/captions.v20.json'), true);
    assert.equal(shouldRecheckLintForPath('/project/edit.bad_slug.json'), false);
    // 書き出し・レポート・素材の更新では再検査しない（lint の入力ではない）。
    assert.equal(shouldRecheckLintForPath('/project/.akari/lint.json'), false);
    assert.equal(shouldRecheckLintForPath('/project/exports/final.mp4'), false);
    assert.equal(shouldRecheckLintForPath('/project/edit.json.tmp'), false);
    assert.equal(shouldRecheckLintForPath('/project/assets/edit.json/'), true);
    assert.deepEqual([...LINT_RECHECK_WATCHED_FILES], ['edit.json', 'captions.json']);
});

test('shouldWatchForLintRecheck watches only while the lint failure screen is open', () => {
    assert.equal(shouldWatchForLintRecheck('lint-failed', true), true);
    assert.equal(shouldWatchForLintRecheck('lint-failed', false), false);
    assert.equal(shouldWatchForLintRecheck('rendering', true), false);
    assert.equal(shouldWatchForLintRecheck('done', true), false);
    assert.equal(shouldWatchForLintRecheck(undefined, true), false);
});

test('formatLintCheckedAt treats unchecked and future timestamps as Not checked', () => {
    const now = new Date('2026-09-03T12:34:56');
    assert.equal(formatLintCheckedAt(undefined, now), 'Not checked');
    assert.equal(formatLintCheckedAt(Number.NaN, now), 'Not checked');
    assert.equal(formatLintCheckedAt(now.getTime() + 600_000, now), 'Not checked');
    assert.equal(formatLintCheckedAt(new Date('2026-09-03T09:05:07').getTime(), now), '09:05:07');
});

test('lintRecheckHint switches text for checking, unchecked, and checked states', () => {
    const now = new Date('2026-09-03T12:34:56');
    assert.equal(lintRecheckHint({ rechecking: true }, now), 'Running checks again…');
    assert.equal(
        lintRecheckHint({ rechecking: false }, now),
        'Checks rerun automatically when you save the edit.'
    );
    assert.equal(
        lintRecheckHint({ rechecking: false, checkedAt: new Date('2026-09-03T12:30:00').getTime() }, now),
        'Checks rerun automatically when you save the edit (last checked 12:30:00).'
    );
});
