import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandService, MessageService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AkariNewProjectService } from '../common/akari-new-project-protocol';

/** Startup migration already decided what moved; the frontend only offers the next action. */
@injectable()
export class LibraryMigrationNoticeContribution implements FrontendApplicationContribution {
    @inject(AkariNewProjectService) protected readonly service!: AkariNewProjectService;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(CommandService) protected readonly commands!: CommandService;

    onDidInitializeLayout(): void {
        void this.showNotice().catch(error => console.warn('[akari-surfaces] Could not show footage migration notice:', error));
    }

    protected async showNotice(): Promise<void> {
        const notice = await this.service.takeLibraryMigrationNotice();
        if (!notice) return;
        const action = await this.messages.info(notice, 'Change location…');
        if (action === 'Change location…') await this.commands.executeCommand('akari.library.changeLocation');
    }
}
