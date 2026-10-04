import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LINT_CHECK_UI,
  LINT_WARNING_SUMMARY_CHECKS,
  formatLintFailureForUi,
  japaneseLintSummary,
  japaneseLintWarningSummary,
  lintCheckFromError
} from '../lib/common/lint-message.js';

const KANA = /[\u3040-\u30ff\uff66-\uff9d]/u;

test('captions.overlap UI line is English and has no kana', () => {
  const text = LINT_CHECK_UI['captions.overlap'];
  assert.equal(text, 'Captions overlap in time. Move the caption start or end on the timeline.');
  assert.equal(KANA.test(text), false);
});

test('output-domain warning check has an English UI line', () => {
  assert.match(
    LINT_CHECK_UI['captions.output-domain-exceeds-duration'],
    /Export clamps it to the end of the video/,
  );
  assert.equal(KANA.test(LINT_CHECK_UI['captions.output-domain-exceeds-duration']), false);
});

test('a known check keeps the English detail after the short UI line', () => {
  const detail = '[cuts.track-transition-unsupported] gap-aware track engine cannot represent xfade';
  const message = formatLintFailureForUi('Validation after save found a problem', [detail], [{
    severity: 'error', check: 'cuts.track-transition-unsupported'
  }]);
  assert.match(message, /picture-in-picture or multi-track composite/);
  assert.match(message, /Details: \[cuts\.track-transition-unsupported\] gap-aware track engine/);
});

test('captions.overlap resolves from the check id in errors when findings are absent', () => {
  const detail = '[captions.overlap] caption overlaps another caption';
  assert.equal(lintCheckFromError(detail), 'captions.overlap');
  assert.equal(
    japaneseLintSummary([detail]),
    'Captions overlap in time. Move the caption start or end on the timeline.',
  );
});

test('an unknown check falls back to the original detail', () => {
  const detail = '[future.unknown] original english detail';
  assert.equal(japaneseLintSummary([detail]), undefined);
  assert.equal(
    formatLintFailureForUi('Export failed', [detail]),
    `Export failed: ${detail}`
  );
});

test('failure summary ignores warnings and does not hide an unknown error', () => {
  const warning = {
    severity: 'warning',
    check: 'cuts.transition-out.zero-overlap',
  };
  assert.equal(japaneseLintSummary([], [warning]), undefined);
  const detail = '[future.failure] actual failure detail';
  assert.equal(
    formatLintFailureForUi('Validation after save found a problem', [detail], [warning]),
    `Validation after save found a problem: ${detail}`,
  );
});

test('pass-time warning summaries stay limited to the two transition checks', () => {
  assert.deepEqual(LINT_WARNING_SUMMARY_CHECKS, [
    'cuts.transition-out.zero-overlap',
    'cuts.transition-out.layer-evacuated',
  ]);
  assert.match(japaneseLintWarningSummary([{
    severity: 'warning', check: 'cuts.transition-out.zero-overlap'
  }]), /no spare footage to overlap/u);
  assert.match(japaneseLintWarningSummary([{
    severity: 'warning', check: 'cuts.transition-out.layer-evacuated'
  }]), /picture-in-picture path/u);
  assert.equal(japaneseLintWarningSummary([{
    severity: 'warning', check: 'captions.output-domain-exceeds-duration'
  }]), undefined);
  assert.match(LINT_CHECK_UI['cuts.transition-out.layer-evacuated'], /picture-in-picture path/u);
});
