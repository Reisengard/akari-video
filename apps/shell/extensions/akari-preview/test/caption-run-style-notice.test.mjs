import test from 'node:test';
import assert from 'node:assert/strict';
import { captionRunOmittedNotice } from '../lib/common/caption-run-style-notice.js';

test('範囲に写せない見た目は利用者向けの語で一行にする', () => {
    assert.equal(captionRunOmittedNotice(['background', 'shadow', 'animation', 'shadow']),
        'Left out appearance settings that cannot apply to a text range: Background, Shadow, Motion');
    assert.equal(captionRunOmittedNotice(['future_filter']),
        'Left out appearance settings that cannot apply to a text range: Other appearance');
    assert.equal(captionRunOmittedNotice([]), undefined);
});
