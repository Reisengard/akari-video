import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, decideExtensionUpdate, formatExtensionUpdateNotice } from '../../lib/common/extension-freshness.js';

for (const [name, installedVersion, latestVersion, action, reason] of [
    ['update to a newer version', '2.1.210', '2.1.261', 'update', 'newer-available'],
    ['do not update the same version', '2.1.261', '2.1.261', 'none', 'up-to-date'],
    ['do not downgrade', '2.1.262', '2.1.261', 'none', 'up-to-date'],
    ['not installed', undefined, '2.1.261', 'none', 'not-installed'],
    ['registry unreachable', '2.1.210', undefined, 'none', 'registry-unavailable'],
    ['latest version is unknown', '2.1.210', 'latest', 'none', 'unparsable'],
    ['installed version is unknown', 'unknown', '2.1.261', 'none', 'unparsable'],
    ['with neither version, prefer not installed', undefined, undefined, 'none', 'not-installed']
]) {
    test(name, () => {
        assert.deepEqual(decideExtensionUpdate({ installedVersion, latestVersion }), {
            action, reason, installedVersion, latestVersion
        });
    });
}

for (const version of ['v2.1.261', '2.1.261-beta.1', '2.1.261+build']) {
    test(`${version} is equivalent to 2.1.261`, () => {
        assert.equal(compareVersions(version, '2.1.261'), 0);
        assert.equal(compareVersions('2.1.261', version), 0);
    });
}

test('comparison is -1, 0, or 1 regardless of digit width', () => {
    assert.equal(compareVersions('2.1.9', '2.1.10'), -1);
    assert.equal(compareVersions('2.1.10', '2.1.9'), 1);
    assert.equal(compareVersions('2.1.10', '2.1.10'), 0);
    assert.equal(compareVersions('3.0.0', '2.99.99'), 1);
    assert.equal(compareVersions('2.2.0', '2.1.999'), 1);
});

test('reload notice wording', () => {
    assert.equal(formatExtensionUpdateNotice('Claude Code extension', '2.1.210', '2.1.261'),
        'Updated Claude Code extension from 2.1.210 to 2.1.261. Reload to apply it.');
});

test('returns the input version strings unchanged', () => {
    assert.deepEqual(decideExtensionUpdate({ installedVersion: 'v2.1.210', latestVersion: '2.1.261+build' }), {
        action: 'update', reason: 'newer-available', installedVersion: 'v2.1.210', latestVersion: '2.1.261+build'
    });
});
