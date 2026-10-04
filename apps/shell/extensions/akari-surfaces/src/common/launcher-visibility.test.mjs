import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoOpenProjectLauncher } from '../../lib/common/launcher-visibility.js';

const BASE = {
    hasOpenProject: false,
    firstRunWillAutoOpen: false,
    dismissedThisSession: false
};

test('Launcher opens automatically on startup without a project', () => {
    assert.equal(shouldAutoOpenProjectLauncher(BASE), true);
});

test('Launcher does not open automatically with an open project', () => {
    assert.equal(shouldAutoOpenProjectLauncher({ ...BASE, hasOpenProject: true }), false);
});

test('Automatic first-run setup takes priority over the launcher', () => {
    assert.equal(shouldAutoOpenProjectLauncher({ ...BASE, firstRunWillAutoOpen: true }), false);
});

test('Closing once prevents another automatic launcher in the same session', () => {
    assert.equal(shouldAutoOpenProjectLauncher({ ...BASE, dismissedThisSession: true }), false);
});

test('An open project or higher-priority setup keeps launcher visibility false', () => {
    assert.equal(
        shouldAutoOpenProjectLauncher({ hasOpenProject: true, firstRunWillAutoOpen: true, dismissedThisSession: true }),
        false
    );
});
