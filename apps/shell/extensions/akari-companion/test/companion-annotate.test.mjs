import assert from 'node:assert/strict';
import test from 'node:test';
import uriModule from '@theia/core/lib/common/uri.js';
import { applyCompanionAnnotation } from '../lib/browser/companion-annotate.js';

const URI = uriModule.default ?? uriModule;

function fixture(overrides = {}) {
  const calls = [];
  const deps = {
    currentProjectSessionId: () => 'session-1',
    currentLocation: () => ({
      reviewUri: new URI('file:///project/review.json'),
      root: new URI('file:///project')
    }),
    createAnnotation: async request => {
      calls.push(request);
      return { annotation: { id: 'a-0001' }, committed: false };
    },
    ...overrides
  };
  return { calls, deps };
}

const base = { projectSessionId: 'session-1', text: 'note', sourceT: 1 };

test('Create annotations using current review/root and external flag', async () => {
  const { calls, deps } = fixture();
  const result = await applyCompanionAnnotation(base, deps);
  assert.deepEqual(result, { ok: true, value: { annotationId: 'a-0001' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reviewUri, 'file:///project/review.json');
  assert.equal(calls[0].projectRootUri, 'file:///project');
  assert.equal(calls[0].intent, 'external');
  assert.equal(calls[0].target, null);
});

test('Do not create on session mismatch', async () => {
  const { calls, deps } = fixture({ currentProjectSessionId: () => 'other' });
  assert.equal((await applyCompanionAnnotation(base, deps)).error, 'stale-session');
  assert.equal(calls.length, 0);
});

test('Reject empty text and 2001 characters', async () => {
  const { deps } = fixture();
  assert.equal((await applyCompanionAnnotation({ ...base, text: '' }, deps)).error, 'invalid-args');
  assert.equal((await applyCompanionAnnotation({ ...base, text: 'x'.repeat(2001) }, deps)).error, 'invalid-args');
});

test('Allow sourceT null only for document and image targets', async () => {
  const { calls, deps } = fixture();
  assert.equal((await applyCompanionAnnotation({ ...base, sourceT: null, target: 'cut:c-1' }, deps)).error, 'invalid-args');
  assert.equal((await applyCompanionAnnotation({ ...base, sourceT: null, target: 'doc:README.md#intro' }, deps)).ok, true);
  assert.equal(calls.length, 1);
});

test('Check range, string bounds, and exceptions', async () => {
  const { deps } = fixture();
  assert.equal((await applyCompanionAnnotation({ ...base, sourceRange: [2, 1] }, deps)).error, 'invalid-args');
  assert.equal((await applyCompanionAnnotation({ ...base, src: 'x'.repeat(513) }, deps)).error, 'invalid-args');
  const rejected = await applyCompanionAnnotation(base, {
    ...deps, createAnnotation: async () => { throw new Error('denied'); }
  });
  assert.deepEqual(rejected, { ok: false, error: 'rejected', value: { reasons: ['denied'] } });
});
