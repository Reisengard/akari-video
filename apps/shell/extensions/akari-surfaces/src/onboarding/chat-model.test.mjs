import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupChatLines } = require('../../lib/onboarding/chat-model.js');

test('Example prefaces are notes and requests and assistant replies use separate bubbles', () => {
    const result = groupChatLines(['This is a finished example. This video was made with the following request to AI.', '> 編集して',
        'Checking footage.', 'akari media probe file.mp4', '37 秒', 'edit.json', 'Main video added']);
    assert.equal(result.note, 'This is a finished example. This video was made with the following request to AI.');
    assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
    assert.equal(result.messages[1].lines.length, 5);
    assert.deepEqual(result.messages[1].lines.map(line => line.kind), ['text', 'code', 'text', 'code', 'text']);
});

test('Work logs group consecutive lines into one AI message', () => {
    const result = groupChatLines(['字幕を作りました', 'edit-lint .', 'No issues']);
    assert.equal(result.note, undefined);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].lines.length, 3);
});
