import * as React from '@theia/core/shared/react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { Emitter, Event } from '@theia/core/lib/common';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { AkariExportSessionService } from '../akari-export-session-service';
import { ensureExportDialogStyle } from './export-dialog-style';
import { ExportSetupView } from './export-setup-view';
import { ExportRunningView } from './export-running-view';
import { ExportDoneView } from './export-done-view';
import { ExportLintFailedView } from './export-lint-failed-view';

export class AkariExportDialog extends ReactDialog<void> {
    protected readonly visibilityEmitter = new Emitter<boolean>();
    readonly onDidChangeVisibility: Event<boolean> = this.visibilityEmitter.event;

    constructor(protected readonly session: AkariExportSessionService) {
        super({ title: 'Export', maxWidth: 880 });
        this.addClass('akari-export-dialog-host');
        this.node.setAttribute('data-akari-onboarding-target', 'export-dialog');
        ensureExportDialogStyle();
        this.toDispose.push(this.session.onDidChange(() => this.update()));
        this.toDispose.push(this.visibilityEmitter);
    }

    get value(): void {
        return undefined;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // 開いた瞬間に lint を検査し直させる（保持された古い所見を出さないため）。
        this.session.setDialogVisible(true);
        this.visibilityEmitter.fire(true);
    }

    protected override onAfterDetach(msg: Message): void {
        super.onAfterDetach(msg);
        this.session.setDialogVisible(false);
        this.visibilityEmitter.fire(false);
    }

    protected render(): React.ReactNode {
        const snapshot = this.session.snapshot;
        const status = snapshot.status;
        const running = status.phase === 'linting' || status.phase === 'rendering';
        const view = running
            ? 'running'
            : status.phase === 'done' && !snapshot.setupRequested
                ? 'done'
                : status.phase === 'lint-failed' && !snapshot.setupRequested
                    ? 'lint-failed'
                    : 'setup';
        const subtitle = view === 'running'
            ? `${snapshot.outputName} · Continues after closing`
            : view === 'done'
                ? status.artifactPath ?? snapshot.outputName
                : view === 'lint-failed'
                    ? `Lint found ${status.lintIssueCount ?? 0} items`
                    : `${snapshot.projectLabel || 'This project'} · Output settings from edit.json`;
        return (
            <div className='popup' role='dialog' aria-modal='true' aria-labelledby='akari-export-dialog-title'>
                <div className='ph'>
                    <div><div className='ttl' id='akari-export-dialog-title'>{view === 'done' ? 'Export complete' : 'Export'}</div><div className='sub'>{subtitle}</div></div>
                    {running && <span className='pill'><span className='dot blink' />Exporting · {status.progressPercent ?? 0}%</span>}
                    <button type='button' className='x' aria-label='Close' onClick={() => this.close()}>×</button>
                </div>
                {view === 'running' && <ExportRunningView session={this.session} snapshot={snapshot} close={() => this.close()} />}
                {view === 'done' && <ExportDoneView session={this.session} snapshot={snapshot} close={() => this.close()} />}
                {view === 'lint-failed' && <ExportLintFailedView session={this.session} snapshot={snapshot} close={() => this.close()} />}
                {view === 'setup' && <ExportSetupView session={this.session} snapshot={snapshot} />}
            </div>
        );
    }
}
