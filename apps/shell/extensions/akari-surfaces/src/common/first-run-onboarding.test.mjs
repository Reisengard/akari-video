import assert from 'node:assert/strict';
import test from 'node:test';
import {
    nextFirstRunSetupStep,
    shouldAutoOpenFirstRunSetup,
    shouldRecordFirstRunMarker
} from '../../lib/common/first-run-onboarding.js';

const FIRST_RUN = {
    hasOpenProject: false,
    hasCreatorRootPointer: false,
    hasProjectHistory: false,
    markerSeen: false
};

test('Setup opens automatically only on a completely fresh installation', () => {
    assert.equal(shouldAutoOpenFirstRunSetup(FIRST_RUN), true);
});

test('The seen marker prevents subsequent automatic setup', () => {
    assert.equal(shouldAutoOpenFirstRunSetup({ ...FIRST_RUN, markerSeen: true }), false);
});

test('A workspace pointer or project history identifies existing users', () => {
    assert.equal(shouldAutoOpenFirstRunSetup({ ...FIRST_RUN, hasCreatorRootPointer: true }), false);
    assert.equal(shouldAutoOpenFirstRunSetup({ ...FIRST_RUN, hasProjectHistory: true }), false);
});

test('An open project prevents automatic setup', () => {
    assert.equal(shouldAutoOpenFirstRunSetup({ ...FIRST_RUN, hasOpenProject: true }), false);
});

test('Setup steps progress through tools, workspace, footage, and connection with back and skip', () => {
    assert.equal(nextFirstRunSetupStep('tools', 'next'), 'workspace');
    assert.equal(nextFirstRunSetupStep('workspace', 'back'), 'tools');
    assert.equal(nextFirstRunSetupStep('workspace', 'workspace-created'), 'library');
    assert.equal(nextFirstRunSetupStep('library', 'back'), 'workspace');
    assert.equal(nextFirstRunSetupStep('library', 'skip'), 'connection');
    assert.equal(nextFirstRunSetupStep('connection', 'back'), 'library');
});

test('Only automatic setup writes the marker, including when closed', () => {
    assert.equal(shouldRecordFirstRunMarker('automatic'), true);
    assert.equal(shouldRecordFirstRunMarker('manual'), false);
});
