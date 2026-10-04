import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveResolverPreviewUrl } from '../lib/node/resolver-preview-url.js';

// resolver カタログの preview（絶対 URL または base 相対キー）+ base（リモート URL または
// ローカルディレクトリパス）から <img src> にそのまま渡せる URL を組み立てる純関数のテスト。

test('resolveResolverPreviewUrl: missing preview returns undefined', () => {
    assert.equal(resolveResolverPreviewUrl(undefined, 'https://akari.video/assets/'), undefined);
    assert.equal(resolveResolverPreviewUrl('', 'https://akari.video/assets/'), undefined);
});

test('resolveResolverPreviewUrl: absolute preview URL returns unchanged and ignores base', () => {
    const preview = 'https://cdn.example.com/x/preview.png';
    assert.equal(resolveResolverPreviewUrl(preview, 'https://akari.video/assets/'), preview);
    assert.equal(resolveResolverPreviewUrl(preview, '/local/dist-assets'), preview);
});

test('resolveResolverPreviewUrl: remote URL base makes relative keys absolute URLs', () => {
    const result = resolveResolverPreviewUrl('still/br-typing-laptop/v1/preview.png', 'https://akari.video/assets/');
    assert.equal(result, 'https://akari.video/assets/still/br-typing-laptop/v1/preview.png');
});

test('resolveResolverPreviewUrl: local directory base creates file: URIs', () => {
    const result = resolveResolverPreviewUrl('still/br-typing-laptop/v1/preview.png', '/tmp/dist-assets');
    assert.equal(result, pathToFileURL(resolve('/tmp/dist-assets', 'still/br-typing-laptop/v1/preview.png')).toString());
    assert.ok(result.startsWith('file://'));
});

test('resolveResolverPreviewUrl: relative base paths follow path.resolve rules', () => {
    const result = resolveResolverPreviewUrl('preview.png', 'dist-assets');
    assert.equal(result, pathToFileURL(resolve('dist-assets', 'preview.png')).toString());
});
