import test from 'node:test';
import assert from 'node:assert/strict';
import {
    estimateElapsedAndRemaining,
    latestQuickExportProgress,
    parseQuickExportProgressLine
} from '../lib/common/quick-export-progress.js';
import {
    createQuickExportProgressTracker,
    QUICK_EXPORT_STAGE_WEIGHTS
} from '../lib/common/quick-export-progress.js';

test('parseQuickExportProgressLine calculates percent from out_time_ms/total_ms', () => {
    assert.deepEqual(parseQuickExportProgressLine('PROGRESS out_time_ms=5000 total_ms=10000'), {
        percent: 50,
        outTimeMs: 5000,
        totalMs: 10000,
        done: false
    });
});

test('parseQuickExportProgressLine done is exactly 100%', () => {
    assert.deepEqual(parseQuickExportProgressLine('PROGRESS done total_ms=10000'), {
        percent: 100,
        outTimeMs: 10000,
        totalMs: 10000,
        done: true
    });
});

test('parseQuickExportProgressLine ignores unmatched lines as undefined', () => {
    assert.equal(parseQuickExportProgressLine(''), undefined);
    assert.equal(parseQuickExportProgressLine('PASS: exports/final.mp4'), undefined);
    assert.equal(parseQuickExportProgressLine('{"findings":[]}'), undefined);
    assert.equal(parseQuickExportProgressLine('  PROGRESS out_time_ms=abc total_ms=10  '), undefined);
});

test('parseQuickExportProgressLine total_ms=0 returns 0% without division by zero', () => {
    assert.equal(parseQuickExportProgressLine('PROGRESS out_time_ms=0 total_ms=0').percent, 0);
});

test('latestQuickExportProgress returns only the last matching line', () => {
    const text = [
        'some other stdout noise',
        'PROGRESS out_time_ms=1000 total_ms=10000',
        'PROGRESS out_time_ms=4000 total_ms=10000',
        'more noise'
    ].join('\n');
    assert.deepEqual(latestQuickExportProgress(text), {
        percent: 40,
        outTimeMs: 4000,
        totalMs: 10000,
        done: false
    });
});

test('latestQuickExportProgress returns undefined without a matching line', () => {
    assert.equal(latestQuickExportProgress('nothing here\nor here'), undefined);
});

test('estimateElapsedAndRemaining done/100% has zero remaining time', () => {
    const snapshot = { percent: 100, outTimeMs: 10000, totalMs: 10000, done: true };
    assert.deepEqual(estimateElapsedAndRemaining(snapshot, 12345), { elapsedMs: 12345, remainingMs: 0 });
});

test('estimateElapsedAndRemaining 0% cannot estimate remaining time', () => {
    const snapshot = { percent: 0, outTimeMs: 0, totalMs: 10000, done: false };
    assert.deepEqual(estimateElapsedAndRemaining(snapshot, 500), { elapsedMs: 500, remainingMs: undefined });
});

test('estimateElapsedAndRemaining extrapolates 4 seconds remaining after 4 seconds at 50%', () => {
    const snapshot = { percent: 50, outTimeMs: 5000, totalMs: 10000, done: false };
    const result = estimateElapsedAndRemaining(snapshot, 4000);
    assert.equal(result.elapsedMs, 4000);
    assert.equal(result.remainingMs, 4000);
});

test('estimateElapsedAndRemaining estimates 9 seconds remaining after 3 seconds at 25%', () => {
    const snapshot = { percent: 25, outTimeMs: 2500, totalMs: 10000, done: false };
    const result = estimateElapsedAndRemaining(snapshot, 3000);
    assert.equal(result.remainingMs, 9000);
});

test('Tracker advances weighted percent per render frame line', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push([
        'PROGRESS stage=prepare status=start',
        'PROGRESS stage=prepare status=end',
        'PROGRESS stage=audio-cut status=start',
        'PROGRESS stage=audio-cut status=end',
        'PROGRESS stage=render status=start engine=gpu',
        ''
    ].join('\n'));

    for (const frame of [1, 2, 3]) {
        tracker.push(`PROGRESS frame=${frame} total=10\n`);
        const snapshot = tracker.snapshot();
        assert.equal(snapshot.stage, 'render');
        assert.equal(snapshot.frame, frame);
        assert.equal(snapshot.totalFrames, 10);
        assert.equal(snapshot.percent, Math.round(100 * (
            QUICK_EXPORT_STAGE_WEIGHTS.prepare
            + QUICK_EXPORT_STAGE_WEIGHTS['audio-cut']
            + QUICK_EXPORT_STAGE_WEIGHTS.render * frame / 10
        )));
    }
});

test('Tracker reaches 100% only on the overall done line', () => {
    const tracker = createQuickExportProgressTracker();
    const beforeDone = [
        'PROGRESS stage=prepare status=start',
        'PROGRESS stage=prepare status=end',
        'PROGRESS stage=audio-cut status=start',
        'PROGRESS stage=audio-cut status=end',
        'PROGRESS stage=render status=start engine=gpu',
        'PROGRESS frame=10 total=10',
        'PROGRESS stage=render status=end',
        'PROGRESS stage=audio-mix status=start',
        'PROGRESS stage=audio-mix status=end',
        'PROGRESS stage=verify status=start',
        'PROGRESS stage=verify status=end'
    ];
    for (const line of beforeDone) {
        tracker.push(`${line}\n`);
        assert.notEqual(tracker.snapshot().percent, 100, line);
    }
    tracker.push('PROGRESS done total_ms=10000\n');
    assert.equal(tracker.snapshot().percent, 100);
    assert.equal(tracker.snapshot().done, true);
});

test('Tracker percent does not regress when render restarts from GPU to OSR', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push([
        'PROGRESS stage=prepare status=end',
        'PROGRESS stage=audio-cut status=end',
        'PROGRESS stage=render status=start engine=gpu',
        'PROGRESS frame=8 total=10',
        ''
    ].join('\n'));
    const gpuPercent = tracker.snapshot().percent;

    tracker.push('PROGRESS stage=render status=start engine=osr\n');
    assert.equal(tracker.snapshot().frame, 0);
    assert.equal(tracker.snapshot().engine, 'osr');
    assert.equal(tracker.snapshot().percent, gpuPercent);
    tracker.push('PROGRESS frame=1 total=10\n');
    assert.equal(tracker.snapshot().percent, gpuPercent);
});

test('Tracker parses a frame line split across chunks after completion', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push('PROGRESS stage=render status=start engine=gpu\n');
    tracker.push('PROGRESS fra');
    assert.equal(tracker.snapshot().frame, 0);
    tracker.push('me=3 total=10\n');
    assert.equal(tracker.snapshot().frame, 3);
    assert.equal(tracker.snapshot().totalFrames, 10);
});

test('Tracker uses legacy percent for out_time_ms without a stage line', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push('PROGRESS out_time_ms=4000 total_ms=10000\n');
    assert.deepEqual(tracker.snapshot(), {
        percent: 40,
        outTimeMs: 4000,
        totalMs: 10000,
        done: false
    });
});

test('Tracker retains render stage after 300 frame lines', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push('PROGRESS stage=render status=start engine=osr\n');
    for (let frame = 1; frame <= 300; frame += 1) {
        tracker.push(`PROGRESS frame=${frame} total=300\n`);
    }
    assert.equal(tracker.snapshot().stage, 'render');
    assert.equal(tracker.snapshot().frame, 300);
    assert.equal(tracker.snapshot().totalFrames, 300);
});

test('estimateElapsedAndRemaining uses measured render time per frame', () => {
    const snapshot = {
        percent: 50,
        outTimeMs: 0,
        totalMs: 0,
        done: false,
        stage: 'render',
        frame: 10,
        totalFrames: 100
    };
    const result = estimateElapsedAndRemaining(snapshot, 3000, { startedAtMs: 1000, nowMs: 3000 });
    assert.deepEqual(result, { elapsedMs: 3000, remainingMs: 11905 });
});

test('Tracker keeps GPU preview as the latest actual frame', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push('PROGRESS preview=30 path=/project/.akari/cache/export-preview/30.jpg\n');
    assert.deepEqual(tracker.snapshot(), {
        percent: 0,
        outTimeMs: 0,
        totalMs: 0,
        done: false,
        previewFrame: 30,
        previewPath: '/project/.akari/cache/export-preview/30.jpg'
    });
});

test('Tracker retains preview and progress when frame lines follow GPU preview', () => {
    const tracker = createQuickExportProgressTracker();
    tracker.push('PROGRESS stage=render status=start engine=gpu\n');
    tracker.push('PROGRESS preview=30 path=/project/.akari/cache/export-preview/30.jpg\n');
    tracker.push('PROGRESS frame=45 total=90\n');
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.previewFrame, 30);
    assert.equal(snapshot.previewPath, '/project/.akari/cache/export-preview/30.jpg');
    assert.equal(snapshot.percent, 42);
    assert.equal(snapshot.stage, 'render');
    assert.equal(snapshot.frame, 45);
    assert.equal(snapshot.totalFrames, 90);
    assert.equal(snapshot.engine, 'gpu');
});
