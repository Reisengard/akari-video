import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildEditLintArgs,
    buildLicenseInspectArgs,
    buildQuickExportEncoderChoices,
    buildRenderCutArgs,
    buildRenderCutOutputPath,
    buildRenderCutOutputRelativePath,
    describeRenderFailure,
    describeUnexpectedQuickExportFailure,
    determineLintOutcome,
    determineRenderOutcome,
    nextAvailableOutputName,
    sanitizeQuickExportOutputName,
    summarizeStderrTail
} from '../lib/common/quick-export-cli.js';

test('buildQuickExportEncoderChoices returns only supported OS encoders in order', () => {
    assert.deepEqual(buildQuickExportEncoderChoices('darwin'), [
        { label: 'Auto (default; prefer available hardware)', value: 'auto' },
        { label: 'Hardware (VideoToolbox)', value: 'videotoolbox' },
        { label: 'Software (x264)', value: 'x264' }
    ]);
    assert.deepEqual(buildQuickExportEncoderChoices('win32'), [
        { label: 'Auto (default; prefer available hardware)', value: 'auto' },
        { label: 'Hardware (NVENC)', value: 'nvenc' },
        { label: 'Hardware (QSV)', value: 'qsv' },
        { label: 'Hardware (AMF)', value: 'amf' },
        { label: 'Hardware (Media Foundation)', value: 'mf' },
        { label: 'Software (x264)', value: 'x264' }
    ]);
    assert.deepEqual(buildQuickExportEncoderChoices('linux'), [
        { label: 'Auto (default; prefer available hardware)', value: 'auto' },
        { label: 'Software (x264)', value: 'x264' }
    ]);
});

test('buildEditLintArgs includes project root and --json', () => {
    assert.deepEqual(buildEditLintArgs('/tmp/project'), ['/tmp/project', '--json']);
    assert.deepEqual(buildLicenseInspectArgs('/tmp/project'), ['/tmp/project', '--json', '--no-reports']);
});

test('sanitizeQuickExportOutputName preserves plain names', () => {
    assert.equal(sanitizeQuickExportOutputName('final.mp4'), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('  spaced.mp4  '), 'spaced.mp4');
});

test('sanitizeQuickExportOutputName removes separators and parent traversal to keep one filename', () => {
    assert.equal(sanitizeQuickExportOutputName('sub/dir/final.mp4'), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('../../etc/final.mp4'), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('..\\..\\windows\\final.mp4'), 'final.mp4');
});

test('sanitizeQuickExportOutputName falls back for empty, whitespace, and dot-only names', () => {
    assert.equal(sanitizeQuickExportOutputName(''), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('   '), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('..'), 'final.mp4');
    assert.equal(sanitizeQuickExportOutputName('../..'), 'final.mp4');
});

test('nextAvailableOutputName returns the default without existing names', () => {
    assert.equal(nextAvailableOutputName('final.mp4', []), 'final.mp4');
});

test('nextAvailableOutputName does not collide with unrelated names', () => {
    assert.equal(nextAvailableOutputName('final.mp4', ['draft.mp4']), 'final.mp4');
});

test('nextAvailableOutputName appends -2 for one collision', () => {
    assert.equal(nextAvailableOutputName('final.mp4', ['final.mp4']), 'final-2.mp4');
});

test('nextAvailableOutputName uses the first numbering gap', () => {
    assert.equal(
        nextAvailableOutputName('final.mp4', ['final.mp4', 'final-2.mp4', 'final-4.mp4']),
        'final-3.mp4'
    );
});

test('nextAvailableOutputName appends numbering without an extension', () => {
    assert.equal(nextAvailableOutputName('final', ['final', 'final-2']), 'final-3');
});

test('buildRenderCutOutputRelativePath legacy wrapper always uses exports/', () => {
    assert.equal(buildRenderCutOutputRelativePath('final.mp4'), 'exports/final.mp4');
    assert.equal(buildRenderCutOutputRelativePath('../evil.mp4'), 'exports/evil.mp4');
});

test('buildRenderCutOutputPath defaults to exports/ without outputDirectory', () => {
    assert.equal(buildRenderCutOutputPath('final.mp4'), 'exports/final.mp4');
});

test('buildRenderCutOutputPath uses an absolute outputDirectory while preventing filename escape', () => {
    assert.equal(buildRenderCutOutputPath('final.mp4', '/chosen/exports'), '/chosen/exports/final.mp4');
    assert.equal(buildRenderCutOutputPath('final.mp4', '/chosen/exports/'), '/chosen/exports/final.mp4');
    assert.equal(buildRenderCutOutputPath('../evil.mp4', '/chosen/exports'), '/chosen/exports/evil.mp4');
});

test('buildRenderCutArgs explicitly includes --engine auto and --encoder auto by default', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'my-square-export.mp4' }),
        ['/tmp/project', '--out', 'exports/my-square-export.mp4', '--engine', 'auto', '--encoder', 'auto', '--progress']
    );
});

test('buildRenderCutArgs omitted and explicit auto encoder produce identical arguments', () => {
    const encoderUnspecified = buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4' });
    const autoExplicit = buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', encoder: 'auto' });
    assert.deepEqual(encoderUnspecified, autoExplicit);
    assert.deepEqual(
        autoExplicit,
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'auto', '--encoder', 'auto', '--progress']
    );
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', quality: 'standard', encoder: 'auto' }),
        autoExplicit
    );
});

test('buildRenderCutArgs omitted and explicit auto engine produce identical arguments', () => {
    const engineUnspecified = buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4' });
    const autoExplicit = buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', engine: 'auto' });
    assert.deepEqual(engineUnspecified, autoExplicit);
});

test('buildRenderCutArgs passes --engine gpu when selected', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', engine: 'gpu' }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'gpu', '--encoder', 'auto', '--progress']
    );
});

test('buildRenderCutArgs passes --engine osr when selected', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', engine: 'osr' }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'osr', '--encoder', 'auto', '--progress']
    );
});

test('buildRenderCutArgs adds nondefault quality and preserves explicit encoder selection', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', quality: 'high' }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--quality', 'high', '--engine', 'auto', '--encoder', 'auto', '--progress']
    );
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', encoder: 'videotoolbox' }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'auto', '--encoder', 'videotoolbox', '--progress']
    );
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', quality: 'light', encoder: 'x264' }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--quality', 'light', '--engine', 'auto', '--encoder', 'x264', '--progress']
    );
});

test('buildRenderCutArgs adds --fps only when specified', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', fps: 30 }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'auto', '--encoder', 'auto', '--fps', '30', '--progress']
    );
});

test('buildRenderCutArgs adds --scale-to WxH only when specified', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', scaleTo: { width: 1280, height: 720 } }),
        ['/tmp/project', '--out', 'exports/x.mp4', '--engine', 'auto', '--encoder', 'auto', '--scale-to', '1280x720', '--progress']
    );
});

test('buildRenderCutArgs appends --progress after all options', () => {
    const args = buildRenderCutArgs('/tmp/project', {
        outputName: 'x.mp4',
        quality: 'light',
        encoder: 'videotoolbox',
        fps: 60
    });
    assert.deepEqual(
        args,
        [
            '/tmp/project', '--out', 'exports/x.mp4',
            '--quality', 'light', '--engine', 'auto', '--encoder', 'videotoolbox', '--fps', '60', '--progress'
        ]
    );
    assert.equal(args.at(-1), '--progress');
});

test('buildRenderCutArgs uses absolute --out with outputDirectory', () => {
    assert.deepEqual(
        buildRenderCutArgs('/tmp/project', { outputName: 'x.mp4', outputDirectory: '/Volumes/Backup/exports' }),
        ['/tmp/project', '--out', '/Volumes/Backup/exports/x.mp4', '--engine', 'auto', '--encoder', 'auto', '--progress']
    );
});

test('determineLintOutcome maps exit code 0/1/2/null', () => {
    assert.equal(determineLintOutcome(0), 'pass');
    assert.equal(determineLintOutcome(1), 'fail');
    assert.equal(determineLintOutcome(2), 'error');
    assert.equal(determineLintOutcome(null), 'error');
});

test('determineRenderOutcome succeeds only with exit 0 and an existing nonempty artifact', () => {
    assert.equal(determineRenderOutcome(0, { exists: true, size: 1024 }), 'success');
    assert.equal(determineRenderOutcome(1, { exists: true, size: 1024 }), 'failure');
    assert.equal(determineRenderOutcome(0, { exists: false, size: 0 }), 'failure');
    assert.equal(determineRenderOutcome(0, { exists: true, size: 0 }), 'failure');
    assert.equal(determineRenderOutcome(0, undefined), 'failure');
    assert.equal(determineRenderOutcome(null, { exists: true, size: 1024 }), 'failure');
});

test('summarizeStderrTail keeps the last N nonempty lines', () => {
    const stderr = 'line1\n\nline2\nline3\nline4\nline5\nline6\n';
    assert.equal(summarizeStderrTail(stderr, 3), 'line4\nline5\nline6');
    assert.equal(summarizeStderrTail('', 3), '');
    assert.equal(summarizeStderrTail('  \n \n', 3), '');
});

test('summarizeStderrTail preserves the root cause before the stack trace', () => {
    const stderr = [
        'wrapper failed',
        'renderer failed: browser process could not start',
        'at launch (browser.js:1:1)',
        'at run (render.js:2:2)',
        'at main (cli.js:3:3)',
        'at processTicks (task.js:4:4)',
        'at async entry (entry.js:5:5)'
    ].join('\n');
    const summary = summarizeStderrTail(stderr, 5);
    assert.match(summary, /renderer failed: browser process could not start/);
    assert.equal(summary.split('\n').length, 5);
});

test('describeRenderFailure returns a reason for missing output even with exit 0', () => {
    assert.equal(
        describeRenderFailure(0, '', 'exports/final.mp4', undefined),
        'render-cut exited successfully, but output exports/final.mp4 was not created'
    );
    assert.match(describeRenderFailure(0, '', 'exports/final.mp4', { size: 0 }), /output exports\/final\.mp4/);
});

test('describeRenderFailure includes nonzero exit code without stderr', () => {
    assert.equal(
        describeRenderFailure(2, '', 'exports/final.mp4', undefined),
        'render-cut exited with exit code 2 (no error output)'
    );
});

test('describeUnexpectedQuickExportFailure returns a nonempty reason even for unknown errors', () => {
    assert.equal(describeUnexpectedQuickExportFailure(new Error('socket closed'), 'RPC failure'), 'RPC failure: socket closed');
    assert.equal(describeUnexpectedQuickExportFailure(undefined, 'RPC failure'), 'RPC failure');
});
