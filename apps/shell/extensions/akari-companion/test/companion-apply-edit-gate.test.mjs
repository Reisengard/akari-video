import assert from 'node:assert/strict';
import test from 'node:test';
import { gateCompanionApplyEdit } from '../lib/node/companion-apply-edit-gate.js';

const location = {
  projectSessionId: 'session-1',
  rootFsPath: '/project',
  editFsPath: '/project/timeline.edit.json',
  captionsFsPath: '/project/captions.json'
};

const instruction = {
  id: 'i-1',
  kind: 'applyEdit',
  applyEdit: {
    projectSessionId: 'session-1', label: 'apply',
    edit: { baseSha256: 'a', nextText: '{}' },
    captions: { baseSha256: 'b', nextText: '[]' }
  }
};

test('Pass commands other than applyEdit without validation', async () => {
  let calls = 0;
  const result = await gateCompanionApplyEdit({ id: 'i', kind: 'getState' }, {
    currentLocation: () => undefined,
    lintCandidates: async () => { calls += 1; return { pass: false, errors: [] }; }
  });
  assert.equal(result, undefined);
  assert.equal(calls, 0);
});

test('Missing location and session mismatch produce stale-session', async () => {
  for (const currentLocation of [() => undefined, () => ({ ...location, projectSessionId: 'other' })]) {
    let calls = 0;
    const result = await gateCompanionApplyEdit(instruction, {
      currentLocation,
      lintCandidates: async () => { calls += 1; return { pass: true, errors: [] }; }
    });
    assert.equal(result.error, 'stale-session');
    assert.equal(calls, 0);
  }
});

test('Return validation failure reasons unchanged', async () => {
  const result = await gateCompanionApplyEdit(instruction, {
    currentLocation: () => location,
    lintCandidates: async () => ({ pass: false, errors: ['first', 'second'] })
  });
  assert.deepEqual(result, {
    id: 'i-1', ok: false, error: 'rejected', value: { reasons: ['first', 'second'] }
  });
});

test('Allow validated and empty applyEdit payloads', async () => {
  assert.equal(await gateCompanionApplyEdit(instruction, {
    currentLocation: () => location,
    lintCandidates: async () => ({ pass: true, errors: [] })
  }), undefined);
  let calls = 0;
  assert.equal(await gateCompanionApplyEdit({
    id: 'empty', kind: 'applyEdit', applyEdit: { projectSessionId: 'session-1', label: 'empty' }
  }, {
    currentLocation: () => location,
    lintCandidates: async () => { calls += 1; return { pass: true, errors: [] }; }
  }), undefined);
  assert.equal(calls, 0);
});

test('Use only basename for candidate names', async () => {
  let received;
  await gateCompanionApplyEdit(instruction, {
    currentLocation: () => location,
    lintCandidates: async (root, candidates) => {
      received = { root, candidates };
      return { pass: true, errors: [] };
    }
  });
  assert.deepEqual(received, {
    root: '/project', candidates: { 'timeline.edit.json': '{}', 'captions.json': '[]' }
  });
});
