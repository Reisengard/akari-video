import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKitCardModel, KIT_LAB_URL } from '../../lib/common/kit-card-model.js';

const base = {
    connected: true,
    entitledProducts: [],
    installedKits: [],
    pluginEnabled: true
};
const installedKit = { id: 'world-kit', version: 2, skills: ['design-world'], assetCount: 3 };

test('Disconnected kits are hidden', () => {
    assert.deepEqual(buildKitCardModel({ ...base, connected: false }), { kind: 'hidden' });
});

test('Installed enabled plugins need no enable hint', () => {
    const model = buildKitCardModel({ ...base, installedKits: [installedKit] });
    assert.equal(model.kind, 'installed');
    assert.equal(model.showEnableHint, false);
});

test('Installed disabled plugins show an enable hint', () => {
    const model = buildKitCardModel({ ...base, installedKits: [installedKit], pluginEnabled: false });
    assert.equal(model.kind, 'installed');
    assert.equal(model.showEnableHint, true);
});

test('Unknown plugin enablement is treated as disabled', () => {
    const model = buildKitCardModel({ ...base, installedKits: [installedKit], pluginEnabled: null });
    assert.equal(model.kind, 'installed');
    assert.equal(model.showEnableHint, true);
});

test('Uninstalled kit entitlements preserve order, deduplicate, and create purchased commands', () => {
    const model = buildKitCardModel({
        ...base,
        entitledProducts: [
            { id: 'world-kit', kind: 'kit', currentVersion: 2 },
            { id: 'motion-kit', kind: 'kit', currentVersion: null },
            { id: 'world-kit', kind: 'kit', currentVersion: 2 }
        ]
    });
    assert.deepEqual(model, {
        kind: 'purchased',
        productIds: ['world-kit', 'motion-kit'],
        installCommand: 'akari store install world-kit\nakari store install motion-kit'
    });
});

test('Non-kit entitlements produce unpurchased status', () => {
    assert.deepEqual(buildKitCardModel({
        ...base,
        entitledProducts: [{ id: 'course', kind: 'course', currentVersion: 1 }]
    }), { kind: 'unpurchased', labUrl: KIT_LAB_URL });
});

test('Empty entitlements produce unpurchased status', () => {
    assert.deepEqual(buildKitCardModel(base), { kind: 'unpurchased', labUrl: KIT_LAB_URL });
});

test('Installed status takes precedence over matching entitlements', () => {
    const model = buildKitCardModel({
        ...base,
        installedKits: [installedKit],
        entitledProducts: [{ id: 'world-kit', kind: 'kit', currentVersion: 2 }]
    });
    assert.equal(model.kind, 'installed');
    assert.deepEqual(model.kits, [installedKit]);
});
