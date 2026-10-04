import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPreviewOpenUrl,
    buildPreviewServerArgs,
    describePreviewServerFailure,
    parsePreviewServerReadyUrl,
    PREVIEW_SERVER_DEFAULT_PORT,
    PREVIEW_SERVER_HOST,
    PREVIEW_SERVER_PORT_ATTEMPTS,
    PREVIEW_SERVER_READY_TIMEOUT_MS
} from '../lib/common/preview-server-cli.js';

// server.mjs 末尾（server.listen コールバック）の実起動ログ 4 行（task.md 事実確認 3）。
const READY_LOG = [
    '  AKARI Video Preview Server',
    '  http://127.0.0.1:4567',
    '  bind: 127.0.0.1:4567',
    '  project: /projects/demo'
].join('\n');

test('Constants match akari.sh --preview defaults: port 4567, 10 ports, 127.0.0.1, 10 seconds', () => {
    assert.equal(PREVIEW_SERVER_DEFAULT_PORT, 4567);
    assert.equal(PREVIEW_SERVER_PORT_ATTEMPTS, 10);
    assert.equal(PREVIEW_SERVER_HOST, '127.0.0.1');
    assert.equal(PREVIEW_SERVER_READY_TIMEOUT_MS, 10_000);
});

test('buildPreviewServerArgs: [projectRoot, --port, <n>, --host, 127.0.0.1]', () => {
    assert.deepEqual(
        buildPreviewServerArgs('/projects/demo', 4568),
        ['/projects/demo', '--port', '4568', '--host', '127.0.0.1']
    );
});

test('parsePreviewServerReadyUrl reads the first URL from four real log lines without trailing slash', () => {
    assert.equal(parsePreviewServerReadyUrl(READY_LOG), 'http://127.0.0.1:4567');
});

test('parsePreviewServerReadyUrl returns undefined without a URL line', () => {
    assert.equal(parsePreviewServerReadyUrl('[watch] watching /projects/demo\n'), undefined);
    assert.equal(parsePreviewServerReadyUrl(''), undefined);
});

test('buildPreviewOpenUrl latest uses the root', () => {
    assert.equal(buildPreviewOpenUrl('http://127.0.0.1:4567', 'latest'), 'http://127.0.0.1:4567/');
});

test('buildPreviewOpenUrl legacy uses ?frameEngine=0 for the legacy DOM preview', () => {
    assert.equal(buildPreviewOpenUrl('http://127.0.0.1:4567', 'legacy'), 'http://127.0.0.1:4567/?frameEngine=0');
});

test('describePreviewServerFailure explains EADDRINUSE in English', () => {
    const summary = describePreviewServerFailure(
        1,
        'Error: listen EADDRINUSE: address already in use 127.0.0.1:4567',
        4567
    );
    assert.equal(summary, 'Port 4567 is in use by another process');
});

test('describePreviewServerFailure summarizes the stderr tail', () => {
    const summary = describePreviewServerFailure(1, 'first line\nError: something broke\n', 4567);
    assert.match(summary, /Error: something broke/);
});

test('describePreviewServerFailure includes exit code when stderr is empty', () => {
    assert.equal(
        describePreviewServerFailure(3, '', 4567),
        'exit code 3 (no error output)'
    );
    assert.equal(
        describePreviewServerFailure(null, '   \n', 4567),
        'exit code Unknown (no error output)'
    );
});
