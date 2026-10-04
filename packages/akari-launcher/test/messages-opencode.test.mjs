import assert from 'node:assert/strict';
import test from 'node:test';

import { opencodeMissingGuidance } from '../src/messages.mjs';

test('opencodeMissingGuidance: インストール案内を返す', () => {
  const result = opencodeMissingGuidance();
  assert.ok(result.includes('The opencode command was not found.'));
  assert.ok(result.includes('npm install -g opencode-ai'));
  assert.ok(result.includes('akari --opencode'));
});
