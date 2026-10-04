import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STORE_RECONNECT_REQUIRED_MESSAGE,
    storeReconnectRequired
} from '../../lib/common/store-entitlements-visibility.js';

test('Reconnection requires saved credentials and unauthorized status', () => {
    assert.equal(storeReconnectRequired(true, 'unauthorized'), true);
    assert.equal(storeReconnectRequired(true, 'ok'), false);
    assert.equal(storeReconnectRequired(true, 'error'), false);
    assert.equal(storeReconnectRequired(false, 'unauthorized'), false);
    assert.equal(storeReconnectRequired(false, 'no_credentials'), false);
});

test('Reconnection message explains possible disconnection by another device', () => {
    assert.equal(
        STORE_RECONNECT_REQUIRED_MESSAGE,
        'Reconnect required (may have disconnected after connecting on another device)'
    );
});
