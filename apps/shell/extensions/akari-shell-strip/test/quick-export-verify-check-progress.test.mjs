// 不具合メモ 第22項（UI 側）— 書き出し後検査の進捗が見えにくい。
//
// 88 分 4K の書き出しで、GPU のフレーム生成が終わった後 verify に約 63 分かかり、そのうち
// 黒画面検査が約 57 分（3,432,032 ms）を占めた。従来シェルへ届くのは stage=verify の
// start / end の 2 行だけだったので、その間 stageFraction は 0 のまま・ラベルは「確認」のまま
// 動かず、利用者には「レンダーが停止した」ように見えていた。
//
// render-cut 側（packages/render-cut/src/progress.mjs）が検査工程ごとの status 行と、
// 数えられる工程の frames 行を出すようになったので、シェルがそれを受け取れることを固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickExportProgressTracker } from '../lib/common/quick-export-progress.js';
import { quickExportStageLabel, quickExportVerifyCheckLabel } from '../lib/common/quick-export-ui.js';

const TOTAL_FRAMES = 158682;

function trackerAfter(lines) {
    const tracker = createQuickExportProgressTracker();
    for (const line of lines) {
        tracker.push(`${line}\n`);
    }
    return tracker.snapshot();
}

const enterVerify = [
    'PROGRESS stage=render status=end engine=gpu',
    'PROGRESS stage=audio-mix status=end',
    'PROGRESS stage=verify status=start'
];

test('Verify status lines expose the check name in the snapshot', () => {
    const snapshot = trackerAfter([...enterVerify, 'PROGRESS stage=verify check=blank-frames status=start']);
    assert.equal(snapshot.stage, 'verify');
    assert.equal(snapshot.verifyCheck, 'blank-frames');
});

test('Blank-frame check frame counts contribute to stage progress', () => {
    const half = trackerAfter([
        ...enterVerify,
        'PROGRESS stage=verify check=blank-frames status=start',
        `PROGRESS stage=verify check=blank-frames frames=${TOTAL_FRAMES / 2} total_frames=${TOTAL_FRAMES}`
    ]);
    assert.equal(half.verifyCheck, 'blank-frames');
    assert.equal(half.verifyCheckFrames, TOTAL_FRAMES / 2);
    assert.equal(half.verifyCheckTotalFrames, TOTAL_FRAMES);
    assert.ok(half.stageFraction > 0, 'Previously stuck at zero');

    // 進むほど段の進捗も単調に増える（止まって見えないことの本質）。
    const later = trackerAfter([
        ...enterVerify,
        'PROGRESS stage=verify check=blank-frames status=start',
        `PROGRESS stage=verify check=blank-frames frames=${TOTAL_FRAMES / 2} total_frames=${TOTAL_FRAMES}`,
        `PROGRESS stage=verify check=blank-frames frames=${TOTAL_FRAMES - 1} total_frames=${TOTAL_FRAMES}`
    ]);
    assert.ok(later.stageFraction > half.stageFraction);
    assert.ok(later.stageFraction <= 1);
});

test('Stage progress advances as each check completes even without frame output', () => {
    const fractions = [];
    const tracker = createQuickExportProgressTracker();
    for (const line of enterVerify) {
        tracker.push(`${line}\n`);
    }
    for (const check of ['probe', 'decode', 'audio-decode', 'audio-level', 'motion']) {
        tracker.push(`PROGRESS stage=verify check=${check} status=start\n`);
        tracker.push(`PROGRESS stage=verify check=${check} status=end\n`);
        fractions.push(tracker.snapshot().stageFraction);
    }
    for (let index = 1; index < fractions.length; index += 1) {
        assert.ok(fractions[index] > fractions[index - 1], `${index} advances progress`);
    }
});

test('Reused and skipped count as completed checks', () => {
    for (const status of ['reused', 'skipped']) {
        const snapshot = trackerAfter([
            ...enterVerify,
            'PROGRESS stage=verify check=probe status=start',
            `PROGRESS stage=verify check=probe status=${status}`
        ]);
        assert.equal(snapshot.verifyCheck, undefined, `${status} clears the check name`);
        assert.ok(snapshot.stageFraction > 0, `${status} still advances progress`);
    }
});

test('Completing verify clears check name and sets stage progress to 1', () => {
    const snapshot = trackerAfter([
        ...enterVerify,
        'PROGRESS stage=verify check=blank-frames status=start',
        `PROGRESS stage=verify check=blank-frames frames=1000 total_frames=${TOTAL_FRAMES}`,
        'PROGRESS stage=verify status=end'
    ]);
    assert.equal(snapshot.verifyCheck, undefined);
    assert.equal(snapshot.verifyCheckFrames, undefined);
    assert.equal(snapshot.stageFraction, 1);
});

test('Restarting verify resets accumulated checks', () => {
    const snapshot = trackerAfter([
        ...enterVerify,
        'PROGRESS stage=verify check=probe status=end',
        'PROGRESS stage=verify check=decode status=end',
        'PROGRESS stage=verify status=start'
    ]);
    assert.equal(snapshot.stageFraction, 0);
    assert.equal(snapshot.verifyCheck, undefined);
});

test('Existing stage/frame parsing remains unchanged', () => {
    const snapshot = trackerAfter([
        'PROGRESS stage=render status=start engine=gpu',
        'PROGRESS frame=79341 total=158682'
    ]);
    assert.equal(snapshot.stage, 'render');
    assert.equal(snapshot.engine, 'gpu');
    assert.equal(snapshot.frame, 79341);
    assert.equal(snapshot.totalFrames, 158682);
    assert.equal(snapshot.stageFraction, 0.5);
    assert.equal(snapshot.verifyCheck, undefined);
});

test('Ignore unknown check names and malformed lines', () => {
    const snapshot = trackerAfter([
        ...enterVerify,
        'PROGRESS stage=verify check=unknown-check status=start',
        'PROGRESS stage=verify check=blank-frames status=bogus',
        'PROGRESS stage=verify check=blank-frames frames=abc'
    ]);
    assert.equal(snapshot.verifyCheck, undefined);
    assert.equal(snapshot.stageFraction, 0);
});

test('Label includes the current verification check', () => {
    assert.equal(quickExportStageLabel('verify'), 'Verifying');
    assert.equal(quickExportStageLabel('verify', 'blank-frames'), 'Verifying (Checking blank frames)');
    assert.equal(quickExportStageLabel('render'), 'Rendering and encoding video');
    // 全工程に日本語ラベルがある（switch の網羅を実行時にも確かめる）。
    for (const check of [
        'probe', 'video-identity', 'decode', 'audio-decode', 'audio-level', 'motion', 'blank-frames'
    ]) {
        assert.ok(quickExportVerifyCheckLabel(check).length > 0, check);
    }
});
