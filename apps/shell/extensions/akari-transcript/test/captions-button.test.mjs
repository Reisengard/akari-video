import test from 'node:test';
import assert from 'node:assert/strict';
import { captionsAppliedLine, captionsApplyHistoryLabel, captionsApplyPreviewLine, captionsButtonLabel,
    captionsRetimeHistoryLabel, captionsRetimeLine, captionsRetimeMovedWords,
    daihonHistoryService, parseCaptionsApplyPreview, setDaihonHistoryService } from '../lib/common/captions-button.js';

test('処理済みの素材がなければ連続実行の文言を表示する', () => {
    for (const states of [[], ['none'], ['running'], ['none', 'running']]) {
        assert.equal(captionsButtonLabel(states), 'Transcribe and create captions');
    }
});
test('処理済みの素材があれば字幕生成の文言を表示する', () => {
    assert.equal(captionsButtonLabel(['done']), 'Create captions');
    assert.equal(captionsButtonLabel(['none', 'done']), 'Create captions');
});

test('差分要約は5つの有限数が揃ったときだけ受理する', () => {
    const preview = { added: 12, changed: 3, protected: 2, removed: 0, total: 17 };
    assert.deepEqual(parseCaptionsApplyPreview(preview), preview);
    for (const value of [null, {}, { ...preview, total: Infinity }, { ...preview, removed: '0' }]) {
        assert.equal(parseCaptionsApplyPreview(value), undefined);
    }
});

test('差分・反映済み・履歴の文言を組み立てる', () => {
    const preview = { added: 12, changed: 3, protected: 2, removed: 0, total: 17 };
    assert.equal(captionsApplyPreviewLine(preview), 'New 12 · changed 3 · 2 edited lines protected · removed 0');
    assert.equal(captionsApplyPreviewLine({ ...preview, protected: 0 }), 'New 12 · changed 3 · removed 0');
    assert.equal(captionsAppliedLine(preview), 'Applied to the script (new 12 · changed 3)');
    assert.equal(captionsApplyHistoryLabel(preview), 'Apply to script (new 12 · changed 3)');
});

test('台本履歴サービスをモジュール単位で保持する', () => {
    const service = { push() {} };
    setDaihonHistoryService(service);
    assert.equal(daihonHistoryService(), service);
    setDaihonHistoryService(undefined);
    assert.equal(daihonHistoryService(), undefined);
});

test('発話への合わせ直し結果を検証して footer と履歴の文言を作る', () => {
    assert.equal(captionsRetimeMovedWords({ moved_words: 7 }), 7);
    for (const value of [{}, { moved_words: -1 }, { moved_words: '7' }, null]) {
        assert.equal(captionsRetimeMovedWords(value), undefined);
    }
    const cases = [
        [{ moved_words: 52 }, '52 words moved'],
        [{ moved_words: 52, clamped_pairs: 2, overlaps_left: 0 }, '52 words moved · 2 overlapping pairs resolved'],
        [{ moved_words: 3, clamped_pairs: 1, overlaps_left: 1 },
            '3 words moved · 1 overlapping pairs resolved · 1 pairs still overlap'],
        [{ moved_words: 7, clamped_pairs: '2', overlaps_left: '1' }, '7 words moved']
    ];
    for (const [summary, line] of cases) {
        const movedWords = captionsRetimeMovedWords(summary);
        assert.notEqual(movedWords, undefined);
        assert.equal(captionsRetimeLine(movedWords, summary), line);
        assert.equal(captionsRetimeHistoryLabel(movedWords), `Refit to speech (${movedWords} words)`);
    }
});
