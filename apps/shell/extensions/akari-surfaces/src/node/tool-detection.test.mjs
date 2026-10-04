import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { detectTools as detectToolsImpl } from '../../lib/node/tool-detection.js';

const detectTools = options => detectToolsImpl({ fetchImpl: async () => ({ ok: false }), ...options });

function tool(result, id) {
    return result.tools.find(entry => entry.id === id);
}

test('FFmpeg measures the PATH executable version', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-present-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const bin = join(scratch, 'bin');
    await mkdir(bin);
    const fakeFfmpeg = join(bin, 'ffmpeg');
    await writeFile(fakeFfmpeg, '#!/bin/sh\necho "ffmpeg version 9.9-test"\n');
    await chmod(fakeFfmpeg, 0o755);

    const result = await detectTools({
        platform: 'linux',
        env: { PATH: bin },
        homeDir: scratch,
        now: () => new Date('2026-08-11T00:00:00.000Z')
    });
    assert.deepEqual(tool(result, 'ffmpeg'), {
        id: 'ffmpeg', tier: 'required', available: true,
        executable: 'ffmpeg', version: 'ffmpeg version 9.9-test'
    });
});

test('FFmpeg is unavailable when removed from PATH', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-absent-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const emptyBin = join(scratch, 'empty-bin');
    await mkdir(emptyBin);

    const result = await detectTools({ platform: 'linux', env: { PATH: emptyBin }, homeDir: scratch });
    assert.deepEqual(tool(result, 'ffmpeg'), { id: 'ffmpeg', tier: 'required', available: false });
});

test('Missing macOS CLT recommends setup without calling git', async () => {
    const calls = [];
    const result = await detectTools({
        platform: 'darwin',
        env: { PATH: '/empty' },
        homeDir: '/nonexistent',
        pathExists: async () => false,
        runCommand: async (command, args) => {
            calls.push([command, args]);
            return { ok: false, stdout: '', stderr: 'not installed' };
        }
    });
    assert.deepEqual(tool(result, 'xcode-clt'), {
        id: 'xcode-clt', tier: 'recommended', available: false
    });
    assert.ok(calls.some(([command, args]) => command === 'xcode-select' && args[0] === '-p'));
    assert.equal(calls.some(([command]) => command === 'git'), false);
});

test('Tools placed in managed bin are detected again without brew', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-akaribin-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const binDir = join(scratch, '.akari', 'tools', 'bin');
    await mkdir(binDir, { recursive: true });
    const fakeYtDlp = join(binDir, 'yt-dlp');
    await writeFile(fakeYtDlp, '#!/bin/sh\necho "2026.08.17"\n');
    await chmod(fakeYtDlp, 0o755);

    const result = await detectTools({ platform: 'linux', env: { PATH: '/empty' }, homeDir: scratch });
    const ytDlp = tool(result, 'yt-dlp');
    assert.equal(ytDlp.available, true);
    assert.equal(ytDlp.executable, fakeYtDlp);
});

test('Non-macOS platforms omit CLT', async () => {
    const result = await detectTools({
        platform: 'linux', env: { PATH: '/empty' }, homeDir: '/nonexistent',
        pathExists: async () => false,
        runCommand: async () => ({ ok: false, stdout: '', stderr: '' })
    });
    assert.equal(tool(result, 'xcode-clt'), undefined);
});

test('VOICEVOX detects missing, stopped, and running versions through mocked filesystem and HTTP', async () => {
    const runCommand = async () => ({ ok: false, stdout: '', stderr: '' });
    const base = { platform: 'darwin', env: { PATH: '/empty' }, homeDir: '/isolated',
        resourcesPath: '', devSearchRoots: [], runCommand, pathExists: async () => false };
    let result = await detectTools(base);
    assert.equal(tool(result, 'voicevox').available, false);
    const localRun = '/isolated/Applications/VOICEVOX.app/Contents/Resources/vv-engine/run';
    result = await detectTools({ ...base, pathExists: async path => path === localRun });
    assert.equal(tool(result, 'voicevox').executable, localRun);
    assert.equal(tool(result, 'voicevox').version, undefined);
    result = await detectTools({ ...base, pathExists: async path => path === localRun,
        fetchImpl: async url => {
            assert.equal(url, 'http://127.0.0.1:50021/version');
            return { ok: true, json: async () => '0.25.2' };
        } });
    assert.equal(tool(result, 'voicevox').version, '0.25.2');
});

// --- 同梱バイナリ検知（進捗バー + 同梱ファースト裁定） ------------------------------

test('Bundled FFmpeg under resources media-bin takes priority over PATH', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-bundled-resources-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const resourcesPath = join(scratch, 'Resources');
    const mediaBinDir = join(resourcesPath, 'media-bin');
    await mkdir(mediaBinDir, { recursive: true });
    const bundledFfmpeg = join(mediaBinDir, 'ffmpeg');
    await writeFile(bundledFfmpeg, '#!/bin/sh\necho "ffmpeg version bundled-test"\n');
    await chmod(bundledFfmpeg, 0o755);
    const pathBin = join(scratch, 'bin');
    await mkdir(pathBin);
    const pathFfmpeg = join(pathBin, 'ffmpeg');
    await writeFile(pathFfmpeg, '#!/bin/sh\necho "ffmpeg version path-test"\n');
    await chmod(pathFfmpeg, 0o755);

    const result = await detectTools({
        platform: 'linux', env: { PATH: pathBin }, homeDir: scratch, resourcesPath, devSearchRoots: []
    });
    const ffmpeg = tool(result, 'ffmpeg');
    assert.equal(ffmpeg.available, true);
    assert.equal(ffmpeg.executable, bundledFfmpeg);
    assert.match(ffmpeg.version, /bundled-test/);
});

test('Development FFmpeg searches ancestor platform vendor directories', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-dev-vendor-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const vendorDir = join(scratch, 'packages', 'media-bin', 'vendor', 'linux-x64');
    await mkdir(vendorDir, { recursive: true });
    const devFfmpeg = join(vendorDir, 'ffmpeg');
    await writeFile(devFfmpeg, '#!/bin/sh\necho "ffmpeg version dev-vendor-test"\n');
    await chmod(devFfmpeg, 0o755);

    const result = await detectTools({
        platform: 'linux', arch: 'x64', env: { PATH: '/empty' }, homeDir: scratch, devSearchRoots: [scratch]
    });
    const ffmpeg = tool(result, 'ffmpeg');
    assert.equal(ffmpeg.available, true);
    assert.equal(ffmpeg.executable, devFfmpeg);
});

test('FFmpeg resolves environment override before bundled executable before PATH', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-priority-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));

    const pathBin = join(scratch, 'bin');
    await mkdir(pathBin);
    const pathFfmpeg = join(pathBin, 'ffmpeg');
    await writeFile(pathFfmpeg, '#!/bin/sh\necho path\n');
    await chmod(pathFfmpeg, 0o755);

    const vendorDir = join(scratch, 'packages', 'media-bin', 'vendor', 'linux-x64');
    await mkdir(vendorDir, { recursive: true });
    const bundledFfmpeg = join(vendorDir, 'ffmpeg');
    await writeFile(bundledFfmpeg, '#!/bin/sh\necho bundled\n');
    await chmod(bundledFfmpeg, 0o755);

    const envFfmpeg = join(scratch, 'env-ffmpeg');
    await writeFile(envFfmpeg, '#!/bin/sh\necho env\n');
    await chmod(envFfmpeg, 0o755);

    const bundledOnly = await detectTools({
        platform: 'linux', arch: 'x64', env: { PATH: '/empty' }, homeDir: scratch, devSearchRoots: [scratch]
    });
    assert.equal(tool(bundledOnly, 'ffmpeg').executable, bundledFfmpeg);

    const bundledOverPath = await detectTools({
        platform: 'linux', arch: 'x64', env: { PATH: pathBin }, homeDir: scratch, devSearchRoots: [scratch]
    });
    assert.equal(tool(bundledOverPath, 'ffmpeg').executable, bundledFfmpeg);

    const envOverAll = await detectTools({
        platform: 'linux', arch: 'x64', env: { PATH: pathBin, AKARI_FFMPEG_BIN: envFfmpeg },
        homeDir: scratch, devSearchRoots: [scratch]
    });
    assert.equal(tool(envOverAll, 'ffmpeg').executable, envFfmpeg);
});

test('Windows managed tools are detected with exe extensions', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-win-akaribin-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const binDir = join(scratch, '.akari', 'tools', 'bin');
    await mkdir(binDir, { recursive: true });
    const fakeYtDlpExe = join(binDir, 'yt-dlp.exe');
    await writeFile(fakeYtDlpExe, '#!/bin/sh\necho "2026.08.17"\n');
    await chmod(fakeYtDlpExe, 0o755);

    const result = await detectTools({ platform: 'win32', env: { PATH: '/empty' }, homeDir: scratch });
    const ytDlp = tool(result, 'yt-dlp');
    assert.equal(ytDlp.available, true);
    assert.equal(ytDlp.executable, fakeYtDlpExe);
});

// --- whisper: 本体 + モデルの 2 資産 ------------------------------------------------

test('Whisper uses bundled vendor candidates and is available when its model exists', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-whisper-bundled-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const vendorDir = join(scratch, 'packages', 'media-bin', 'vendor', 'linux-x64');
    await mkdir(vendorDir, { recursive: true });
    const devWhisper = join(vendorDir, 'whisper-cli');
    await writeFile(devWhisper, '#!/bin/sh\necho "whisper.cpp dev-vendor-test"\n');
    await chmod(devWhisper, 0o755);
    const modelsDir = join(scratch, '.akari', 'tools', 'models');
    await mkdir(modelsDir, { recursive: true });
    await writeFile(join(modelsDir, 'ggml-tiny.bin'), 'fake-model');

    const result = await detectTools({
        platform: 'linux', arch: 'x64', env: { PATH: '/empty' }, homeDir: scratch, devSearchRoots: [scratch]
    });
    const whisper = tool(result, 'whisper');
    assert.equal(whisper.executable, devWhisper);
    assert.equal(whisper.available, true);
    assert.equal(whisper.model.available, true);
    assert.equal(whisper.model.path, join(modelsDir, 'ggml-tiny.bin'));
});

test('Whisper remains unavailable when its executable exists but model is missing', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-whisper-no-model-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const bin = join(scratch, 'bin');
    await mkdir(bin);
    const fakeWhisper = join(bin, 'whisper-cli');
    await writeFile(fakeWhisper, '#!/bin/sh\necho "whisper.cpp help-test"\n');
    await chmod(fakeWhisper, 0o755);

    const result = await detectTools({ platform: 'linux', env: { PATH: bin }, homeDir: scratch });
    const whisper = tool(result, 'whisper');
    // PATH 解決で見つかった場合、executable は実測に使った候補文字列そのもの（bare command
    // 'whisper-cli'）を返す — 既存の ffmpeg PATH テストと同じ契約（絶対パスへは解決しない）。
    assert.equal(whisper.executable, 'whisper-cli');
    assert.equal(whisper.available, false);
    assert.equal(whisper.model.available, false);
    assert.equal(whisper.model.path, undefined);
});

test('Existing WHISPER_CPP_MODEL paths take priority', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-whisper-model-env-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const customModel = join(scratch, 'custom-model.bin');
    await writeFile(customModel, 'fake-model-bytes');
    const bin = join(scratch, 'bin');
    await mkdir(bin);
    const fakeWhisper = join(bin, 'whisper-cli');
    await writeFile(fakeWhisper, '#!/bin/sh\necho ok\n');
    await chmod(fakeWhisper, 0o755);

    const result = await detectTools({
        platform: 'linux', env: { PATH: bin, WHISPER_CPP_MODEL: customModel }, homeDir: scratch
    });
    const whisper = tool(result, 'whisper');
    assert.equal(whisper.model.available, true);
    assert.equal(whisper.model.path, customModel);
    assert.equal(whisper.available, true);
});

test('Whisper model remains missing without overrides or a models directory', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-tools-whisper-model-none-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));

    const result = await detectTools({ platform: 'linux', env: { PATH: '/empty' }, homeDir: scratch });
    const whisper = tool(result, 'whisper');
    assert.equal(whisper.model.available, false);
    assert.equal(whisper.model.path, undefined);
});

// The CLI and shell consume this exact ordered table and exclusion predicate.
import { whisperModelLocations, whisperModelCandidates, isWhisperModelExcluded } from '../../../../../../packages/akari-tools/src/media/whisper-model-candidates.mjs';

test('CLI model locations keep their priority, recursive search and exclusions', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-model-candidates-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const options = { env: { WHISPER_CPP_MODEL: join(scratch, 'override.bin') }, homeDir: scratch, repoRoot: join(scratch, 'repo'), bin: join(scratch, 'bin/whisper-cli') };
    const locations = whisperModelLocations(options);
    assert.deepEqual(locations.map(item => item.path), [
        options.env.WHISPER_CPP_MODEL,
        join(scratch, '.akari/tools/models'), join(scratch, 'repo/models'), join(scratch, 'repo/whisper.cpp/models'),
        join(scratch, '.cache/whisper.cpp'), join(scratch, 'Library/Caches/whisper.cpp'), join(scratch, 'share/whisper-cpp'),
        '/opt/homebrew/share/whisper-cpp', '/usr/local/share/whisper-cpp',
        join(scratch, 'Library/Application Support/com.prakashjoshipax.VoiceInk/WhisperModels')
    ]);
    assert.equal(locations[0].recursive, false);
    assert.ok(locations.slice(1).every(item => item.recursive));
    for (const candidate of ['for-tests-model.bin', 'ggml-tiny.en.bin']) assert.equal(isWhisperModelExcluded(candidate), true);
    assert.equal(isWhisperModelExcluded('/for-tests-parent/ggml-large.bin'), false);
    const nested = join(locations[1].path, 'nested/GGML-large.BIN');
    await mkdir(join(locations[1].path, 'nested'), { recursive: true });
    await writeFile(nested, 'test');
    assert.ok(whisperModelCandidates(options).includes(nested));
    assert.equal(whisperModelCandidates(options)[0], options.env.WHISPER_CPP_MODEL);
});

test('VoiceInk alone is ready; removing it makes the model missing; nested English models are ignored', async t => {
    const scratch = await mkdtemp(join(tmpdir(), 'akari-model-voiceink-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const voiceInk = join(scratch, 'Library/Application Support/com.prakashjoshipax.VoiceInk/WhisperModels/nested');
    await mkdir(voiceInk, { recursive: true });
    const model = join(voiceInk, 'ggml-large-v3-turbo-q5_0.bin');
    await writeFile(model, 'test');
    await writeFile(join(voiceInk, 'ggml-tiny.en.bin'), 'test');
    const options = {
        platform: 'darwin', env: {}, homeDir: scratch, repoRoot: scratch, devSearchRoots: [],
        // Isolate global Homebrew paths without changing the real installation.
        pathExists: async path => path.startsWith(scratch) && await import('node:fs').then(fs => fs.existsSync(path)),
        listDir: async path => path.startsWith(scratch) ? await import('node:fs/promises').then(fs => fs.readdir(path, { recursive: true })).catch(() => []) : [],
        runCommand: async command => ({ ok: command === 'whisper-cli', stdout: 'ok', stderr: '' })
    };
    let result = tool(await detectTools(options), 'whisper');
    assert.equal(result.available, true);
    assert.deepEqual(result.model, { available: true, path: model });
    await rm(model);
    result = tool(await detectTools(options), 'whisper');
    assert.equal(result.available, false);
    assert.deepEqual(result.needs, ['Model missing']);
});

test('shell uses WHISPER_CPP_MODEL first and excludes test/English overrides', async () => {
    for (const override of ['/override.bin', '/for-tests-model.bin', '/ggml-tiny.en.bin']) {
        const result = await detectTools({
            platform: 'linux', homeDir: '/isolated', repoRoot: '/repo', devSearchRoots: [],
            env: { WHISPER_CPP_MODEL: override }, pathExists: async () => true,
            listDir: async path => path === '/isolated/.akari/tools/models' ? ['ggml-large.bin'] : [],
            runCommand: async () => ({ ok: true, stdout: '', stderr: '' })
        });
        assert.equal(tool(result, 'whisper').model.path, override === '/override.bin' ? override : '/isolated/.akari/tools/models/ggml-large.bin');
    }
});

test('SpeechAnalyzer uses the CLI --check helper on macOS and reports OS / CLT conditions', async () => {
    for (const [value, expected] of [
        [{ available: true }, { available: true }],
        [{ available: false, reason: 'swiftc が PATH 上にありません' }, { available: false, needs: ['Command Line Tools missing'] }],
        [{ available: false, reason: 'macOS 15.0 は 26 未満です' }, { available: false, unsupported: true, needs: ['macOS 15.0 は 26 未満です'] }]
    ]) {
        const calls = [];
        const result = await detectTools({
            platform: 'darwin', env: {}, homeDir: '/isolated', repoRoot: '/repo', devSearchRoots: [], listDir: async () => [],
            pathExists: async path => path === '/repo/skills/analyze-footage/bin/transcribe-sa.mjs',
            runCommand: async (command, args, env) => {
                calls.push({ command, args, env });
                return { ok: args.includes('--check'), stdout: JSON.stringify(value), stderr: '' };
            }
        });
        assert.deepEqual(tool(result, 'speech-analyzer'), { id: 'speech-analyzer', tier: 'recommended', ...expected });
        assert.ok(calls.some(call => call.command === process.execPath && call.args[0] === '/repo/skills/analyze-footage/bin/transcribe-sa.mjs' && call.args[1] === '--check' && call.env.ELECTRON_RUN_AS_NODE === '1'));
    }
    for (const platform of ['linux', 'win32']) {
        const calls = [];
        const result = await detectTools({ platform, env: {}, homeDir: '/isolated', repoRoot: '/repo', devSearchRoots: [],
            pathExists: async () => false, listDir: async () => [],
            runCommand: async (_, args) => { calls.push(args); return { ok: false, stdout: '', stderr: '' }; }
        });
        assert.deepEqual(tool(result, 'speech-analyzer'), { id: 'speech-analyzer', tier: 'recommended', available: false, unsupported: true });
        assert.equal(calls.some(args => args.includes('--check')), false);
    }
});
