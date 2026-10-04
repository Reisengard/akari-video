import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readInstalledKits } from '../../lib/node/akari-kits-service.js';

async function temporaryHome() {
    return mkdtemp(path.join(os.tmpdir(), 'akari-kits-service-'));
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('Existing ledgers normalize kit rows', async () => {
    const homeDir = await temporaryHome();
    const akariHome = path.join(homeDir, 'custom-akari');
    await writeJson(path.join(akariHome, 'kits', 'installed.json'), {
        schema: 'akari-installed-kits/v0',
        kits: [
            { id: 'world-kit', version: 2, skills: ['design-world', 42], assets: [{}, {}] },
            { id: 42, version: 1, skills: [], assets: [] }
        ]
    });
    const result = await readInstalledKits({ env: { AKARI_HOME: akariHome }, homeDir });
    assert.deepEqual(result.kits, [{ id: 'world-kit', version: 2, skills: ['design-world'], assetCount: 2 }]);
});

test('Missing ledgers produce empty kits', async () => {
    const homeDir = await temporaryHome();
    const result = await readInstalledKits({ env: {}, homeDir });
    assert.deepEqual(result.kits, []);
});

test('Malformed ledger JSON produces empty kits', async () => {
    const homeDir = await temporaryHome();
    const ledgerPath = path.join(homeDir, '.akari', 'kits', 'installed.json');
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, '{ broken', 'utf8');
    const result = await readInstalledKits({ env: {}, homeDir });
    assert.deepEqual(result.kits, []);
});

test('Missing settings.json produces unknown plugin enablement', async () => {
    const homeDir = await temporaryHome();
    const result = await readInstalledKits({ env: {}, homeDir });
    assert.equal(result.pluginEnabled, null);
});

test('Plugin keys in settings.json mark plugins enabled', async () => {
    const homeDir = await temporaryHome();
    const claudeConfigDir = path.join(homeDir, 'custom-claude');
    await writeJson(path.join(claudeConfigDir, 'settings.json'), {
        enabledPlugins: { 'akari-kits@akari-kits': false }
    });
    const result = await readInstalledKits({ env: { CLAUDE_CONFIG_DIR: claudeConfigDir }, homeDir });
    assert.equal(result.pluginEnabled, true);
});

test('Readable settings without plugin keys mark plugins disabled', async () => {
    const homeDir = await temporaryHome();
    await writeJson(path.join(homeDir, '.claude', 'settings.json'), { enabledPlugins: {} });
    const result = await readInstalledKits({ env: {}, homeDir });
    assert.equal(result.pluginEnabled, false);
});
