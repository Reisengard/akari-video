import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { guideAnnouncementDecision, guideAnnouncementMarker } = require('../../lib/onboarding/announcement-model.js');
const fresh = {
    hasOpenProject: false, hasProjectHistory: false, hasCreatorRootPointer: false, hasWorkspaceDirectory: false,
    legacySetupMarkerSeen: false, guideStateSeen: false, announcementMarkerSeen: false
};

test('Fresh installations neither notify nor record; existing user evidence notifies once', () => {
    assert.deepEqual(guideAnnouncementDecision(fresh), { show: false, record: false });
    for (const key of ['hasOpenProject', 'hasProjectHistory', 'hasCreatorRootPointer', 'hasWorkspaceDirectory', 'legacySetupMarkerSeen']) {
        const facts = { ...fresh, [key]: true };
        const first = guideAnnouncementDecision(facts);
        assert.deepEqual(first, { show: true, record: true }, key);
        assert.deepEqual(guideAnnouncementMarker(first, '2026-09-27T00:00:00.000Z'),
            { schema: 1, shownAt: '2026-09-27T00:00:00.000Z' });
        assert.deepEqual(guideAnnouncementDecision({ ...facts, announcementMarkerSeen: true }),
            { show: false, record: false }, `${key}: 再起動`);
    }
});

test('Guide users and recorded users never receive the announcement again', () => {
    const existing = { ...fresh, hasProjectHistory: true };
    for (const key of ['guideStateSeen', 'announcementMarkerSeen']) {
        const decision = guideAnnouncementDecision({ ...existing, [key]: true });
        assert.deepEqual(decision, { show: false, record: false });
        assert.equal(guideAnnouncementMarker(decision, 'now'), undefined);
    }
});
