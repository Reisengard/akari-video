import assert from 'node:assert/strict';
import test from 'node:test';
import { applyShellUpdaterEvent, beginUserInitiatedUpdaterCheck, INITIAL_SHELL_UPDATER_UI_STATE } from '../../lib/common/shell-update-applier.js';
import { resolveSettingsUpdateView } from '../../lib/common/settings-update-view.js';

const view = (state, lastEventKind, downloadUrl) => resolveSettingsUpdateView({
    state, lastEventKind, currentVersion: '0.1.82', lastChecked: '2026/9/26 12:00:00', downloadUrl
});

test('Clicking synchronously enters checking state and disables the button', () => {
    const pending = view(beginUserInitiatedUpdaterCheck(INITIAL_SHELL_UPDATER_UI_STATE), 'checking-for-update');
    assert.equal(pending.label, 'Checking…');
    assert.equal(pending.button.disabled, true);
    assert.equal(pending.button.kind, 'check');
});

test('Downloading shows old and new versions and advances to restart when complete', () => {
    const downloading = applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-available', version: '0.1.87' });
    const inProgress = view(downloading, 'update-available');
    assert.match(inProgress.label, /v0\.1\.87.*is downloading/);
    assert.match(inProgress.detail, /Current v0\.1\.82/);
    assert.equal(inProgress.button.disabled, true);
    const ready = view(applyShellUpdaterEvent(downloading, { kind: 'update-downloaded', version: '0.1.87' }), 'update-downloaded');
    assert.equal(ready.label, 'v0.1.87 is ready');
    assert.deepEqual(ready.button, { kind: 'restart', label: 'Restart to update', disabled: false, primary: true });
});

test('Up-to-date status shows current version and last check time', () => {
    const latest = view(applyShellUpdaterEvent(INITIAL_SHELL_UPDATER_UI_STATE, { kind: 'update-not-available' }), 'update-not-available');
    assert.equal(latest.label, 'Up to date (v0.1.82）');
    assert.match(latest.detail, /2026\/9\/26 12:00:00/);
});

test('Failures show a concise message, retry, and browser fallback when available', () => {
    const failed = applyShellUpdaterEvent(beginUserInitiatedUpdaterCheck(INITIAL_SHELL_UPDATER_UI_STATE), {
        kind: 'error', reason: 'HttpError: 404\nheaders: secret'
    });
    const fallback = view(failed, 'error', 'https://example.com/update.dmg');
    assert.equal(fallback.label, 'Could not check for updates. Wait a while and try again');
    assert.doesNotMatch(fallback.detail, /HttpError|headers|secret/);
    assert.equal(fallback.button.label, 'Check again');
    assert.equal(fallback.button.disabled, false);
    assert.equal(fallback.browserFallback, true);
    assert.equal(view(failed, 'error').browserFallback, false);
});
