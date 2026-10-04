import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { bundledMediaBinCandidate, packagedCliCandidates, packagedPackageEntryCandidates } from '../lib/node/packaged-cli-candidates.js';

// パッケージ版バックエンドの実測値（`theia build` の単一バンドルなので __dirname は常にここ）。
const PACKAGED_DIRNAME = '/Applications/AKARI Video.app/Contents/Resources/app.asar/lib/backend';
const RESOURCES_PATH = '/Applications/AKARI Video.app/Contents/Resources';
// 開発起動（npm start / Electron 直起動）での __dirname。
const DEV_DIRNAME = '/repo/apps/shell/lib/backend';

test('packagedCliCandidates prioritizes resourcesPath', () => {
    const candidates = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
    assert.equal(candidates[0], resolve(RESOURCES_PATH, 'packages/render-cut/bin/render-cut.mjs'));
});

test('packagedCliCandidates finds Resources through ancestors without resourcesPath', () => {
    // process.resourcesPath が使えない経路でも壊れないことの保証（多重防御）。
    const candidates = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME);
    assert.ok(
        candidates.includes(resolve(RESOURCES_PATH, 'packages/render-cut/bin/render-cut.mjs')),
        `Resources candidate missing from ancestor search: ${candidates.join(', ')}`
    );
});

test('packagedCliCandidates finds root packages in development layouts', () => {
    const candidates = packagedCliCandidates('edit-lint', 'edit-lint.mjs', DEV_DIRNAME);
    assert.ok(
        candidates.includes(resolve('/repo/packages/edit-lint/bin/edit-lint.mjs')),
        `Repository root candidate missing: ${candidates.join(', ')}`
    );
});

test('packagedCliCandidates does not depend on process.cwd()', () => {
    // 受け入れ条件「探索パスが process.cwd() に依存しなくなっている」の機械化。
    // 旧実装は cwd 起点の候補を 2 件持っており、パッケージ版（cwd = `/`）では
    // どちらも `/packages/...` に潰れて当たらなかった。
    const original = process.cwd();
    try {
        process.chdir('/tmp');
        const fromTmp = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
        process.chdir('/');
        const fromRoot = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
        assert.deepEqual(fromTmp, fromRoot);
    } finally {
        process.chdir(original);
    }
});

test('packagedCliCandidates keeps legacy sibling candidates at the end', () => {
    const candidates = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
    assert.equal(candidates.at(-1), resolve(PACKAGED_DIRNAME, '../render-cut/bin/render-cut.mjs'));
});

test('packagedCliCandidates contains no duplicates', () => {
    const candidates = packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
    assert.equal(new Set(candidates).size, candidates.length);
});

test('packagedPackageEntryCandidates prioritizes resourcesPath for preview-server src entry', () => {
    const candidates = packagedPackageEntryCandidates('preview-server', 'src/server.mjs', PACKAGED_DIRNAME, RESOURCES_PATH);
    assert.equal(candidates[0], resolve(RESOURCES_PATH, 'packages/preview-server/src/server.mjs'));
});

test('packagedPackageEntryCandidates finds Resources through ancestors without resourcesPath', () => {
    const candidates = packagedPackageEntryCandidates('preview-server', 'src/server.mjs', PACKAGED_DIRNAME);
    assert.ok(
        candidates.includes(resolve(RESOURCES_PATH, 'packages/preview-server/src/server.mjs')),
        `Resources candidate missing from ancestor search: ${candidates.join(', ')}`
    );
});

test('packagedCliCandidates delegation preserves the exact prior array order', () => {
    // 委譲前実装のインライン展開: resourcesPath 基点 → 祖先探索（深さ 10）→ 兄弟配置、を dedupe。
    const relativePath = 'packages/render-cut/bin/render-cut.mjs';
    const expected = [resolve(RESOURCES_PATH, relativePath)];
    let current = resolve(PACKAGED_DIRNAME);
    for (let depth = 0; depth < 10; depth++) {
        expected.push(resolve(current, relativePath));
        const parent = dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    expected.push(resolve(PACKAGED_DIRNAME, '..', 'render-cut', 'bin', 'render-cut.mjs'));
    assert.deepEqual(
        packagedCliCandidates('render-cut', 'render-cut.mjs', PACKAGED_DIRNAME, RESOURCES_PATH),
        [...new Set(expected)]
    );
});

test('bundledMediaBinCandidate points to Resources/media-bin', () => {
    assert.equal(
        bundledMediaBinCandidate('ffmpeg', RESOURCES_PATH, 'darwin'),
        resolve(RESOURCES_PATH, 'media-bin/ffmpeg')
    );
    assert.equal(
        bundledMediaBinCandidate('ffprobe', RESOURCES_PATH, 'win32'),
        resolve(RESOURCES_PATH, 'media-bin/ffprobe.exe')
    );
});

test('bundledMediaBinCandidate is undefined in development without resourcesPath', () => {
    assert.equal(bundledMediaBinCandidate('ffmpeg', undefined, 'darwin'), undefined);
});
