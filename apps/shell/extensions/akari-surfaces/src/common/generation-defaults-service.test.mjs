import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { AkariConnectionsServiceImpl } from '../../lib/node/akari-connections-service.js';

const execFileAsync = promisify(execFile);
const envNames = ['AKARI_CREATOR_ROOT', 'AKARI_HOME', 'AKARI_CREDENTIALS_FILE'];
const minimal = () => ({
    providers: [], policy: { currency: 'JPY', monthly_budget: null, approval_threshold: null }, memory: []
});

async function findRepoFile(relativeTarget) {
    let directory = path.dirname(fileURLToPath(import.meta.url));
    for (;;) {
        const candidate = path.resolve(directory, relativeTarget);
        try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Try parent. */ }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    throw new Error(`${relativeTarget} was not found`);
}

async function withEnvironment(run) {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'akari-generation-defaults-'));
    const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
    const rootDir = path.join(scratch, 'workspace');
    const homeDir = path.join(scratch, 'home');
    const credentialsPath = path.join(scratch, 'credentials.env');
    try {
        const creatorPath = await findRepoFile('packages/creator-root/src/index.mjs');
        const creator = await import(pathToFileURL(creatorPath).href);
        await creator.createCreatorRoot(rootDir);
        await fs.mkdir(homeDir, { recursive: true });
        process.env.AKARI_CREATOR_ROOT = rootDir;
        process.env.AKARI_HOME = homeDir;
        process.env.AKARI_CREDENTIALS_FILE = credentialsPath;
        await run({ scratch, rootDir, homeDir, credentialsPath, connectionsPath: path.join(rootDir, '.akari', 'connections.json') });
    } finally {
        for (const name of envNames) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
        await fs.rm(scratch, { recursive: true, force: true });
    }
}

test('Missing connections.json creates minimal video defaults that pass schema validation', () => withEnvironment(async context => {
    await fs.unlink(context.connectionsPath);
    const service = new AkariConnectionsServiceImpl();
    await service.setGenerationDefaults({ video: 'fal:kling-v3-pro-i2v' });
    const document = JSON.parse(await fs.readFile(context.connectionsPath, 'utf8'));
    assert.deepEqual(document.providers, []);
    assert.deepEqual(document.policy, { currency: 'JPY', monthly_budget: null, approval_threshold: null });
    assert.deepEqual(document.memory, []);
    assert.equal(document.defaults.generate.video, 'fal:kling-v3-pro-i2v');
    assert.equal(Object.hasOwn(document.defaults.generate, 'still'), false);
    const validator = await findRepoFile('packages/schemas/bin/validate-connections.mjs');
    const result = await execFileAsync(process.execPath, [validator, context.connectionsPath]);
    assert.match(result.stdout, /^OK:/);
}));

test('Updating video defaults preserves providers, policy, memory, and still defaults', () => withEnvironment(async context => {
    const document = minimal();
    document.providers.push({ fixture: 'provider' });
    document.policy.monthly_budget = 1234;
    document.memory.push({ fixture: 'memory' });
    document.defaults = { generate: { still: 'fal:nano-banana-pro-edit', video: 'fal:h3-i2v' } };
    await fs.writeFile(context.connectionsPath, `${JSON.stringify(document, null, 2)}\n`);
    const before = JSON.parse(await fs.readFile(context.connectionsPath, 'utf8'));
    await new AkariConnectionsServiceImpl().setGenerationDefaults({ video: 'fal:veo-3.1-flf' });
    const after = JSON.parse(await fs.readFile(context.connectionsPath, 'utf8'));
    assert.equal(JSON.stringify(after.providers), JSON.stringify(before.providers));
    assert.equal(JSON.stringify(after.policy), JSON.stringify(before.policy));
    assert.equal(JSON.stringify(after.memory), JSON.stringify(before.memory));
    assert.equal(JSON.stringify(after.defaults.generate.still), JSON.stringify(before.defaults.generate.still));
    assert.equal(after.defaults.generate.video, 'fal:veo-3.1-flf');
}));

test('Unknown IDs and wrong model kinds leave existing files unchanged', () => withEnvironment(async context => {
    await fs.unlink(context.connectionsPath);
    const service = new AkariConnectionsServiceImpl();
    await assert.rejects(service.setGenerationDefaults({ video: 'fal:does-not-exist' }), /Model not in catalog/);
    await assert.rejects(fs.stat(context.connectionsPath), { code: 'ENOENT' });
    await fs.writeFile(context.connectionsPath, `${JSON.stringify(minimal(), null, 2)}\n`);
    const beforeText = await fs.readFile(context.connectionsPath, 'utf8');
    const beforeStat = await fs.stat(context.connectionsPath);
    await assert.rejects(service.setGenerationDefaults({ video: 'codex:image' }), /Model not in catalog/);
    const afterStat = await fs.stat(context.connectionsPath);
    assert.equal(await fs.readFile(context.connectionsPath, 'utf8'), beforeText);
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
}));

test('Saving default models preserves credentials.env modification time', () => withEnvironment(async context => {
    await fs.writeFile(context.credentialsPath, 'FAL_KEY=fixture\n');
    const before = await fs.stat(context.credentialsPath);
    await new AkariConnectionsServiceImpl().setGenerationDefaults({ video: 'fal:h3-i2v' });
    const after = await fs.stat(context.credentialsPath);
    assert.equal(after.mtimeMs, before.mtimeMs);
}));

test('Each default model reports its workspace or bundled source', () => withEnvironment(async context => {
    const document = minimal();
    document.defaults = { generate: { video: 'fal:kling-v3-pro-i2v' } };
    await fs.writeFile(context.connectionsPath, `${JSON.stringify(document, null, 2)}\n`);
    // npm test の cwd は SURF であり、そこに project 層の .akari/connections.json は存在しない前提。
    await assert.rejects(fs.stat(path.join(process.cwd(), '.akari', 'connections.json')), { code: 'ENOENT' });
    const result = await new AkariConnectionsServiceImpl().readGenerationDefaults();
    assert.equal(result.source.video, 'workspace');
    assert.equal(result.source.still, 'default');
    assert.equal(result.effective.still, 'codex:image');
    assert.equal(result.workspacePath, path.resolve(context.connectionsPath));
}));

test('Missing workspaces allow reads and reject writes with a distinct message', () => withEnvironment(async context => {
    process.env.AKARI_CREATOR_ROOT = path.join(context.scratch, 'missing-workspace');
    process.env.AKARI_HOME = context.homeDir;
    const service = new AkariConnectionsServiceImpl();
    const result = await service.readGenerationDefaults();
    assert.equal(result.workspacePath, null);
    await assert.rejects(service.setGenerationDefaults({ video: 'fal:h3-i2v' }), /Workspace not found/);
}));
