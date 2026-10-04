import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as waitForImmediate } from 'node:timers/promises';
import { AkariPreviewServerServiceImpl } from '../lib/node/akari-preview-server-service.js';

/** spawn() の戻りを模す偽の子プロセス（実 CLI を起動しない — quick-export-service.test.mjs の流儀）。 */
class FakeChild extends EventEmitter {
    constructor(pid, onKill) {
        super();
        this.pid = pid;
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
        this.exitCode = null;
        this.signalCode = null;
        this.kills = [];
        this.onKill = onKill;
    }

    kill(signal) {
        this.kills.push(signal ?? '(default)');
        if (this.onKill) {
            this.onKill(this);
        }
        // 実プロセス同様、kill の後に close が非同期で届く。
        setImmediate(() => this.close(null, 'SIGTERM'));
        return true;
    }

    /** server.mjs の起動完了ログ（URL 行を含む 4 行）を stdout に流す。 */
    ready(port) {
        this.stdout.emit(
            'data',
            `\n  AKARI Video Preview Server\n  http://127.0.0.1:${port}\n  bind: 127.0.0.1:${port}\n  project: /project\n`
        );
    }

    close(code, signal = null) {
        if (this.exitCode !== null || this.signalCode !== null) {
            return;
        }
        this.exitCode = code;
        this.signalCode = signal;
        this.emit('close', code, signal);
    }
}

/** spawn / ポートプローブ / 入口解決を差し替えたテスト用サービス。 */
class FakeService extends AkariPreviewServerServiceImpl {
    events = [];
    children = [];
    spawnedArgs = [];
    busyPorts = new Set();
    autoReady = true;

    async findServerEntry() {
        return '/resources/packages/preview-server/src/server.mjs';
    }

    async probePort(port) {
        return !this.busyPorts.has(port);
    }

    childEnvironment() {
        return {};
    }

    installExitHook() {
        // テストプロセスに exit フックを残さない。
    }

    fsPath(uri) {
        return uri.replace('file://', '');
    }

    spawnServer(entry, args) {
        const port = Number(args[args.indexOf('--port') + 1]);
        const child = new FakeChild(1000 + this.children.length, killed => this.events.push(`kill:${killed.pid}`));
        this.children.push(child);
        this.spawnedArgs.push(args);
        this.events.push(`spawn:${child.pid}:${port}`);
        if (this.autoReady) {
            setImmediate(() => child.ready(port));
        }
        return child;
    }
}

test('(a) start becomes running with URL and port after a ready URL in fake stdout', async () => {
    const service = new FakeService();
    const status = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(status.phase, 'running');
    assert.equal(status.url, 'http://127.0.0.1:4567');
    assert.equal(status.port, 4567);
    assert.equal(status.pid, 1000);
    assert.equal(status.projectRootUri, 'file:///project');
    assert.match(status.logTail, /AKARI Video Preview Server/);
    assert.deepEqual(await service.getStatus(), status);
});

test('(b) start fails with port in use on exit 1 and EADDRINUSE before readiness', async () => {
    const service = new FakeService();
    service.autoReady = false;
    const started = service.start({ projectRootUri: 'file:///project' });
    await waitForImmediate();
    const child = service.children[0];
    child.stderr.emit('data', 'Error: listen EADDRINUSE: address already in use 127.0.0.1:4567');
    child.close(1);
    const status = await started;
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /in use/);
    assert.match(status.failureSummary, /4567/);
});

test('(c) Unexpected close while running fails with the stderr tail', async () => {
    const service = new FakeService();
    await service.start({ projectRootUri: 'file:///project' });
    const child = service.children[0];
    child.stderr.emit('data', 'Error: boom\n');
    child.close(1);
    await waitForImmediate();
    const status = await service.getStatus();
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /exited unexpectedly/);
    assert.match(status.failureSummary, /boom/);
});

test('(d) stop becomes idle and kills once', async () => {
    const service = new FakeService();
    await service.start({ projectRootUri: 'file:///project' });
    const status = await service.stop();
    assert.equal(status.phase, 'idle');
    assert.equal(service.children[0].kills.length, 1);
    assert.equal((await service.getStatus()).phase, 'idle');
});

test('(e) Starting another project kills the old child before spawning a new one', async () => {
    const service = new FakeService();
    await service.start({ projectRootUri: 'file:///project-a' });
    const status = await service.start({ projectRootUri: 'file:///project-b' });
    assert.equal(status.phase, 'running');
    assert.equal(status.projectRootUri, 'file:///project-b');
    assert.deepEqual(service.events, ['spawn:1000:4567', 'kill:1000', 'spawn:1001:4567']);
});

test('(f) Restarting the same project does not spawn again', async () => {
    const service = new FakeService();
    const first = await service.start({ projectRootUri: 'file:///project' });
    const second = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(second.phase, 'running');
    assert.equal(second.url, first.url);
    assert.equal(service.children.length, 1);
});

test('(f2) Reentry while starting waits for the same startup without double spawning', async () => {
    const service = new FakeService();
    service.autoReady = false;
    const first = service.start({ projectRootUri: 'file:///project' });
    const second = service.start({ projectRootUri: 'file:///project' });
    await waitForImmediate();
    service.children[0].ready(4567);
    const [statusA, statusB] = await Promise.all([first, second]);
    assert.equal(statusA.phase, 'running');
    assert.deepEqual(statusA, statusB);
    assert.equal(service.children.length, 1);
});

test('(g) Missing entry fails and lists attempted candidates in logTail', async () => {
    class MissingEntryService extends AkariPreviewServerServiceImpl {
        fsImpl = { stat: async () => { throw new Error('ENOENT'); } };
    }
    const service = new MissingEntryService();
    const status = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /preview-server not found/);
    assert.match(status.logTail, /resolution failed/);
    assert.match(status.logTail, /src[\\/]server\.mjs/);
    assert.match(status.logTail, /  - /);
});

test('(h) Port search selects 4568 when 4567 is occupied', async () => {
    const service = new FakeService();
    service.busyPorts.add(4567);
    const status = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(status.phase, 'running');
    assert.equal(status.port, 4568);
    assert.equal(status.url, 'http://127.0.0.1:4568');
    assert.deepEqual(service.spawnedArgs[0], ['/project', '--port', '4568', '--host', '127.0.0.1']);
});

test('(h2) All ports 4567–4576 occupied fails without spawning', async () => {
    const service = new FakeService();
    for (let port = 4567; port <= 4576; port++) {
        service.busyPorts.add(port);
    }
    const status = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /4567–4576 are all in use/);
    assert.equal(service.children.length, 0);
});

test('(i) Readiness timeout fails and kills the child', async () => {
    const service = new FakeService();
    service.autoReady = false;
    service.readyTimeoutMs = 50;
    const status = await service.start({ projectRootUri: 'file:///project' });
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /s elapsed without starting/);
    assert.equal(service.children[0].kills.length, 1);
});
