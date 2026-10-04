import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// update-feed.test.mjs と同じ流儀（`src/common/` 同居 — task.md 所有パス境界のため
// `test/` へは置けない）。`npm run build:ext`（tsc -b）で隣の shell-update-applier.ts を
// コンパイルした後、`node --test` が拾って直接実行できる。
import { fileURLToPath } from 'node:url';
import { generateAppUpdateYml } from '../../../../../../scripts/release/gen-app-update-yml.mjs';
import {
    applyImmediateUpdaterFallback,
    applyShellUpdaterEvent,
    beginUserInitiatedUpdaterCheck,
    buildFallbackAppUpdateYml,
    checkForShellUpdatesOnHomeShow,
    formatDownloadedBannerText,
    formatDownloadingBannerText,
    formatUpdaterFallbackText,
    FALLBACK_APP_UPDATE_YML_FILENAME,
    FALLBACK_FEED_OPTIONS,
    FALLBACK_UPDATER_CACHE_DIR_NAME,
    INITIAL_SHELL_UPDATER_UI_STATE,
    isAppTranslocationPath,
    reconcileVisibleUpdateEvent,
    resolveManualUpdaterCheckEvent,
    resolveAllowPrerelease,
    resolveShellUpdaterErrorReason,
    resolveUpdaterCheckChannel,
    resolveUpdaterFeedChannel,
    resolveUpdateButtonAction,
    resolveUpdateChannel,
    resolveUpdateUiEnabled,
    shouldApplyFeedUrlFallback,
    shouldOpenUpdaterBrowserFallback
} from '../../lib/common/shell-update-applier.js';

test('Update UI is enabled in packaged builds and development builds with an explicit feed', () => {
    assert.equal(resolveUpdateUiEnabled({ isPackaged: true, feedUrlOverridden: false, testFeedUrlSet: false }), true);
    assert.equal(resolveUpdateUiEnabled({ isPackaged: false, feedUrlOverridden: false, testFeedUrlSet: false }), false);
    assert.equal(resolveUpdateUiEnabled({ isPackaged: false, feedUrlOverridden: true, testFeedUrlSet: false }), true);
    assert.equal(resolveUpdateUiEnabled({ isPackaged: false, feedUrlOverridden: false, testFeedUrlSet: true }), true);
});

test('Packaged builds retain update UI and browser fallback regardless of feed configuration', () => {
    for (const feedUrlOverridden of [false, true]) {
        for (const testFeedUrlSet of [false, true]) {
            assert.equal(resolveUpdateUiEnabled({ isPackaged: true, feedUrlOverridden, testFeedUrlSet }), true);
        }
    }
    const checking = beginUserInitiatedUpdaterCheck(INITIAL_SHELL_UPDATER_UI_STATE);
    const error = { kind: 'error', reason: 'update failed' };
    const updateUiEnabled = resolveUpdateUiEnabled({ isPackaged: true, feedUrlOverridden: false, testFeedUrlSet: false });
    assert.equal(shouldOpenUpdaterBrowserFallback(checking, error, updateUiEnabled), true);
    assert.equal(shouldOpenUpdaterBrowserFallback(checking, error, updateUiEnabled), shouldOpenUpdaterBrowserFallback(checking, error));
});

test('Development without a feed never opens a browser after an update error', () => {
    const updateUiEnabled = resolveUpdateUiEnabled({ isPackaged: false, feedUrlOverridden: false, testFeedUrlSet: false });
    const checking = beginUserInitiatedUpdaterCheck(INITIAL_SHELL_UPDATER_UI_STATE);
    const error = { kind: 'error', reason: 'In-app updates are unavailable in this build' };
    let browserOpens = 0;
    if (shouldOpenUpdaterBrowserFallback(checking, error, updateUiEnabled)) { browserOpens += 1; }
    assert.equal(browserOpens, 0);
});

test('Feed URL fallback applies only to packaged builds missing app-update.yml', () => {
    assert.equal(shouldApplyFeedUrlFallback(true, true), false);
    assert.equal(shouldApplyFeedUrlFallback(true, false), true);
    assert.equal(shouldApplyFeedUrlFallback(false, true), false);
    assert.equal(shouldApplyFeedUrlFallback(false, false), false);
    assert.deepEqual(FALLBACK_FEED_OPTIONS, {
        provider: 'generic',
        url: 'https://github.com/AkariLabs/akari-video/releases/download/updates/'
    });
});

test('Fallback app-update.yml matches generator bytes including updaterCacheDirName', async () => {
    const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url));
    assert.equal(buildFallbackAppUpdateYml(), await generateAppUpdateYml({ repoRoot }));
    assert.equal(FALLBACK_UPDATER_CACHE_DIR_NAME, '@akari-videoshell-updater');
    assert.equal(FALLBACK_APP_UPDATE_YML_FILENAME, 'app-update.yml');
});

test('update-downloaded records downloaded state and version for the restart button', () => {
    const next = applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-downloaded', version: '0.2.0' });
    assert.deepEqual(next, { downloaded: true, downloadedVersion: '0.2.0' });
});

test('update-downloaded ignores malformed payloads without a version', () => {
    const next = applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-downloaded' });
    assert.deepEqual(next, INITIAL_SHELL_UPDATER_UI_STATE);
});

test('update-available displays downloading state for autoDownload', () => {
    const next = applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-available', version: '0.2.0' });
    assert.deepEqual(next, { downloaded: false, downloading: true, downloadingVersion: '0.2.0' });
});

test('update-available ignores malformed payloads without a version', () => {
    assert.deepEqual(applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-available' }), INITIAL_SHELL_UPDATER_UI_STATE);
});

test('update-downloaded advances downloading to downloaded', () => {
    const downloading = { downloaded: false, downloading: true, downloadingVersion: '0.2.0' };
    assert.deepEqual(applyShellUpdaterEvent(downloading, { kind: 'update-downloaded', version: '0.2.0' }), { downloaded: true, downloadedVersion: '0.2.0' });
});

test('A newer available update supersedes the staged version and advances to downloaded', () => {
    const downloaded = { downloaded: true, downloadedVersion: '0.1.19' };
    const downloading = applyShellUpdaterEvent(downloaded, { kind: 'update-available', version: '0.1.20' });
    assert.deepEqual(downloading, { downloaded: false, downloading: true, downloadingVersion: '0.1.20' });
    assert.deepEqual(applyShellUpdaterEvent(downloading, { kind: 'update-downloaded', version: '0.1.20' }), {
        downloaded: true,
        downloadedVersion: '0.1.20'
    });
});

test('Same or older available updates preserve the staged version', () => {
    const downloaded = { downloaded: true, downloadedVersion: '0.1.19' };
    assert.equal(applyShellUpdaterEvent(downloaded, { kind: 'update-available', version: '0.1.19' }), downloaded);
    assert.equal(applyShellUpdaterEvent(downloaded, { kind: 'update-available', version: '0.1.18' }), downloaded);
});

test('Older downloaded updates do not roll state backward', () => {
    const downloaded = { downloaded: true, downloadedVersion: '0.1.20' };
    assert.equal(applyShellUpdaterEvent(downloaded, { kind: 'update-downloaded', version: '0.1.19' }), downloaded);
});

test('Update errors retain reason and preserve existing downloaded state', () => {
    const downloaded = { downloaded: true, downloadedVersion: '0.2.0' };
    assert.deepEqual(applyShellUpdaterEvent(downloaded, { kind: 'error', reason: 'network down' }), downloaded);
    assert.deepEqual(applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'error', reason: 'oops' }), {
        downloaded: false,
        failed: true,
        failureReason: 'Could not check for updates. Wait a while and try again',
        fallbackReason: undefined
    });
    const downloading = { downloaded: false, downloading: true, downloadingVersion: '0.2.0' };
    assert.deepEqual(applyShellUpdaterEvent(downloading, { kind: 'error', message: 'legacy message' }), {
        downloaded: false,
        failed: true,
        failureReason: 'Could not check for updates. Wait a while and try again',
        fallbackReason: undefined
    });
});

test('Checking and no-update events clear failed state for retry recovery', () => {
    const downloading = { downloaded: false, downloading: true, downloadingVersion: '0.2.0' };
    assert.deepEqual(applyShellUpdaterEvent(downloading, { kind: 'update-not-available' }), { downloaded: false });
    assert.deepEqual(applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-not-available' }), INITIAL_SHELL_UPDATER_UI_STATE);
    assert.deepEqual(applyShellUpdaterEvent(downloading, { kind: 'checking-for-update' }), downloading);
    assert.deepEqual(applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'checking-for-update' }), INITIAL_SHELL_UPDATER_UI_STATE);
    const failed = { downloaded: false, failed: true, failureReason: 'offline' };
    assert.deepEqual(applyShellUpdaterEvent(failed, { kind: 'checking-for-update' }), INITIAL_SHELL_UPDATER_UI_STATE);
    assert.deepEqual(applyShellUpdaterEvent(failed, { kind: 'update-not-available' }), INITIAL_SHELL_UPDATER_UI_STATE);
    const downloadingAfterFailure = {
        downloaded: false,
        downloading: true,
        downloadingVersion: '0.2.0',
        failed: true,
        failureReason: 'offline',
        fallbackReason: 'offline',
        checkRequestedByUser: true
    };
    assert.deepEqual(applyShellUpdaterEvent(downloadingAfterFailure, { kind: 'checking-for-update' }), {
        downloaded: false,
        downloading: true,
        downloadingVersion: '0.2.0',
        checkRequestedByUser: true
    });
});

test('Failed-state buttons retry through the API before showing explicit browser fallback', () => {
    const failed = { downloaded: false, failed: true, failureReason: 'offline' };
    assert.equal(resolveUpdateButtonAction(failed, true), 'check');
    const checking = beginUserInitiatedUpdaterCheck(failed);
    assert.deepEqual(checking, { downloaded: false, checkRequestedByUser: true });
    const error = { kind: 'error', reason: 'still offline' };
    assert.equal(shouldOpenUpdaterBrowserFallback(checking, error), true);
    const fallback = applyShellUpdaterEvent(checking, error);
    assert.equal(formatUpdaterFallbackText(fallback), 'Open the download page');
});

test('Settings update checks are explicit user actions using the saved channel', () => {
    const source = readFileSync(new URL('../browser/akari-settings-dialog.ts', import.meta.url), 'utf8');
    assert.match(source, /api\.checkForUpdatesNow\(\{ userInitiated: true \}\)/);
});

test('Manual checks reannounce downloading or downloaded versions before rechecking', () => {
    assert.deepEqual(resolveManualUpdaterCheckEvent(true, '0.1.87', '0.1.86'), { kind: 'update-available', version: '0.1.87' });
    assert.deepEqual(resolveManualUpdaterCheckEvent(true, undefined, '0.1.86'), { kind: 'update-downloaded', version: '0.1.86' });
    assert.equal(resolveManualUpdaterCheckEvent(true, undefined, undefined), undefined);
    assert.equal(resolveManualUpdaterCheckEvent(false, '0.1.87', '0.1.86'), undefined);
});

test('Explicit prerelease downloads check their channel even with stable preferences', () => {
    assert.equal(resolveUpdaterCheckChannel('stable', false, 'prerelease'), 'stable');
    assert.equal(resolveUpdaterCheckChannel('stable', true, 'prerelease'), 'prerelease');
    assert.equal(resolveUpdaterCheckChannel('prerelease', true, 'stable'), 'stable');
    assert.equal(resolveUpdaterCheckChannel('stable', true, 'invalid'), 'stable');
});

test('Generic feeds route prereleases to latest and stable to a separate manifest', () => {
    assert.equal(resolveUpdaterFeedChannel('prerelease'), 'latest');
    assert.equal(resolveUpdaterFeedChannel('stable'), 'stable');
});

test('A notified version missing from a manual check triggers distribution fallback', () => {
    const checking = beginUserInitiatedUpdaterCheck(INITIAL_SHELL_UPDATER_UI_STATE);
    const event = reconcileVisibleUpdateEvent(checking, { kind: 'update-not-available' }, '0.1.82');
    assert.equal(event.kind, 'error');
    assert.equal(shouldOpenUpdaterBrowserFallback(checking, event), true);
    assert.equal(formatUpdaterFallbackText(applyShellUpdaterEvent(checking, event)), 'Open the download page');
    assert.deepEqual(reconcileVisibleUpdateEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-not-available' }, '0.1.82'), { kind: 'update-not-available' });
});

test('Home update rechecks call the API once without branching on downloaded state', async () => {
    let checks = 0;
    checkForShellUpdatesOnHomeShow({
        checkForUpdatesNow: async () => {
            checks += 1;
            throw new Error('background failure');
        }
    });
    assert.equal(checks, 1);
    await Promise.resolve();
});

test('Background failures neither display fallback nor navigate the browser', () => {
    const error = { kind: 'error', reason: 'background failure' };
    assert.equal(shouldOpenUpdaterBrowserFallback(INITIAL_SHELL_UPDATER_UI_STATE, error), false);
    const failed = applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, error);
    assert.equal(formatUpdaterFallbackText(failed), '');
});

test('Explicit clicks without an API immediately use browser fallback and a one-line reason', () => {
    assert.equal(resolveUpdateButtonAction(INITIAL_SHELL_UPDATER_UI_STATE, false), 'browser-fallback');
    const fallback = applyImmediateUpdaterFallback(INITIAL_SHELL_UPDATER_UI_STATE, 'In-app updates are unavailable');
    assert.equal(formatUpdaterFallbackText(fallback), 'Open the download page');
});

test('App Translocation detection uses execution paths and prioritizes relocation guidance', () => {
    const translated = '/private/var/folders/xx/AppTranslocation/ABC/d/AKARI Video.app/Contents/MacOS/AKARI Video';
    assert.equal(isAppTranslocationPath(translated), true);
    assert.equal(isAppTranslocationPath('/Applications/AKARI Video.app/Contents/MacOS/AKARI Video'), false);
    assert.equal(isAppTranslocationPath('/tmp/AppTranslocation-backup/AKARI Video'), false);
    assert.equal(resolveShellUpdaterErrorReason('network down', translated), 'Move the app to Applications, then restart');
});

test('Network errors are normalized and raw messages never reach the UI', () => {
    assert.equal(
        resolveShellUpdaterErrorReason('net::ERR_INTERNET_DISCONNECTED', '/Applications/AKARI Video.app/Contents/MacOS/AKARI Video'),
        'Could not check for updates while offline'
    );
    assert.equal(resolveShellUpdaterErrorReason('signature validation failed', '/Applications/AKARI Video.app'), 'Could not check for updates. Wait a while and try again');
});

test('Chromium server connection failures are distinguished from offline status', () => {
    const reason = 'Could not connect to the update server. Try again later';
    for (const code of [
        'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED',
        'ERR_CONNECTION_FAILED', 'ERR_ADDRESS_UNREACHABLE', 'ERR_TIMED_OUT'
    ]) {
        assert.equal(resolveShellUpdaterErrorReason(`net::${code}`, '/Applications/AKARI Video.app'), reason, code);
    }
    assert.equal(
        resolveShellUpdaterErrorReason('net::ERR_INTERNET_DISCONNECTED', '/Applications/AKARI Video.app'),
        'Could not check for updates while offline'
    );
    assert.equal(
        resolveShellUpdaterErrorReason('ECONNREFUSED', '/Applications/AKARI Video.app'),
        'Could not check for updates while offline'
    );
});

test('Repeated available updates or errors preserve the downloaded banner', () => {
    const downloaded = { downloaded: true, downloadedVersion: '0.2.0' };
    assert.deepEqual(applyShellUpdaterEvent(downloaded, { kind: 'update-available', version: '0.2.0' }), downloaded);
});

test('resolveAllowPrerelease enables everything except explicit stable', () => {
    assert.equal(resolveAllowPrerelease('prerelease'), true);
    assert.equal(resolveAllowPrerelease(undefined), true);
    assert.equal(resolveAllowPrerelease(null), true);
    assert.equal(resolveAllowPrerelease(''), true);
});

test('resolveAllowPrerelease returns false only for stable', () => {
    assert.equal(resolveAllowPrerelease('stable'), false);
});

test('resolveUpdateChannel uses explicit stable and defaults malformed values to prerelease', () => {
    assert.equal(resolveUpdateChannel('stable'), 'stable');
    assert.equal(resolveUpdateChannel('prerelease'), 'prerelease');
    assert.equal(resolveUpdateChannel(undefined), 'prerelease');
    assert.equal(resolveUpdateChannel(null), 'prerelease');
    assert.equal(resolveUpdateChannel('beta'), 'prerelease');
});

test('Downloaded banner requires downloaded state and version', () => {
    assert.equal(
        formatDownloadedBannerText({ downloaded: true, downloadedVersion: '0.2.0' }),
        'AKARI Video v0.2.0 downloaded. Restart to apply.'
    );
});

test('Downloaded banner is empty without downloaded state or version', () => {
    assert.equal(formatDownloadedBannerText(INITIAL_SHELL_UPDATER_UI_STATE), '');
    assert.equal(formatDownloadedBannerText({ downloaded: true }), '');
});

test('Downloading banner requires active download and version', () => {
    assert.equal(
        formatDownloadingBannerText({ downloaded: false, downloading: true, downloadingVersion: '0.2.0' }),
        'AKARI Video v0.2.0 downloading. A restart button appears when finished.'
    );
});

test('Downloading banner is empty when inactive, versionless, or downloaded', () => {
    assert.equal(formatDownloadingBannerText(INITIAL_SHELL_UPDATER_UI_STATE), '');
    assert.equal(formatDownloadingBannerText({ downloaded: false, downloading: true }), '');
    assert.equal(formatDownloadingBannerText({ downloaded: true, downloadedVersion: '0.2.0', downloading: true, downloadingVersion: '0.2.0' }), '');
});
