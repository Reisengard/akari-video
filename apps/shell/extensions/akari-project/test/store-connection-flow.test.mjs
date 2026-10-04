import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreConnectionFlowController } from '../lib/common/store-connection-flow.js';

const started = {
    status: 'started',
    baseUrl: 'https://store.example/api/store',
    deviceCode: 'device-123',
    userCode: 'ABCD-EFGH',
    verificationUrl: 'https://store.example/device',
    intervalMs: 3000,
    expiresAt: 1000
};

function createHarness({
    startOutcome = started,
    pollOutcome = { status: 'pending' },
    now = () => 0
} = {}) {
    const states = [];
    const openedUrls = [];
    const timers = new Map();
    let nextTimer = 1;
    let pollCalls = 0;
    const service = {
        async getStoreConnectionStatus() {
            return { connected: false };
        },
        async startStoreDeviceConnection() {
            if (startOutcome instanceof Error) {
                throw startOutcome;
            }
            return startOutcome;
        },
        async pollStoreDeviceConnection() {
            pollCalls++;
            if (pollOutcome instanceof Error) {
                throw pollOutcome;
            }
            return pollOutcome;
        },
        async disconnectStoreAccount() {
            return true;
        }
    };
    const controller = new StoreConnectionFlowController(service, {
        openVerificationUrl: url => openedUrls.push(url),
        onChange: state => states.push(state),
        now,
        setTimer: callback => {
            const handle = nextTimer++;
            timers.set(handle, callback);
            return handle;
        },
        clearTimer: handle => timers.delete(handle)
    });
    return {
        controller,
        states,
        openedUrls,
        timers,
        pollCalls: () => pollCalls
    };
}

async function flushMicrotasks() {
    for (let index = 0; index < 5; index++) {
        await Promise.resolve();
    }
}

async function fireNextTimer(harness) {
    const next = harness.timers.entries().next().value;
    assert.ok(next, 'scheduled timer should exist');
    const [handle, callback] = next;
    harness.timers.delete(handle);
    callback();
    await flushMicrotasks();
}

test('start opens approval URL and notifies pending with verification code', async () => {
    const harness = createHarness();

    await harness.controller.start();

    assert.deepEqual(harness.states.map(state => state.phase), ['starting', 'pending']);
    assert.equal(harness.states.at(-1).userCode, 'ABCD-EFGH');
    assert.deepEqual(harness.openedUrls, ['https://store.example/device']);
    assert.equal(harness.timers.size, 1);
});

test('pending to approved marks connected and returns to idle', async () => {
    const harness = createHarness({
        pollOutcome: {
            status: 'approved',
            connection: { connected: true, email: 'user@example.com' }
        }
    });
    await harness.controller.start();

    await fireNextTimer(harness);

    const state = harness.states.at(-1);
    assert.equal(state.phase, 'idle');
    assert.equal(state.connection.connected, true);
    assert.equal(state.connection.email, 'user@example.com');
    assert.equal(state.userCode, undefined);
});

test('cancelling pending returns to idle and ignores stale timers', async () => {
    const harness = createHarness();
    await harness.controller.start();
    const staleTimer = harness.timers.values().next().value;

    harness.controller.cancel();
    staleTimer();
    await flushMicrotasks();

    assert.equal(harness.states.at(-1).phase, 'idle');
    assert.equal(harness.timers.size, 0);
    assert.equal(harness.pollCalls(), 0);
});

test('overdue pending becomes expired', async () => {
    let currentTime = 0;
    const harness = createHarness({ now: () => currentTime });
    await harness.controller.start();
    currentTime = started.expiresAt;

    await fireNextTimer(harness);

    assert.equal(harness.states.at(-1).phase, 'expired');
    assert.match(harness.states.at(-1).error, /expired/);
    assert.equal(harness.pollCalls(), 0);
});

test('start RPC rejection notifies error and message', async () => {
    const harness = createHarness({ startOutcome: new Error('offline') });

    await harness.controller.start();

    assert.equal(harness.states.at(-1).phase, 'error');
    assert.match(harness.states.at(-1).error, /offline/);
});

test('start RPC network-error outcome notifies error and message', async () => {
    const harness = createHarness({
        startOutcome: { status: 'network-error', error: 'Cannot connect to the network.' }
    });

    await harness.controller.start();

    assert.equal(harness.states.at(-1).phase, 'error');
    assert.equal(harness.states.at(-1).error, 'Cannot connect to the network.');
});

test('poll RPC rejection notifies error and message', async () => {
    const harness = createHarness({ pollOutcome: new Error('claim failed') });
    await harness.controller.start();

    await fireNextTimer(harness);

    assert.equal(harness.states.at(-1).phase, 'error');
    assert.match(harness.states.at(-1).error, /claim failed/);
});

test('poll RPC network-error outcome notifies error and message', async () => {
    const harness = createHarness({
        pollOutcome: { status: 'network-error', error: 'Cannot reach the store.' }
    });
    await harness.controller.start();

    await fireNextTimer(harness);

    assert.equal(harness.states.at(-1).phase, 'error');
    assert.equal(harness.states.at(-1).error, 'Cannot reach the store.');
});
