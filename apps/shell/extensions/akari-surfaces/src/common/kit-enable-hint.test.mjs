import assert from 'node:assert/strict';
import test from 'node:test';
import { KIT_ENABLE_HINT } from '../../lib/common/kit-enable-hint.js';
import { enableHint } from '../../../../../../packages/akari-launcher/src/kits.mjs';

test('Kit hint preserves the launcher command while explaining it in English', () => {
    const commands = text => text.split('\n').map(line => line.trim()).filter(line => line.startsWith('claude plugin '));
    assert.equal(commands(KIT_ENABLE_HINT).length, 2);
    assert.deepEqual(commands(KIT_ENABLE_HINT), commands(enableHint()));
    assert.match(KIT_ENABLE_HINT, /kit/i);
});
