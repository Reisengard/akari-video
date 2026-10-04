import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizePreviewError } from '../lib/common/preview-error-summary.js';

test('エラー要旨は先頭行だけを空白正規化しスタック断片を除く', () => {
    assert.equal(
        summarizePreviewError(new Error('  source.path   が不正です  \n    at load (preview.js:12:4)')),
        'source.path が不正です'
    );
    assert.equal(
        summarizePreviewError(new Error('読み込み失敗 at loadPreview (preview.js:12:4)')),
        '読み込み失敗'
    );
    assert.equal(summarizePreviewError({ code: 7 }), 'Unknown error.');
});

test('JSON.parse の SyntaxError は edit.json の文脈を付ける', () => {
    const error = new SyntaxError("Expected property name or '}' in JSON at position 1 (line 1 column 2)");
    assert.equal(
        summarizePreviewError(error),
        "Could not read edit.json as JSON (Expected property name or '}' in JSON at position 1 (line 1 column 2))"
    );
});

test('要旨は 160 文字以内へ省略し空なら既定文言へ落とす', () => {
    const summary = summarizePreviewError(new Error('x'.repeat(200)));
    assert.equal(summary.length, 160);
    assert.ok(summary.endsWith('…'));
    assert.equal(summarizePreviewError(new Error(' \n at load (preview.js:1:2)')), 'Unknown error.');
    assert.equal(summarizePreviewError(null), 'Unknown error.');
    assert.equal(summarizePreviewError(undefined), 'Unknown error.');
});
