import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretCaptionsResult } from '../lib/common/captions-result.js';

test('returns captions JSON on success despite stderr guidance', () => {
    assert.deepEqual(interpretCaptionsResult(0, '{"captions":3,"path":"/tmp/captions.json"}\n', 'Declare a captions track'), { captions: 3, path: '/tmp/captions.json' });
});
test('only edited captions with exit code 1 request overwrite confirmation', () => {
    assert.deepEqual(interpretCaptionsResult(1, '', 'Edited captions exist'), { needsForce: true });
    assert.throws(() => interpretCaptionsResult(2, '', 'Edited'), /Edited/);
});
test('other failures and invalid JSON throw', () => {
    assert.throws(() => interpretCaptionsResult(1, '', 'No speech found'), /No speech found/);
    for (const stdout of ['', 'null', '[]', 'broken']) assert.throws(() => interpretCaptionsResult(0, stdout, ''));
});
