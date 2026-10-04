import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { welcomeImageCandidates } from '../../lib/onboarding/asset-paths.js';

test('Development assets search the apps/shell extensions directory', () => {
    const shell = join('C:', 'repo', 'apps', 'shell');
    const candidates = welcomeImageCandidates(join(shell, 'lib', 'backend'), shell);
    assert.ok(candidates.includes(join(shell, 'extensions', 'akari-surfaces', 'src', 'onboarding', 'welcome.webp')));
    assert.equal(candidates.length, new Set(candidates).size);
});

test('Installed assets first search the resources/app.asar extension package', () => {
    const resources = join('C:', 'package', 'resources');
    const candidates = welcomeImageCandidates(join(resources, 'app.asar', 'lib', 'backend'), join('C:', 'elsewhere'), resources);
    assert.equal(candidates[0], join(resources, 'app.asar', 'node_modules', 'akari-surfaces', 'src', 'onboarding', 'welcome.webp'));
});
