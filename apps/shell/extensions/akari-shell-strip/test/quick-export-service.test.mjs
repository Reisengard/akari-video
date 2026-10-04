import test from 'node:test';
import assert from 'node:assert/strict';
import { basename, resolve } from 'node:path';
import { setImmediate as waitForImmediate } from 'node:timers/promises';
import {
    AkariQuickExportServiceImpl,
    buildRevealArtifactCommand
} from '../lib/node/akari-quick-export-service.js';
import { resolveExportPreviewPath } from '../lib/node/akari-quick-export-service.js';

test('start terminates unexpected backend exceptions as failed', async () => {
    class ThrowingService extends AkariQuickExportServiceImpl {
        async run() {
            throw new Error('unexpected test failure');
        }
    }

    const service = new ThrowingService();
    assert.deepEqual(await service.start({
        projectRootUri: 'file:///project',
        outputName: 'final.mp4',
        rerunLint: false
    }), { accepted: true });
    await waitForImmediate();

    const status = await service.getStatus();
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /unexpected test failure/);
    assert.match(status.logTail, /unexpected test failure/);
});

test('start terminates missing render-cut CLI as failed with a reason', async () => {
    class MissingCliService extends AkariQuickExportServiceImpl {
        fsPath() { return '/project'; }
        async findRenderCutCli() { return undefined; }
    }

    const service = new MissingCliService();
    assert.deepEqual(await service.start({
        projectRootUri: 'file:///project',
        outputName: 'final.mp4',
        rerunLint: false
    }), { accepted: true });
    await waitForImmediate();

    const status = await service.getStatus();
    assert.equal(status.phase, 'failed');
    assert.match(status.failureSummary, /render-cut CLI/);
    assert.match(status.failureSummary, /not found/);
});

test('start includes error/warning counts and report on lint-failed', async () => {
    class LintFailureService extends AkariQuickExportServiceImpl {
        fsPath() { return '/project'; }
        async findEditLintCli() { return '/cli/edit-lint.mjs'; }
        async spawnNodeScript() {
            return {
                exitCode: 1,
                stdout: JSON.stringify({
                    findings: [
                        {
                            check: 'cuts.track-transition-unsupported',
                            severity: 'error',
                            message: 'gap-aware track engine cannot represent xfade'
                        },
                        {
                            check: 'timeline.tracks.declaration-missing',
                            severity: 'warning',
                            message: 'timeline track declaration is missing'
                        }
                    ]
                }),
                stderr: ''
            };
        }
        async existingReportPath() { return '.akari/reports/edit-lint-report.html'; }
    }

    const service = new LintFailureService();
    assert.deepEqual(await service.start({
        projectRootUri: 'file:///project',
        outputName: 'final.mp4',
        rerunLint: true
    }), { accepted: true });
    await waitForImmediate();

    assert.deepEqual(await service.getStatus(), {
        phase: 'lint-failed',
        logTail: '',
        lintIssueCount: 2,
        lintErrorCount: 1,
        lintWarningCount: 1,
        lintFindings: [
            {
                check: 'cuts.track-transition-unsupported',
                severity: 'error',
                message: 'gap-aware track engine cannot represent xfade'
            },
            {
                check: 'timeline.tracks.declaration-missing',
                severity: 'warning',
                message: 'timeline track declaration is missing'
            }
        ],
        reportPath: '.akari/reports/edit-lint-report.html'
    });
});

test('start includes render-cut stage/frame details in status', async () => {
    class ProgressService extends AkariQuickExportServiceImpl {
        fsPath() { return '/project'; }
        async findRenderCutCli() { return '/cli/render-cut.mjs'; }
        async spawnNodeScript(_scriptPath, _args, onChunk) {
            onChunk('PROGRESS stage=prepare status=start\nPROGRESS stage=prepare status=end\n');
            onChunk('PROGRESS stage=audio-cut status=start\nPROGRESS stage=audio-cut status=end\n');
            onChunk('PROGRESS stage=render status=start engine=gpu\nPROGRESS frame=3 total=10\n');
            return { exitCode: 2, stdout: '', stderr: 'test stop' };
        }
        async statOrUndefined() { return undefined; }
    }

    const service = new ProgressService();
    assert.deepEqual(await service.start({
        projectRootUri: 'file:///project',
        outputName: 'final.mp4',
        rerunLint: false
    }), { accepted: true });
    await waitForImmediate();

    const status = await service.getStatus();
    assert.equal(status.progressStage, 'render');
    assert.equal(status.progressFrame, 3);
    assert.equal(status.progressTotalFrames, 10);
    assert.equal(status.progressEngine, 'gpu');
    assert.equal(status.progressPercent, 33);
});

test('cancel sends SIGTERM to the running process group and becomes cancelled', async () => {
    // 直接の子（render-cut / osr-export の node）だけを殺すと、その子が起こした
    // ffmpeg / OSR Electron / Chromium が孤児として残り続ける。中止はグループ宛でなければならない。
    class CancelService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.groupSignals = [];
            this.directSignals = [];
            this.fakeChild = {
                pid: 4242,
                kill: signal => {
                    this.directSignals.push(signal);
                    return true;
                },
                once: (event, listener) => {
                    if (event === 'close') this.closeListener = listener;
                    return this.fakeChild;
                }
            };
        }
        platform() { return 'darwin'; }
        signalProcessGroup(pid, signal) {
            this.groupSignals.push([pid, signal]);
            queueMicrotask(() => {
                this.activeChild = undefined;
                this.closeListener?.();
            });
        }
        prime() {
            this.running = true;
            this.activeChild = this.fakeChild;
            this.status = { phase: 'rendering', logTail: '' };
        }
    }
    const service = new CancelService();
    service.prime();
    assert.deepEqual(await service.cancel(), { cancelled: true });
    assert.deepEqual(service.groupSignals, [[4242, 'SIGTERM']]);
    assert.deepEqual(service.directSignals, []);
    assert.equal((await service.getStatus()).phase, 'cancelled');
});

test('cancel sends SIGKILL to the group after 5 seconds without exit', async () => {
    class StubbornService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.groupSignals = [];
            this.fakeChild = { pid: 99, kill: () => true, once: () => this.fakeChild };
        }
        platform() { return 'linux'; }
        signalProcessGroup(pid, signal) { this.groupSignals.push([pid, signal]); }
        prime() {
            this.running = true;
            this.activeChild = this.fakeChild;
            this.status = { phase: 'rendering', logTail: '' };
        }
    }
    const service = new StubbornService();
    service.prime();
    assert.deepEqual(await service.cancel(), { cancelled: true });
    assert.deepEqual(service.groupSignals, [[99, 'SIGTERM'], [99, 'SIGKILL']]);
});

test('cancel uses taskkill /T for the Windows process tree', async () => {
    class WindowsService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.treeKills = [];
            this.fakeChild = {
                pid: 777,
                kill: () => true,
                once: (event, listener) => {
                    if (event === 'close') this.closeListener = listener;
                    return this.fakeChild;
                }
            };
        }
        platform() { return 'win32'; }
        killWindowsTree(pid) {
            this.treeKills.push(pid);
            queueMicrotask(() => {
                this.activeChild = undefined;
                this.closeListener?.();
            });
        }
        prime() {
            this.running = true;
            this.activeChild = this.fakeChild;
            this.status = { phase: 'rendering', logTail: '' };
        }
    }
    const service = new WindowsService();
    service.prime();
    assert.deepEqual(await service.cancel(), { cancelled: true });
    assert.deepEqual(service.treeKills, [777]);
});

test('onStop terminates running export groups on shell exit', () => {
    class StopService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.groupSignals = [];
            this.activeChild = { pid: 1234, kill: () => true, once: () => undefined };
        }
        platform() { return 'darwin'; }
        signalProcessGroup(pid, signal) { this.groupSignals.push([pid, signal]); }
    }
    const service = new StopService();
    service.onStop();
    assert.deepEqual(service.groupSignals, [[1234, 'SIGKILL']]);
    assert.equal(service.activeChild, undefined);
});

test('revealArtifact builds OS-specific file manager commands', () => {
    assert.deepEqual(buildRevealArtifactCommand('darwin', '/project/exports/final.mp4'), {
        command: 'open', args: ['-R', '/project/exports/final.mp4']
    });
    assert.deepEqual(buildRevealArtifactCommand('win32', 'C:\\project\\exports\\final.mp4'), {
        command: 'explorer', args: ['/select,C:\\project\\exports\\final.mp4']
    });
    assert.deepEqual(buildRevealArtifactCommand('linux', '/project/exports/final.mp4'), {
        command: 'xdg-open', args: ['/project/exports']
    });
});

test('copyArtifact reflects copy command exit code in its result', async () => {
    class CopyService extends AkariQuickExportServiceImpl {
        constructor(exitCode) {
            super();
            this.exitCode = exitCode;
        }
        prime() {
            this.currentProjectRoot = '/project';
            this.status = { phase: 'done', logTail: '', artifactPath: 'exports/final.mp4' };
        }
        platform() { return 'darwin'; }
        async spawnCopyCommand(command, args, stdin) {
            this.copyRequest = { command, args, stdin };
            return this.exitCode;
        }
    }

    const successful = new CopyService(0);
    successful.prime();
    assert.deepEqual(await successful.copyArtifact(), { copied: true });
    assert.deepEqual(successful.copyRequest, {
        command: 'osascript',
        args: ['-e', `set the clipboard to POSIX file "${resolve('/project/exports/final.mp4')}"`],
        stdin: undefined
    });

    const failed = new CopyService(7);
    failed.prime();
    const failure = await failed.copyArtifact();
    assert.equal(failure.copied, false);
    assert.match(failure.reason, /exited with code 7/);
});

test('readPreviewFrame returns allowed JPEGs as data URLs', async () => {
    class PreviewService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.currentProjectRoot = '/project';
            this.fsImpl = {
                readFile: async path => {
                    this.readPath = path;
                    return Buffer.from([0xff, 0xd8, 0xff]);
                }
            };
        }
    }
    const path = resolve('/project/.akari/cache/export-preview/30.jpg');
    assert.equal(resolveExportPreviewPath('/project', path), path);
    const service = new PreviewService();
    assert.equal(await service.readPreviewFrame(path), 'data:image/jpeg;base64,/9j/');
    assert.equal(service.readPath, path);
});

test('readPreviewFrame rejects files outside allowed directories without reading', async () => {
    class GuardedPreviewService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.currentProjectRoot = '/project';
            this.readCount = 0;
            this.fsImpl = {
                readFile: async () => {
                    this.readCount += 1;
                    return Buffer.from('unexpected');
                }
            };
        }
    }
    const outside = '/project/exports/final.mp4';
    const traversal = '/project/.akari/cache/export-preview/../../../etc/passwd';
    assert.equal(resolveExportPreviewPath('/project', outside), undefined);
    assert.equal(resolveExportPreviewPath('/project', traversal), undefined);
    const service = new GuardedPreviewService();
    assert.equal(await service.readPreviewFrame(outside), undefined);
    assert.equal(await service.readPreviewFrame(traversal), undefined);
    assert.equal(service.readCount, 0);
});

// --- recheckLint（task 2026-09-03-export-lint-auto-recheck）--------------------

const LINT_FAILED_STATUS = {
    phase: 'lint-failed',
    logTail: 'Previous export log',
    lintIssueCount: 1,
    lintErrorCount: 1,
    lintWarningCount: 0,
    lintFindings: [{ check: 'captions.overlap', severity: 'error', message: 'old finding' }],
    reportPath: '.akari/reports/edit-lint-report.html'
};

class RecheckService extends AkariQuickExportServiceImpl {
    constructor(spawnResult) {
        super();
        this.spawnResult = spawnResult;
        this.spawnCalls = [];
        this.status = { ...LINT_FAILED_STATUS };
    }
    fsPath() { return '/project'; }
    now() { return 1_772_000_000_000; }
    async findEditLintCli() { return '/cli/edit-lint.mjs'; }
    async existingReportPath() { return '.akari/reports/edit-lint-report.html'; }
    async spawnNodeScript(script, args, onChunk, options) {
        this.spawnCalls.push({ script, args, options });
        return this.spawnResult;
    }
}

test('recheckLint returns lint-failed to idle once issues are fixed', async () => {
    const service = new RecheckService({ exitCode: 0, stdout: '{"findings":[]}', stderr: '' });

    const result = await service.recheckLint({ projectRootUri: 'file:///project' });

    assert.equal(result.outcome, 'pass');
    assert.equal(result.status.phase, 'idle');
    assert.equal(result.status.lintFindings, undefined);
    assert.equal(result.status.lintErrorCount, undefined);
    assert.equal(result.status.lintCheckedAt, 1_772_000_000_000);
    assert.equal((await service.getStatus()).phase, 'idle');
    // 再検査は書き出しのログを汚さない（子プロセス出力は status.logTail へ流さない）。
    assert.equal((await service.getStatus()).logTail, 'Previous export log');
    // 中止ボタンの対象にしない子として起動する。
    assert.deepEqual(service.spawnCalls[0].options, { trackActive: false });
    assert.deepEqual(service.spawnCalls[0].args, ['/project', '--json']);
});

test('recheckLint updates findings when issues remain', async () => {
    const service = new RecheckService({
        exitCode: 1,
        stdout: JSON.stringify({
            findings: [
                { check: 'captions.overlap', severity: 'error', message: 'new finding' },
                { check: 'timeline.tracks.declaration-missing', severity: 'warning', message: 'warn' }
            ]
        }),
        stderr: ''
    });

    const result = await service.recheckLint({ projectRootUri: 'file:///project' });

    assert.equal(result.outcome, 'lint-failed');
    assert.equal(result.status.phase, 'lint-failed');
    assert.equal(result.status.lintIssueCount, 2);
    assert.equal(result.status.lintErrorCount, 1);
    assert.equal(result.status.lintWarningCount, 1);
    assert.equal(result.status.lintFindings[0].message, 'new finding');
    assert.equal(result.status.lintCheckedAt, 1_772_000_000_000);
});

test('recheckLint does not run or change status during export', async () => {
    const service = new RecheckService({ exitCode: 0, stdout: '{"findings":[]}', stderr: '' });
    service.running = true;

    const result = await service.recheckLint({ projectRootUri: 'file:///project' });

    assert.equal(result.outcome, 'skipped');
    assert.equal(result.status.phase, 'lint-failed');
    assert.equal(service.spawnCalls.length, 0);
});

test('recheckLint discards results if export starts during checks', async () => {
    class RaceService extends RecheckService {
        async spawnNodeScript(script, args, onChunk, options) {
            this.running = true;
            return super.spawnNodeScript(script, args, onChunk, options);
        }
    }
    const service = new RaceService({ exitCode: 0, stdout: '{"findings":[]}', stderr: '' });

    const result = await service.recheckLint({ projectRootUri: 'file:///project' });

    assert.equal(result.outcome, 'skipped');
    assert.equal((await service.getStatus()).phase, 'lint-failed');
});

test('recheckLint retains findings as unavailable on missing CLI or abnormal exit', async () => {
    class MissingCliService extends RecheckService {
        async findEditLintCli() { return undefined; }
    }
    const missing = new MissingCliService({ exitCode: 0, stdout: '', stderr: '' });
    const missingResult = await missing.recheckLint({ projectRootUri: 'file:///project' });
    assert.equal(missingResult.outcome, 'unavailable');
    assert.match(missingResult.reason, /edit-lint CLI/);
    assert.equal(missingResult.status.phase, 'lint-failed');
    assert.equal(missingResult.status.lintFindings[0].message, 'old finding');

    const crashed = new RecheckService({ exitCode: 2, stdout: '', stderr: 'boom' });
    const crashedResult = await crashed.recheckLint({ projectRootUri: 'file:///project' });
    assert.equal(crashedResult.outcome, 'unavailable');
    assert.match(crashedResult.reason, /boom|exit code 2/);
    assert.equal(crashedResult.status.phase, 'lint-failed');
});

// --- 中止で残った作業ディレクトリの片付け（押されたときだけ消す）-----------------

/** `.akari/render-tmp` を模した最小の fs スタブ。 */
function leftoverService(entriesAtStart, entriesNow, sizes = {}) {
    const removed = [];
    class LeftoverService extends AkariQuickExportServiceImpl {
        constructor() {
            super();
            this.removed = removed;
            this.currentProjectRoot = '/project';
            this.renderTmpEntriesAtStart = new Set(entriesAtStart);
        }
        async readRenderTmpEntries() { return new Set(entriesNow); }
        async treeSize(path) { return sizes[basename(path)] ?? 0; }
    }
    const service = new LeftoverService();
    service.fsImpl.rm = async path => { removed.push(path); };
    return service;
}

test('After cancel, existing work directories are excluded from new leftovers', async () => {
    const service = leftoverService(['old-run'], ['old-run', 'new-run'], { 'new-run': 30 * 1024 * 1024 });
    const leftover = await service.measureCancelledLeftover();
    assert.deepEqual(leftover, { entries: ['new-run'], bytes: 30 * 1024 * 1024 });
});

test('After cancel, no new entries means undefined leftover without cleanup action', async () => {
    const service = leftoverService(['old-run'], ['old-run']);
    assert.equal(await service.measureCancelledLeftover(), undefined);
});

test('discardCancelledLeftover deletes only leftover entries and returns bytes', async () => {
    const service = leftoverService(['old-run'], ['old-run', 'new-run'], { 'new-run': 1024 });
    service.status = { phase: 'cancelled', logTail: '', cancelledLeftover: { entries: ['new-run'], bytes: 1024 } };
    // 削除後は増分が消えた状態を返す（数え直しで leftover が消える）。
    service.readRenderTmpEntries = async () => new Set(['old-run']);
    assert.deepEqual(await service.discardCancelledLeftover(), { discarded: true, bytes: 1024 });
    assert.deepEqual(service.removed, [resolve('/project/.akari/render-tmp/new-run')]);
    assert.equal((await service.getStatus()).cancelledLeftover, undefined);
});

test('discardCancelledLeftover does not delete while exporting', async () => {
    const service = leftoverService([], ['new-run']);
    service.running = true;
    service.status = { phase: 'rendering', logTail: '', cancelledLeftover: { entries: ['new-run'], bytes: 1 } };
    const result = await service.discardCancelledLeftover();
    assert.equal(result.discarded, false);
    assert.deepEqual(service.removed, []);
});

test('discardCancelledLeftover does nothing without leftovers', async () => {
    const service = leftoverService([], []);
    service.status = { phase: 'cancelled', logTail: '' };
    const result = await service.discardCancelledLeftover();
    assert.equal(result.discarded, false);
    assert.deepEqual(service.removed, []);
});

test('resolveRenderTmpEntry rejects traversal and absolute paths outside render-tmp', () => {
    const service = leftoverService([], []);
    const inside = service.resolveRenderTmpEntry('/project', 'run-1');
    assert.equal(inside, resolve('/project/.akari/render-tmp/run-1'));
    assert.equal(service.resolveRenderTmpEntry('/project', '../../../etc'), undefined);
    assert.equal(service.resolveRenderTmpEntry('/project', '/etc/passwd'), undefined);
    assert.equal(service.resolveRenderTmpEntry('/project', '..'), undefined);
});

test('discardCancelledLeftover fails without deleting entries outside render-tmp', async () => {
    const service = leftoverService([], ['x']);
    service.status = { phase: 'cancelled', logTail: '', cancelledLeftover: { entries: ['../../escape'], bytes: 1 } };
    const result = await service.discardCancelledLeftover();
    assert.equal(result.discarded, false);
    assert.deepEqual(service.removed, []);
});
