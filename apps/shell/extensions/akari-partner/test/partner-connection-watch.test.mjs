import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    isAppMarkerOk,
    isPartnerConnected,
    isProjectConnectionsOk
} from '../lib/common/connection-status.js';
import {
    checkPartnerConnection,
    PartnerConnectionTransitionDetector
} from '../lib/common/partner-connection-watch.js';

// 接続ガイドダイアログ（task 2026-08-06-partner-connect-popup）の接続成立検知。
// ホーム v2 の SSOT（connections.json の akari-cloud provider の doctor.status /
// アプリ単位マーカーの status）と同じ判定を、fs モック（未接続→接続の 2 ファイルの
// 有無・値の変化）で検証する。

function connectionsJson(status) {
    return JSON.stringify({ providers: [{ id: 'akari-cloud', doctor: { status } }] });
}

test('isProjectConnectionsOk: a missing file (undefined) is not connected', () => {
    assert.equal(isProjectConnectionsOk(undefined), false);
});

test('isProjectConnectionsOk: broken JSON is not connected', () => {
    assert.equal(isProjectConnectionsOk('{ this is not JSON'), false);
});

test('isProjectConnectionsOk: missing the akari-cloud entry is not connected', () => {
    const raw = JSON.stringify({ providers: [{ id: 'voicevox', doctor: { status: 'ok' } }] });
    assert.equal(isProjectConnectionsOk(raw), false);
});

test('isProjectConnectionsOk: a doctor.status other than ok is not connected', () => {
    assert.equal(isProjectConnectionsOk(connectionsJson('unchecked')), false);
});

test('isProjectConnectionsOk: doctor.status === ok is connected', () => {
    assert.equal(isProjectConnectionsOk(connectionsJson('ok')), true);
});

test('isAppMarkerOk: a missing file (undefined) is not connected', () => {
    assert.equal(isAppMarkerOk(undefined), false);
});

test('isAppMarkerOk: broken JSON is not connected', () => {
    assert.equal(isAppMarkerOk('not json'), false);
});

test('isAppMarkerOk: a status other than ok is not connected', () => {
    assert.equal(isAppMarkerOk(JSON.stringify({ status: 'pending' })), false);
});

test('isAppMarkerOk: status === ok is connected', () => {
    assert.equal(isAppMarkerOk(JSON.stringify({ status: 'ok' })), true);
});

test('isPartnerConnected: connected when either the project or the app is ok, the same OR as home readConnected()', () => {
    assert.equal(
        isPartnerConnected({ projectConnectionsRaw: undefined, appMarkerRaw: JSON.stringify({ status: 'ok' }) }),
        true
    );
    assert.equal(
        isPartnerConnected({ projectConnectionsRaw: connectionsJson('ok'), appMarkerRaw: undefined }),
        true
    );
    assert.equal(
        isPartnerConnected({ projectConnectionsRaw: undefined, appMarkerRaw: undefined }),
        false
    );
});

test('checkPartnerConnection: can decide from real files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'akari-partner-watch-'));
    const connectionsPath = path.join(dir, 'connections.json');
    const markerPath = path.join(dir, 'partner-connection.json');
    const access = {
        readProjectConnections: async () => {
            try {
                return await readFile(connectionsPath, 'utf8');
            } catch {
                return undefined;
            }
        },
        readAppMarker: async () => {
            try {
                return await readFile(markerPath, 'utf8');
            } catch {
                return undefined;
            }
        }
    };

    assert.equal(await checkPartnerConnection(access), 'disconnected');

    await writeFile(connectionsPath, connectionsJson('ok'), 'utf8');
    assert.equal(await checkPartnerConnection(access), 'connected');

    await rm(dir, { recursive: true, force: true });
});

test('PartnerConnectionTransitionDetector: fires once on the not-connected to connected edge, with no flapping', () => {
    const detector = new PartnerConnectionTransitionDetector();
    assert.equal(detector.ingest('disconnected'), false);
    assert.equal(detector.ingest('disconnected'), false);
    assert.equal(detector.ingest('connected'), true);
    assert.equal(detector.ingest('connected'), false);
    assert.equal(detector.ingest('disconnected'), false);
    assert.equal(detector.ingest('connected'), false);
    assert.equal(detector.state, 'connected');
});

test('PartnerConnectionTransitionDetector: a simulated poll fires the dialog transition once', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'akari-partner-watch-'));
    const connectionsPath = path.join(dir, 'connections.json');
    const access = {
        readProjectConnections: async () => {
            try {
                return await readFile(connectionsPath, 'utf8');
            } catch {
                return undefined;
            }
        },
        readAppMarker: async () => undefined
    };
    const detector = new PartnerConnectionTransitionDetector();
    const transitions = [];

    // tick 1: まだ何も無い（CLI 準備中相当）。
    transitions.push(detector.ingest(await checkPartnerConnection(access)));
    // tick 2: PTY 接続成立 → connections.json が ok に倒る（attachTerminal() の
    // markCloudConnectionOk() 相当の副作用）。
    await writeFile(connectionsPath, connectionsJson('ok'), 'utf8');
    transitions.push(detector.ingest(await checkPartnerConnection(access)));
    // tick 3: 接続済みのまま（再発火しないこと）。
    transitions.push(detector.ingest(await checkPartnerConnection(access)));

    assert.deepEqual(transitions, [false, true, false]);

    await rm(dir, { recursive: true, force: true });
});
