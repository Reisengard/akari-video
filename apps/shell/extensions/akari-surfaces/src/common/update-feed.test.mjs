import assert from 'node:assert/strict';
import test from 'node:test';

// このファイルはあえて `src/common/` に同居させている（`test/` は本タスクの
// 編集境界外 — task.md 所有パスは `apps/shell/extensions/akari-surfaces/src/` のみ）。
// node --test は既定でリポジトリ全体を再帰探索し、場所によらず `*.test.mjs` を
// 拾うため、`npm run build:ext`（tsc -b）でこの隣の update-feed.ts をコンパイルした
// 後に `node --test src/common/update-feed.test.mjs` として直接実行できる。
import {
    compareVersions,
    evaluateUpdateStatus,
    formatHomeBannerText,
    isValidFeedShape,
    parseUpdateCache,
    resolveUpdateDownloadUrl,
    resolveUpdateSizeLabel,
    withDismissedVersion,
    withFetchedFeed
} from '../../lib/common/update-feed.js';

const VALID_FEED = {
    schema: 1,
    product: '0.2.0',
    channel: 'prerelease',
    notes_url: 'https://github.com/AkariLabs/akari-video/releases/tag/v0.2.0',
    components: { cli: { version: '0.2.0' } }
};

// 実スキーマ（scripts/release/gen-latest-json.mjs が生成する latest.json）どおり
// components.shell.mac/win/win_zip を持つフィード（F7-v1 のテスト用）。
const FEED_WITH_SHELL_ASSETS = {
    ...VALID_FEED,
    components: {
        ...VALID_FEED.components,
        shell: {
            version: '0.2.0',
            mac: { url: 'https://github.com/AkariLabs/akari-video/releases/download/v0.2.0/shell-mac.zip', sha256: 'aaa' },
            win: { url: 'https://github.com/AkariLabs/akari-video/releases/download/v0.2.0/shell-win-setup.exe', sha256: 'bbb' },
            win_zip: { url: 'https://github.com/AkariLabs/akari-video/releases/download/v0.2.0/shell-win.zip', sha256: 'ccc' }
        }
    }
};

test('compareVersions compares major, minor, and patch numerically', () => {
    assert.equal(compareVersions('0.2.0', '0.1.0'), 1);
    assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
    assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
    assert.equal(compareVersions('0.10.0', '0.9.0'), 1, '桁数の異なるCharacters列比較にならないこと');
});

test('Feed shape requires matching schema and product', () => {
    assert.equal(isValidFeedShape(VALID_FEED), true);
    assert.equal(isValidFeedShape({ schema: 1 }), false, 'product が無ければ false');
    assert.equal(isValidFeedShape(null), false);
    assert.equal(isValidFeedShape('not an object'), false);
});

test('parseUpdateCache returns null for malformed JSON without throwing', () => {
    assert.equal(parseUpdateCache('{ not json'), null);
});

test('parseUpdateCache preserves valid JSON', () => {
    const cache = parseUpdateCache(JSON.stringify({ schema: 1, feed: VALID_FEED, dismissed: {} }));
    assert.equal(cache.feed.product, '0.2.0');
});

test('New undismissed versions are available', () => {
    const cache = { schema: 1, fetched_at: '2026-07-26T00:00:00.000Z', feed: VALID_FEED, dismissed: {} };
    const status = evaluateUpdateStatus('0.1.0', cache);
    assert.equal(status.available, true);
    assert.equal(status.latestVersion, '0.2.0');
    assert.equal(status.channel, 'prerelease');
    assert.equal(status.notesUrl, VALID_FEED.notes_url);
});

test('Same or older versions are unavailable', () => {
    const sameCache = { schema: 1, feed: { ...VALID_FEED, product: '0.1.0' }, dismissed: {} };
    assert.equal(evaluateUpdateStatus('0.1.0', sameCache).available, false);
});

test('Dismissed versions are unavailable', () => {
    const cache = { schema: 1, feed: VALID_FEED, dismissed: { '0.2.0': '2026-07-26T01:00:00.000Z' } };
    const status = evaluateUpdateStatus('0.1.0', cache);
    assert.equal(status.available, false);
    assert.equal(status.dismissed, true);
});

test('optional summary, size and notes are available to the toast, including dismissed history', () => {
    const feed = { ...VALID_FEED, summary: '設定と右のアイコン列を整理', size_bytes: 180_000_000 };
    const available = evaluateUpdateStatus('0.1.0', { feed }, 'mac');
    assert.equal(available.summary, feed.summary);
    assert.equal(available.sizeLabel, '180 MB');
    assert.equal(available.notesUrl, feed.notes_url);
    const dismissed = evaluateUpdateStatus('0.1.0', { feed, dismissed: { '0.2.0': 'now' } }, 'mac');
    assert.equal(dismissed.available, false);
    assert.equal(dismissed.summary, feed.summary);
    assert.equal(dismissed.sizeLabel, '180 MB');
    assert.equal(resolveUpdateSizeLabel({ ...VALID_FEED, size: '180 MB' }, 'mac'), '180 MB');
});

test('Missing update caches are unavailable without throwing', () => {
    assert.equal(evaluateUpdateStatus('0.1.0', null).available, false);
});

test('Malformed feeds without product are unavailable', () => {
    const cache = { schema: 1, feed: { schema: 1 }, dismissed: {} };
    assert.equal(evaluateUpdateStatus('0.1.0', cache).available, false);
});

test('Platform-aware updates use the platform distribution URL', () => {
    const cache = { schema: 1, feed: FEED_WITH_SHELL_ASSETS, dismissed: {} };
    assert.equal(evaluateUpdateStatus('0.1.0', cache, 'mac').downloadUrl, FEED_WITH_SHELL_ASSETS.components.shell.mac.url);
    assert.equal(evaluateUpdateStatus('0.1.0', cache, 'win').downloadUrl, FEED_WITH_SHELL_ASSETS.components.shell.win.url);
});

test('Missing platform or distribution URLs fall back to release notes', () => {
    const cache = { schema: 1, feed: FEED_WITH_SHELL_ASSETS, dismissed: {} };
    assert.equal(evaluateUpdateStatus('0.1.0', cache).downloadUrl, FEED_WITH_SHELL_ASSETS.notes_url);
    const noAssetsCache = { schema: 1, feed: VALID_FEED, dismissed: {} };
    assert.equal(evaluateUpdateStatus('0.1.0', noAssetsCache, 'mac').downloadUrl, VALID_FEED.notes_url);
});

test('Download URL resolution prefers the platform distribution', () => {
    assert.equal(resolveUpdateDownloadUrl(FEED_WITH_SHELL_ASSETS, 'mac'), FEED_WITH_SHELL_ASSETS.components.shell.mac.url);
});

test('Download URL resolution falls back to release notes', () => {
    assert.equal(resolveUpdateDownloadUrl(VALID_FEED, 'mac'), VALID_FEED.notes_url);
    assert.equal(resolveUpdateDownloadUrl(FEED_WITH_SHELL_ASSETS, undefined), FEED_WITH_SHELL_ASSETS.notes_url);
});

test('Download URL resolution returns undefined without a feed', () => {
    assert.equal(resolveUpdateDownloadUrl(null, 'mac'), undefined);
    assert.equal(resolveUpdateDownloadUrl(undefined, undefined), undefined);
});

test('Home prerelease banners include prerelease wording', () => {
    const text = formatHomeBannerText({ available: true, latestVersion: '0.2.0', channel: 'prerelease' });
    assert.equal(text, 'AKARI Video v0.2.0(Prerelease) is available');
});

test('Stable home banners omit version channel notes', () => {
    const text = formatHomeBannerText({ available: true, latestVersion: '0.2.0', channel: 'stable' });
    assert.equal(text, 'AKARI Video v0.2.0 is available');
});

test('Unavailable home banners are empty', () => {
    assert.equal(formatHomeBannerText({ available: false }), '');
});

test('Dismissal preserves other cache fields including the feed', () => {
    const cache = { schema: 1, fetched_at: 't', feed: VALID_FEED, dismissed: { '0.1.0': 'x' } };
    const next = withDismissedVersion(cache, '0.2.0', '2026-07-26T02:00:00.000Z');
    assert.deepEqual(next.dismissed, { '0.1.0': 'x', '0.2.0': '2026-07-26T02:00:00.000Z' });
    assert.equal(next.feed.product, '0.2.0');
});

test('Dismissal can create a cache from null', () => {
    const next = withDismissedVersion(null, '0.2.0', '2026-07-26T02:30:00.000Z');
    assert.deepEqual(next.dismissed, { '0.2.0': '2026-07-26T02:30:00.000Z' });
});

test('Fetched feeds replace the feed while preserving dismissal', () => {
    const existing = { schema: 1, fetched_at: 'old', feed: null, dismissed: { '0.1.0': 'x' } };
    const next = withFetchedFeed(existing, VALID_FEED, '2026-07-26T03:00:00.000Z');
    assert.equal(next.feed.product, '0.2.0');
    assert.deepEqual(next.dismissed, { '0.1.0': 'x' });
    assert.equal(next.fetched_at, '2026-07-26T03:00:00.000Z');
});
