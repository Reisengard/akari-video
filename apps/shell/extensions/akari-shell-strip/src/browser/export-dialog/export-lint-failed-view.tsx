import * as React from '@theia/core/shared/react';
import { lintRecheckHint } from '../../common/export-lint-recheck';
import { QuickExportLintFinding } from '../../common/quick-export-protocol';
import { AkariExportSessionService, ExportSessionSnapshot } from '../akari-export-session-service';
import { ExportFrame, VideoFacts } from './export-view-shared';

function findingTitle(finding: QuickExportLintFinding): string {
    return finding.severity === 'warning' ? 'Some items need your review' : 'Fix these issues before exporting';
}

export function ExportLintFailedView(props: {
    session: AkariExportSessionService;
    snapshot: ExportSessionSnapshot;
    close: () => void;
}): React.ReactNode {
    const { session, snapshot } = props;
    const status = snapshot.status;
    // ExportDoneView と同じ理由: このダイアログはモーダルなので、開いたレポートのタブは
    // ダイアログを閉じるまで見えない。開く操作は閉じるところまでで 1 つ。
    const openAndClose = (path: string | undefined): void => {
        props.close();
        void session.openArtifact(path);
    };
    const findings = [...(status.lintFindings ?? [])].sort((left, right) =>
        (left.severity === 'error' ? 0 : 1) - (right.severity === 'error' ? 0 : 1));
    const warningOnly = (status.lintErrorCount ?? findings.filter(finding => finding.severity === 'error').length) === 0;
    return (
        <>
            <div className='pb'>
                <div className='left'>
                    <div className='sec'><span>This video</span><span className='r'>Stopped by lint</span></div>
                    <ExportFrame video={snapshot.video} />
                    <VideoFacts video={snapshot.video} />
                    <p className='fine'>Fix the issues, then export again with the same settings.</p>
                    <p className='fine'>{lintRecheckHint({
                        rechecking: snapshot.lintRechecking,
                        checkedAt: status.lintCheckedAt
                    })}</p>
                </div>
                <div className='rwrap'>
                    <div className='right'>
                        <div className='sec'><span>Stopped before exporting</span><span className='r'>Lint · Errors {status.lintErrorCount ?? 0} · Warnings {status.lintWarningCount ?? 0}</span></div>
                        {findings.length === 0 && <div className='finding'><i /><div><b>Review the lint issues</b>{status.failureSummary ?? 'See the lint report for details.'}</div></div>}
                        {findings.map((finding, index) => (
                            <div className={`finding${finding.severity === 'warning' ? ' warn' : ''}`} key={`${finding.check ?? 'finding'}-${index}`}>
                                <i /><div><b>{findingTitle(finding)}</b>{finding.message ?? 'Check the lint report for details.'} {finding.check && <code>{finding.check}</code>}</div>
                            </div>
                        ))}
                        <div className='acts'>
                            <button type='button' className='btn primary' onClick={() => void session.handOffLintFailure()}>Ask Partner to fix</button>
                            <button
                                type='button'
                                className='btn'
                                disabled={snapshot.lintRechecking}
                                onClick={() => void session.recheckLint()}
                            >{snapshot.lintRechecking ? 'Checking…' : 'Run checks again'}</button>
                            <button type='button' className='btn' disabled={!status.reportPath} onClick={() => openAndClose(status.reportPath)}>Open lint report</button>
                            {warningOnly && <button type='button' className='btn ghost' onClick={() => void session.start({ rerunLint: false })}>Export anyway</button>}
                        </div>
                        <p className='fine'>Asking Partner to fix sends these findings to AI chat.</p>
                    </div>
                </div>
            </div>
            <div className='pf'><span className='fn'>After fixing, return to settings and try again.</span><span className='sp' /><button type='button' className='btn' onClick={() => session.resetToSetup()}>Back to settings</button></div>
        </>
    );
}
