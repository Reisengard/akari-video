import test from 'node:test';
import assert from 'node:assert/strict';
import { toFileUrl } from '../lib/common/file-url.js';

test('toFileUrl: percent-encodes paths containing spaces', () => {
    assert.equal(toFileUrl('/tmp/videos/My Video.mp4'), 'file:///tmp/videos/My%20Video.mp4');
});

test('toFileUrl: percent-encodes paths containing non-ASCII characters', () => {
    assert.equal(
        toFileUrl('/tmp/videos/café/clip.mp4'),
        'file:///tmp/videos/%E7%B4%A0%E6%9D%90/%E3%82%AF%E3%83%AA%E3%83%83%E3%83%97.mp4'
    );
});

test('toFileUrl: handles directory names containing spaces', () => {
    assert.equal(toFileUrl('/tmp/a b/c.mp4'), 'file:///tmp/a%20b/c.mp4');
});
