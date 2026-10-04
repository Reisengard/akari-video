import test from 'node:test';
import assert from 'node:assert/strict';
import {
    quickExportErrorNotification,
    quickExportStageLabel,
    shouldShowRenderJsonProgress
} from '../lib/common/quick-export-ui.js';

test('shouldShowRenderJsonProgress truth table for quick export phases', () => {
    const cases = [
        [undefined, true],
        ['idle', true],
        ['done', true],
        ['linting', false],
        ['rendering', false],
        ['lint-failed', false],
        ['cancelled', false],
        ['failed', false]
    ];
    for (const [phase, expected] of cases) {
        assert.equal(shouldShowRenderJsonProgress(phase), expected, `phase=${String(phase)}`);
    }
});

test('quickExportErrorNotification reports severity counts and report guidance', () => {
    const status = {
        phase: 'lint-failed',
        logTail: '',
        lintIssueCount: 2,
        lintErrorCount: 1,
        lintWarningCount: 1,
        reportPath: '.akari/reports/edit-lint-report.html'
    };
    assert.equal(
        quickExportErrorNotification(status, false),
        'Lint failed (Errors: 1 · Warnings: 1): export stopped. Open the lint report for details.'
    );
});

test('quickExportErrorNotification preserves English diagnostic details for known checks', () => {
    const status = {
        phase: 'lint-failed',
        logTail: '',
        lintIssueCount: 1,
        lintErrorCount: 1,
        lintWarningCount: 0,
        lintFindings: [{
            check: 'cuts.track-transition-unsupported',
            severity: 'error',
            message: 'gap-aware track engine cannot represent xfade'
        }]
    };
    assert.equal(
        quickExportErrorNotification(status, false),
        'Lint failed (Errors: 1 · Warnings: 0): export stopped. Check the log. ' +
            'Details: [cuts.track-transition-unsupported] gap-aware track engine cannot represent xfade'
    );
});

test('quickExportErrorNotification handles unknown checks with counts and details', () => {
    const status = {
        phase: 'lint-failed',
        logTail: '',
        lintIssueCount: 1,
        lintErrorCount: 1,
        lintWarningCount: 0,
        lintFindings: [{
            check: 'future.unknown',
            severity: 'error',
            message: 'original english detail'
        }],
        reportPath: '.akari/reports/edit-lint-report.html'
    };
    assert.equal(
        quickExportErrorNotification(status, false),
        'Lint failed (Errors: 1 · Warnings: 0): export stopped. Open the lint report for details. ' +
            'Details: [future.unknown] original english detail'
    );
});

test('quickExportErrorNotification does not repeat lint-failed notifications', () => {
    const status = {
        phase: 'lint-failed',
        logTail: '',
        lintIssueCount: 2,
        lintErrorCount: 1,
        lintWarningCount: 1
    };
    assert.equal(quickExportErrorNotification(status, true), undefined);
});

test('quickExportErrorNotification preserves failed notifications and nonterminal phases', () => {
    assert.equal(
        quickExportErrorNotification({ phase: 'failed', logTail: '', failureSummary: 'CLI not found' }, false),
        'Export failed: CLI not found'
    );
    assert.equal(quickExportErrorNotification({ phase: 'rendering', logTail: '' }, false), undefined);
    assert.equal(quickExportErrorNotification({ phase: 'done', logTail: '' }, false), undefined);
});

test('quickExportStageLabel translates the five stages to English and preserves undefined', () => {
    assert.deepEqual([
        quickExportStageLabel('prepare'),
        quickExportStageLabel('audio-cut'),
        quickExportStageLabel('render'),
        quickExportStageLabel('audio-mix'),
        quickExportStageLabel('verify'),
        quickExportStageLabel(undefined)
    ], [
        'Preparing',
        'Extracting audio',
        'Rendering and encoding video',
        'Mixing audio',
        'Verifying',
        undefined
    ]);
});
