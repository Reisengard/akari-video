import { QuickExportLintFinding, QuickExportPhase, QuickExportStatus } from './quick-export-protocol';
import { QuickExportStage, QuickExportVerifyCheck } from './quick-export-progress';

export function quickExportStageLabel(
    stage: QuickExportStage | undefined,
    verifyCheck?: QuickExportVerifyCheck
): string | undefined {
    switch (stage) {
        case 'prepare': return 'Preparing';
        case 'audio-cut': return 'Extracting audio';
        case 'render': return 'Rendering and encoding video';
        case 'audio-mix': return 'Mixing audio';
        // 88 分 4K では確認だけで約 63 分かかり、そのうち黒画面検査が約 57 分を占める
        // （不具合メモ 第22項）。「確認」の 1 語だけでは止まったように見えるので、
        // 今どの工程かを添える。
        case 'verify': return verifyCheck
            ? `Verifying (${quickExportVerifyCheckLabel(verifyCheck)})`
            : 'Verifying';
        default: return undefined;
    }
}

export function quickExportVerifyCheckLabel(check: QuickExportVerifyCheck): string {
    switch (check) {
        case 'probe': return 'Reading media properties';
        case 'video-identity': return 'Checking video identity';
        case 'decode': return 'Decoding full video';
        case 'audio-decode': return 'Decoding audio';
        case 'audio-level': return 'Measuring audio levels';
        case 'motion': return 'Measuring motion';
        case 'blank-frames': return 'Checking blank frames';
    }
}

/**
 * render.json は前回実行の成功結果を保持し得るため、今回の quick export が
 * 実行中・中断・失敗の間は併記しない。未実行と正常完了では従来どおり表示する。
 */
export function shouldShowRenderJsonProgress(phase: QuickExportPhase | undefined): boolean {
    return phase === undefined || phase === 'idle' || phase === 'done';
}

/**
 * quick export の終端失敗を Theia 通知へ変換する。alreadyNotified を入力に含め、
 * ポーリングが同じ status を複数回返しても二重通知しない契約を純関数で固定する。
 */
export function quickExportErrorNotification(
    status: QuickExportStatus,
    alreadyNotified: boolean
): string | undefined {
    if (alreadyNotified) {
        return undefined;
    }
    if (status.phase === 'failed') {
        const summary = status.failureSummary || 'No reason was returned. Check the log';
        return `Export failed: ${summary.split(/\r?\n/)[0]}`;
    }
    if (status.phase === 'lint-failed') {
        const findings = status.lintFindings ?? [];
        const errors = lintErrorDetails(findings);
        const counts = lintFindingCounts(status);
        const reportHint = status.reportPath
            ? 'Open the lint report for details.'
            : 'Check the log.';
        const details = errors.length > 0 ? ` Details: ${errors.join('; ')}` : '';
        return `Lint failed (${counts}): export stopped. ${reportHint}${details}`;
    }
    return undefined;
}

function lintErrorDetails(findings: readonly QuickExportLintFinding[]): string[] {
    return findings
        .filter(finding => finding.severity === 'error')
        .map(finding => {
            const check = finding.check ? `[${finding.check}]` : '';
            return [check, finding.message].filter(Boolean).join(' ') || 'edit-lint error';
        });
}

function lintFindingCounts(status: QuickExportStatus): string {
    const severityCounts: string[] = [];
    if (status.lintErrorCount !== undefined) {
        severityCounts.push(`Errors: ${status.lintErrorCount}`);
    }
    if (status.lintWarningCount !== undefined) {
        severityCounts.push(`Warnings: ${status.lintWarningCount}`);
    }
    if (severityCounts.length > 0) {
        return severityCounts.join(' · ');
    }
    if (status.lintIssueCount !== undefined) {
        return `lint ${status.lintIssueCount} items`;
    }
    return 'Issue count unavailable';
}
