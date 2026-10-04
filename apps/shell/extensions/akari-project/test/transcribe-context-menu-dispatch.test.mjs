import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const noopDecorator = () => () => undefined;
const emptyModule = new Proxy({}, { get: () => undefined });
const modules = {
    '@theia/core/shared/inversify': { inject: noopDecorator, injectable: noopDecorator, postConstruct: noopDecorator },
    '@theia/core/lib/browser/widgets/react-widget': { ReactWidget: class {} },
    '@theia/core/lib/common': { DisposableCollection: class {} },
    '@theia/core/shared/react': {},
    '../common/material-card-layout': { materialCardLayout: () => ({ gridGap: '8px', cardMinWidth: '100px' }) }
};
const exports = {};
vm.runInNewContext(readFileSync(new URL('../lib/browser/akari-role-buckets-widget.js', import.meta.url), 'utf8'), {
    require: id => modules[id] ?? emptyModule,
    exports,
    module: { exports },
    console,
    Error,
    URL,
    Promise,
    Object,
    Array,
    JSON,
    String,
    Symbol,
    Set,
    Map,
    setTimeout,
    clearTimeout
});
const { AkariRoleBucketsWidget } = exports;
const plain = value => JSON.parse(JSON.stringify(value));

function harness(executeCommand) {
    const calls = { commands: [], rpc: [], info: [], error: [], loads: 0 };
    const context = {
        workflow: { workspaceRoot: { toString: () => 'file:///project' } },
        transcriptStateByPath: {},
        commandService: { async executeCommand(...args) { calls.commands.push(args); return executeCommand(...args); } },
        projectService: { async transcribeMaterial(request) { calls.rpc.push(request); } },
        messages: {
            async info(message) { calls.info.push(message); },
            async error(message) { calls.error.push(message); }
        },
        update() {},
        async loadMaterials() { calls.loads += 1; }
    };
    return { calls, context, entry: { name: 'voice.wav', kind: 'audio', relativePath: 'assets/voice.wav' } };
}

test('context menu Transcription executes openDialog with relativePath', async () => {
    const { calls, context, entry } = harness(async () => 'opened');
    await AkariRoleBucketsWidget.prototype.transcribeMaterial.call(context, entry);
    assert.deepEqual(plain(calls.commands), [['akari.transcribe.openDialog', {
        projectRoot: 'file:///project', relativePath: 'assets/voice.wav'
    }]]);
    assert.deepEqual(calls.rpc, []);
    assert.equal(calls.loads, 1);
});

test('openDialog cancelled shows cancellation toast without RPC fallback', async () => {
    const { calls, context, entry } = harness(async () => 'cancelled');
    await AkariRoleBucketsWidget.prototype.transcribeMaterial.call(context, entry);
    assert.deepEqual(calls.info, ['voice.wav: Transcription canceled']);
    assert.deepEqual(calls.rpc, []);
    assert.equal(calls.loads, 1);
});

test('only NO_ACTIVE_HANDLER falls back to existing toast + transcribe RPC', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'NO_ACTIVE_HANDLER' });
    const { calls, context, entry } = harness(async () => { throw missing; });
    await AkariRoleBucketsWidget.prototype.transcribeMaterial.call(context, entry);
    assert.deepEqual(plain(calls.rpc), [{ projectRoot: 'file:///project', relativePath: 'assets/voice.wav' }]);
    assert.deepEqual(calls.info, ['voice.wav: Transcribing', 'voice.wav: Transcription complete']);
    assert.equal(calls.loads, 1);

    const failure = harness(async () => { throw Object.assign(new Error('boom'), { code: 'OTHER' }); });
    await AkariRoleBucketsWidget.prototype.transcribeMaterial.call(failure.context, failure.entry);
    assert.deepEqual(failure.calls.rpc, []);
    assert.deepEqual(failure.calls.error, ['boom']);
});
