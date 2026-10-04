import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { AiAnswer, INITIAL_ONBOARDING_STATE, nextOnboardingState, OnboardingState, OnboardingStep,
    onboardingCaptionSeekTime, onboardingCount, onboardingRevisit, previousGuidePosition } from './model';
import { AkariOnboardingService, SampleInformation } from './protocol';
import { ONBOARDING_CSS } from './style';
import { automaticGuideTransition, guideRecoveryView } from './recovery-model';
import { BEFORE_AFTER_DATA_URL } from './before-after-data';
import { guideShowsChat, guideTargetsChat, guideNeedsPartner, shouldRevealPartner, guideInputCutouts,
    guideBlockerClipPath, pointInGuideCutouts, shouldBlockGuidePointer, partnerFallbackReady, askHighlightTarget,
    askConnectionCopy, captionCoachPosition, materialPreviewTransportRect, needsCaptionStyleSelection,
    outputCaptionBandRect, GuideRect } from './guide-ui-model';
import { introVisual, inviteMarkup } from './intro-model';
import { groupChatLines } from './chat-model';
import { CAPTION_GUIDE_COPY, DAIHON_GUIDE_COPY, MATERIAL_PREVIEW_SELECT_COPY,
    guideOffersHelpNext, guideWaitingHint, HELP_DELAY } from './guide-copy';

interface CoachSpec {
    key?: string;
    title: string;
    body: string;
    holes?: string[];
    clear?: string[];
    rings?: string[];
    labels?: string[];
    buttons?: Array<[string, string, boolean]>;
    choices?: Array<[AiAnswer, string, string]>;
    link?: [string, string];
    wide?: boolean;
    narrow?: boolean;
    noDim?: boolean;
    fullFog?: boolean;
    minimal?: boolean;
    bounce?: boolean;
    place?: 'left' | 'right' | 'top' | 'bottom';
}

const PROMPT = 'Please edit this video. Add captions, diagrams, sound effects, and BGM to match the speech.';
const LOG: Array<{ t: number; lines: string[]; live?: string; count?: number;
    captions?: boolean; stage?: number; lint?: boolean }> = [
    { t: 500, live: 'Checking footage…', lines: ['Checking footage.'] },
    { t: 1300, lines: ['akari media probe assets/サンプル動画.mp4', '37.6 seconds · 1280×720 · 30 fps · With audio'] },
    { t: 2300, live: 'Checking speech boundaries…', lines: ['Aligned transcript word timing with the speech waveform.'] },
    { t: 3000, live: 'Adding main video…', lines: ['edit.json', 'Main video added'], count: 0 },
    { t: 4000, live: 'Adding captions…', lines: ['Created short captions → captions.json'], captions: true },
    { t: 7400, live: 'Adding title…', lines: ['Added an opening title and a name card when AKARI Video is spoken'], stage: 1 },
    { t: 8400, live: 'Adding captions…', lines: ['Added captions for Conversation with AI and Editing is already done'], stage: 2 },
    { t: 9500, live: 'Syncing sound effects…', lines: ['Synced sound effects, a flash, and a zoom with the speech'], stage: 3 },
    { t: 10700, live: 'Adding diagram…', lines: ['Added a timeline diagram when the speaker mentions diagrams'], stage: 4 },
    { t: 11800, live: 'Creating phone screen…', lines: ['Placed a portrait version of this video in a phone mockup'], stage: 5 },
    { t: 12900, live: 'Adding BGM…', lines: ['Added BGM under the voice and raised its volume when BGM is mentioned'], stage: 6 },
    { t: 13900, live: 'Finishing captions…', lines: ['Added karaoke highlighting synced with the voice'], stage: 7 },
    { t: 14900, live: 'Adding ending…', lines: ['Added Editing AI credits at the end'], stage: 8 },
    { t: 15800, live: 'Checking…', lines: ['edit-lint .', 'No issues'], lint: true },
    { t: 16400, live: 'Done', lines: ['Done. Play the preview to check it. Use Export… in the left menu to export.'] }
];
const esc = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export class OnboardingController {
    protected state: OnboardingState = INITIAL_ONBOARDING_STATE;
    protected root: HTMLDivElement | undefined;
    protected hero = '';
    protected sample?: SampleInformation;
    protected videoUrl?: string;
    protected thumbnailUrl?: string;
    protected logLines: string[] = [];
    protected live = 'Checking footage…';
    protected busy = false;
    protected prepareError = '';
    protected workError = false;
    protected promptTyped = '';
    protected timers: number[] = [];
    protected exportPoll?: number;
    protected exportFinishing = false;
    protected exportInertObserver?: MutationObserver;
    protected placeFrame?: number;
    protected lastRects = '';
    protected fogFrom: DOMRect[] = [];
    protected fogTo: DOMRect[] = [];
    protected fogFrame?: number;
    protected coachKey = '';
    protected coachToken = 0;
    protected dragStarted = false;
    protected dragHintTimer?: number;
    protected bounceTimer?: number;
    protected captionRingReady = false;
    protected tourTimer?: number;
    protected sourceExample = false;
    protected helpTimers: number[] = [];
    protected helpKey = '';
    protected transitionBusy = false;
    protected transitionFailure?: { retry: () => Promise<void>; skipCleanup?: () => Promise<void> };
    protected tourCleanupFailed = false;
    protected recoveryTimers: number[] = [];
    protected stepEnteredAt = 0;
    protected lastInteractionAt = 0;
    protected idleCloseTimer?: number;
    protected stepSerial = 0;
    protected revealedPartnerSerial = -1;
    protected partnerRevealAttempts = 0;
    protected lastPartnerRevealAt = 0;
    protected inputCutouts: GuideRect[] = [];

    constructor(
        protected readonly service: AkariOnboardingService,
        protected readonly files: FileService,
        protected readonly openProject: (uri: string) => Promise<void>,
        protected readonly showOutput: (uri: string) => Promise<void>,
        protected readonly showAssets: () => Promise<void>,
        protected readonly seekOutput: (uri: string, time: number) => Promise<void>,
        protected readonly startOwnVideo: () => Promise<void>,
        protected readonly openGuideSettings: () => Promise<void>,
        protected readonly showClosedNotice: () => void
    ) {}

    async open(initial?: OnboardingState): Promise<void> {
        try { await this.openUnchecked(initial); }
        catch (error) { this.closeVisual(); throw error; }
    }

    protected async openUnchecked(initial?: OnboardingState): Promise<void> {
        this.closeVisual();
        this.state = initial ?? INITIAL_ONBOARDING_STATE;
        this.hero = await this.service.heroDataUrl();
        this.root = document.createElement('div');
        this.root.id = 'akari-onboarding-v1';
        this.root.setAttribute('data-akari-onboarding-step', this.state.step);
        this.root.innerHTML = `<style>${ONBOARDING_CSS}</style><div class="ao-example-host"></div><div class="ao-chat-host"></div><div class="ao-dim"></div><div class="ao-input-blocker"></div><div class="ao-holes"></div><div class="ao-rings"></div><div class="ao-hint"></div><div class="ao-takeover-host"></div><div class="ao-finder-host"></div><div class="ao-coach-host"></div><div class="ao-recovery-host"></div><div class="ao-close-host"></div>`;
        this.root.addEventListener('click', event => void this.handleClick(event));
        this.root.addEventListener('dragstart', event => {
            if ((event.target as Element).closest('[data-ao-file]')) {
                event.dataTransfer?.setData('application/x-akari-onboarding-sample', 'sample');
                this.dragStarted = true;
                this.hideDragHint();
            }
        });
        this.root.addEventListener('dragend', () => {
            this.dragStarted = false;
            if (this.state.step === 'drag' && !this.state.imported) this.scheduleDragHint();
        });
        document.body.appendChild(this.root);
        document.body.classList.add('akari-onboarding-active');
        document.addEventListener('click', this.handleExternalClick, true);
        document.addEventListener('drop', this.handleDrop, true);
        document.addEventListener('dragover', this.handleDragOver, true);
        window.addEventListener('keydown', this.handleKeyDown, true);
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'])
            document.addEventListener(type, this.guardPointer, true);
        window.addEventListener('akari.preview.playbackTick', this.handlePlayback as EventListener);
        window.addEventListener('akari.preview.captionSelected', this.handleCaptionSelection as EventListener);
        if (this.state.projectUri) {
            try {
                const prepared = await this.service.prepare();
                this.sample = prepared.sample;
                if (this.state.step !== 'invite') {
                    await this.showOutput(this.state.projectUri);
                    if (this.state.step === 'caption') {
                        const time = onboardingCaptionSeekTime(this.sample.segments);
                        if (time !== undefined) await this.seekOutput(this.state.projectUri, time);
                    }
                }
            } catch (error) {
                this.live = error instanceof Error ? error.message : String(error);
            }
        }
        this.render();
        this.followTargets();
        if (this.state.step === 'prompt' && this.state.sub === 0) this.startPromptTypewriter();
        if (this.state.step === 'work') void this.startWork();
        if (this.state.step === 'export' && this.state.sub >= 3) this.beginExportPoll();
        this.enterStep();
    }

    protected closeVisual(): void {
        for (const timer of this.recoveryTimers) window.clearTimeout(timer);
        this.recoveryTimers = [];
        if (this.idleCloseTimer) window.clearTimeout(this.idleCloseTimer);
        this.idleCloseTimer = undefined;
        this.stepSerial++;
        this.transitionFailure = undefined;
        this.transitionBusy = false;
        for (const timer of this.timers) window.clearTimeout(timer);
        this.timers = [];
        if (this.exportPoll) window.clearInterval(this.exportPoll);
        this.exportInertObserver?.disconnect();
        this.exportInertObserver = undefined;
        if (this.placeFrame) cancelAnimationFrame(this.placeFrame);
        if (this.fogFrame) cancelAnimationFrame(this.fogFrame);
        if (this.dragHintTimer) window.clearTimeout(this.dragHintTimer);
        if (this.bounceTimer) window.clearTimeout(this.bounceTimer);
        if (this.tourTimer) window.clearTimeout(this.tourTimer);
        this.clearHelp();
        this.root?.remove();
        this.root = undefined;
        this.revealedPartnerSerial = -1;
        this.partnerRevealAttempts = 0;
        this.inputCutouts = [];
        document.body.classList.remove('akari-onboarding-active');
        document.body.classList.remove('akari-onboarding-export-active');
        document.body.classList.remove('akari-onboarding-chat-active');
        document.body.classList.remove('akari-onboarding-daihon-active');
        document.removeEventListener('click', this.handleExternalClick, true);
        document.removeEventListener('drop', this.handleDrop, true);
        document.removeEventListener('dragover', this.handleDragOver, true);
        window.removeEventListener('keydown', this.handleKeyDown, true);
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'])
            document.removeEventListener(type, this.guardPointer, true);
        window.removeEventListener('akari.preview.playbackTick', this.handlePlayback as EventListener);
        window.removeEventListener('akari.preview.captionSelected', this.handleCaptionSelection as EventListener);
        if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
        this.videoUrl = undefined;
        this.thumbnailUrl = undefined;
    }

    async close(): Promise<void> {
        if (!this.root) return;
        this.closeVisual();
        this.showClosedNotice();
        try { await this.service.markSeen(); }
        catch (error) { console.error('[akari-onboarding] close marker could not be saved:', error); }
    }

    protected async go(step: OnboardingStep, sub = 0, skipCleanup = false): Promise<void> {
        await this.runTransition(() => this.goUnchecked(step, sub, skipCleanup), () => this.go(step, sub),
            skipCleanup ? undefined : () => this.go(step, sub, true));
    }

    protected async runTransition(operation: () => Promise<void>, retry: () => Promise<void>,
        skipCleanup?: () => Promise<void>): Promise<void> {
        if (!this.root || this.transitionBusy) return;
        this.transitionBusy = true;
        this.transitionFailure = undefined;
        this.tourCleanupFailed = false;
        this.renderRecovery();
        try { await operation(); }
        catch (error) {
            if (!this.root) return;
            console.error('[akari-onboarding] transition failed:', error);
            if (this.tourTimer) window.clearTimeout(this.tourTimer);
            this.clearHelp();
            this.transitionFailure = { retry, skipCleanup: this.tourCleanupFailed ? skipCleanup : undefined };
        } finally {
            this.transitionBusy = false;
            this.renderRecovery();
        }
    }

    protected async goUnchecked(step: OnboardingStep, sub = 0, skipCleanup = false): Promise<void> {
        this.clearHelp();
        if (this.dragHintTimer) window.clearTimeout(this.dragHintTimer);
        this.hideDragHint();
        if (this.tourTimer) window.clearTimeout(this.tourTimer);
        const old = this.state.step;
        if (old !== step) window.dispatchEvent(new Event('akari.onboarding.clearPreviewSelection'));
        if (step === 'drag' && this.state.exampleActive && !this.state.workCompleted && this.state.projectUri && this.sample) {
            if (!skipCleanup) {
                try { await this.service.resetTourExample(this.state.projectUri, this.sample.sourcePath, this.sample.segments); }
                catch (error) { this.tourCleanupFailed = true; throw error; }
            }
            if (!this.root) return;
            // Skipping cleanup leaves the example asset in the project, ready for the existing imported branch.
            this.state = { ...this.state, exampleActive: false, imported: skipCleanup || this.state.imported };
            window.dispatchEvent(new Event('akari.onboarding.refreshProject'));
            window.dispatchEvent(new Event('akari.onboarding.refreshTimeline'));
            await new Promise<void>(resolve => window.setTimeout(resolve, 450));
            if (!this.root) return;
        } else if (step.startsWith('tour') && !old.startsWith('tour') && !this.state.exampleActive
            && !this.state.workCompleted && this.state.projectUri && this.sample) {
            if (!this.state.imported) await this.service.importSample(this.state.projectUri, this.sample.sourcePath);
            if (!this.root) return;
            this.state = { ...this.state, exampleActive: true };
            await this.service.save(this.state);
            await this.service.writeExample(this.state.projectUri, this.sample.sourcePath, this.sample.segments, this.sample.segments.length, true);
            if (!this.root) return;
            window.dispatchEvent(new Event('akari.onboarding.refreshProject'));
            window.dispatchEvent(new Event('akari.onboarding.refreshTimeline'));
        }
        if (['welcome', 'first', 'invite'].includes(old)) {
            const take = this.root?.querySelector<HTMLElement>('.ao-takeover');
            take?.querySelector('.ao-text')?.classList.add('out');
            await new Promise<void>(resolve => window.setTimeout(resolve, 250));
            if (!this.root) return;
            if (step === 'tour0') {
                take?.classList.add('out');
                await new Promise<void>(resolve => window.setTimeout(resolve, 380));
                if (!this.root) return;
            }
        }
        if (step === 'matpreview' && this.state.materialOpened) sub = 1;
        if (step === 'play' && this.state.played) sub = 1;
        this.state = nextOnboardingState(this.state, step, sub);
        await this.service.save(this.state);
        if (!this.root) return;
        this.render();
        this.enterStep();
        if (old === 'matpreview' && (step === 'drag' || step === 'ask') && this.state.projectUri)
            await this.showOutput(this.state.projectUri);
        if (step === 'prompt') this.startPromptTypewriter();
        if (step === 'work') void this.startWork();
        if ((step === 'play' || step === 'caption') && this.state.projectUri) {
            const time = step === 'caption' ? onboardingCaptionSeekTime(this.sample?.segments ?? []) : 0;
            if (time !== undefined) await this.seekOutput(this.state.projectUri, time);
        }
        if (step === 'export') this.beginExportPoll();
        if (step === 'done') await this.service.markSeen();
    }

    protected async setSub(sub: number): Promise<void> {
        await this.runTransition(() => this.setSubUnchecked(sub), () => this.setSub(sub));
    }

    protected async setSubUnchecked(sub: number): Promise<void> {
        this.clearHelp();
        const next = { ...this.state, sub };
        await this.service.save(next);
        if (!this.root) return;
        this.state = next;
        this.render();
        this.enterStep();
    }

    protected enterStep(): void {
        for (const timer of this.recoveryTimers) window.clearTimeout(timer);
        this.recoveryTimers = [];
        this.stepEnteredAt = performance.now();
        this.lastInteractionAt = this.stepEnteredAt;
        const serial = ++this.stepSerial;
        this.partnerRevealAttempts = 0;
        if (shouldRevealPartner(this.state.step, serial, this.revealedPartnerSerial)) this.revealPartner();
        this.scheduleHelp();
        this.ensureCaptionStyleSelection(serial);
        if (this.tourTimer) window.clearTimeout(this.tourTimer);
        this.scheduleIdleClose(serial);
        this.renderRecovery();
        if (this.state.step === 'drag' && !this.state.imported) this.scheduleDragHint();
        if (this.state.step === 'done') this.celebrate();
    }

    protected revealPartner(): void {
        this.revealedPartnerSerial = this.stepSerial;
        this.partnerRevealAttempts++;
        this.lastPartnerRevealAt = performance.now();
        window.dispatchEvent(new Event('akari.onboarding.revealPartner'));
    }

    protected ensureCaptionStyleSelection(serial: number, attempt = 0): void {
        if (this.state.step !== 'caption' || this.state.sub !== 1) return;
        this.helpTimers.push(window.setTimeout(() => {
            if (!this.root || serial !== this.stepSerial) return;
            const color = document.querySelector<HTMLElement>('[data-akari-bar-item="captionTextColor"]');
            const visible = !!color && getComputedStyle(color).display !== 'none'
                && getComputedStyle(color).visibility === 'visible' && color.getClientRects().length > 0;
            if (!needsCaptionStyleSelection(this.state.step, this.state.sub, visible)) return;
            window.dispatchEvent(new Event('akari.onboarding.assistCaptionSelection'));
            if (attempt < 2) this.ensureCaptionStyleSelection(serial, attempt + 1);
        }, 200 + attempt * 450));
    }

    protected scheduleIdleClose(serial: number): void {
        if (this.idleCloseTimer) window.clearTimeout(this.idleCloseTimer);
        this.idleCloseTimer = undefined;
        if (this.state.step === 'done') return;
        this.idleCloseTimer = window.setTimeout(() => {
            if (this.root && serial === this.stepSerial) this.renderRecovery();
        }, 10000);
    }

    protected noteInteraction(): void {
        this.lastInteractionAt = performance.now();
        this.scheduleIdleClose(this.stepSerial);
        this.renderRecovery();
    }

    protected async advanceAutomatically(): Promise<void> {
        const transition = automaticGuideTransition(this.state.step, this.state.sub);
        if (!transition) return;
        if (transition.kind === 'sub') await this.setSub(transition.target as number);
        else await this.go(transition.target as OnboardingStep);
    }

    protected renderRecovery(): void {
        if (!this.root) return;
        const spec = this.coach();
        const view = guideRecoveryView({
            step: this.state.step, sub: this.state.sub,
            elapsedMs: Math.max(0, performance.now() - this.stepEnteredAt),
            idleMs: Math.max(0, performance.now() - this.lastInteractionAt),
            hasVisibleAction: !!(spec?.buttons?.length || spec?.choices?.length || spec?.link),
            transitioning: this.transitionBusy, failed: !!this.transitionFailure
        });
        const coach = this.root.querySelector<HTMLElement>('.ao-coach');
        const fallback = coach?.querySelector('[data-ao="fallback-next"]');
        if (view.showFallbackNext && coach && !fallback) {
            let actions = coach.querySelector<HTMLElement>('.ao-actions');
            if (!actions) { actions = document.createElement('div'); actions.className = 'ao-actions'; coach.appendChild(actions); }
            actions.insertAdjacentHTML('beforeend', '<button class="primary" data-ao="fallback-next">Next →</button>');
            this.lastRects = '';
            this.placeCoach();
        } else if (!view.showFallbackNext) fallback?.remove();
        const closeHost = this.root.querySelector<HTMLElement>('.ao-close-host')!;
        if (view.showIdleClose && !closeHost.firstElementChild)
            closeHost.innerHTML = '<button class="ao-idle-close" data-ao="idle-close">Close guide ×</button>';
        else if (!view.showIdleClose) closeHost.replaceChildren();
        const recoveryHost = this.root.querySelector<HTMLElement>('.ao-recovery-host')!;
        if (view.showError && !recoveryHost.firstElementChild) recoveryHost.innerHTML =
            '<div class="ao-transition-error" role="alert"><p>Could not continue. Please try again.</p><div class="ao-actions"><button class="primary" data-ao="retry-transition">Try again</button><button data-ao="close-guide">Close guide</button></div></div>';
        else if (!view.showError) recoveryHost.replaceChildren();
        const skipButton = recoveryHost.querySelector('[data-ao="skip-cleanup"]');
        if (view.showError && this.transitionFailure?.skipCleanup && !skipButton)
            recoveryHost.querySelector('.ao-actions')?.insertAdjacentHTML('beforeend',
                '<button data-ao="skip-cleanup">Skip cleanup and continue</button>');
        else if (!this.transitionFailure?.skipCleanup) skipButton?.remove();
        recoveryHost.querySelector<HTMLButtonElement>('[data-ao="retry-transition"]')?.toggleAttribute('disabled', !view.showRetry);
    }

    protected clearHelp(): void {
        for (const timer of this.helpTimers) window.clearTimeout(timer);
        this.helpTimers = [];
        this.helpKey = '';
    }

    protected waitingHint(): string | undefined {
        return guideWaitingHint(this.state);
    }

    protected scheduleHelp(): void {
        this.clearHelp();
        const hint = this.waitingHint();
        const key = `${this.state.step}:${this.state.sub}`;
        this.helpKey = key;
        if (hint) this.helpTimers.push(window.setTimeout(() => {
            if (!this.root || this.helpKey !== key) return;
            const body = this.root.querySelector<HTMLElement>('.ao-coach .ao-body');
            if (body && !body.querySelector('.ao-help')) body.insertAdjacentHTML('beforeend', `<p class="ao-help">${esc(hint)}</p>`);
            this.root.querySelector('.ao-ring, .ao-hole')?.classList.add('bounce');
            this.lastRects = '';
            this.placeCoach();
        }, HELP_DELAY.hint));
        if (!guideOffersHelpNext(this.state)) return;
        this.helpTimers.push(window.setTimeout(() => {
            if (!this.root || this.helpKey !== key) return;
            const coach = this.root.querySelector<HTMLElement>('.ao-coach');
            if (!coach || coach.querySelector('[data-ao="help-next"]')) return;
            let actions = coach.querySelector<HTMLElement>('.ao-actions');
            if (!actions) { actions = document.createElement('div'); actions.className = 'ao-actions'; coach.appendChild(actions); }
            actions.insertAdjacentHTML('beforeend', '<button class="primary" data-ao="help-next">Next</button>');
            this.lastRects = '';
            this.placeCoach();
        }, HELP_DELAY.next));
    }

    protected async assistStep(): Promise<void> {
        const { step, sub } = this.state;
        if (step === 'drag') return this.importSample();
        if (step === 'matpreview') {
            document.querySelector<HTMLElement>('[data-akari-onboarding-target="sample-card"]')?.click();
            this.state = { ...this.state, materialOpened: true };
            return this.setSub(1);
        }
        if (step === 'ask') { this.state = { ...this.state, answer: 'none' }; return this.setSub(1); }
        if (step === 'prompt') return sub === 0 ? this.setSub(1) : this.go('work');
        if (step === 'play') {
            document.querySelector<HTMLElement>('[data-akari-onboarding-target="play-button"]')?.click();
            this.state = { ...this.state, played: true };
            return this.setSub(1);
        }
        if (step === 'caption') {
            if (sub === 0) window.dispatchEvent(new Event('akari.onboarding.assistCaptionSelection'));
            if (sub === 2) return this.go('daihon');
            return this.setSub(sub + 1);
        }
        if (step === 'daihon') {
            document.querySelector<HTMLElement>(`[data-akari-onboarding-target="${sub === 0 ? 'daihon-button' : 'daihon-first-row'}"]`)?.click();
            return this.setSub(sub + 1);
        }
        if (step === 'export') {
            if (sub === 0) {
                if (!this.exportMenuIsOpen()) this.pressExportMenuTab();
                if (this.exportMenuIsOpen()) await this.setSub(1);
            } else {
                document.querySelector<HTMLElement>(`[data-akari-onboarding-target="${['menu-button', 'export-button', 'export-submit'][sub]}"]`)?.click();
            }
        }
    }

    protected takeover(): string {
        const brand = introVisual(this.state.step).brand ? '<div class="ao-brand">AKARI VIDEO</div>' : '';
        if (this.state.step === 'welcome') return `${brand}<h2>Welcome to AKARI Video</h2><div class="ao-actions"><button class="primary" data-ao="next">Next</button></div>`;
        if (this.state.step === 'first') return '<h2>Is this your first time using AKARI Video?</h2><div class="ao-actions"><button class="primary" data-ao="yes">First time</button><button data-ao="no">Used it before</button></div>';
        if (this.state.step === 'invite') return inviteMarkup(this.busy, esc(this.prepareError));
        return `<div class="ao-congrats">Congratulations</div><h2>Your first video is ready</h2><button class="ao-magic" data-ao="own"><span>Start with your own video</span><b>→</b><i>✦</i><i>✦</i><i>✦</i></button><div class="ao-secondary"><button data-ao="explore">Explore this project</button><span>·</span><button data-ao="again">Watch again</button><span>·</span><button data-ao="learn">Learn more</button></div>`;
    }

    protected coach(): CoachSpec | undefined {
        const sub = this.state.sub;
        switch (this.state.step) {
            case 'tour0': return sub === 0
                ? { title: 'Get to know the layout', body: '', minimal: true, fullFog: true, buttons: [['Next', 'next', true]] }
                : { title: 'This is the AKARI Video screen', body: '', minimal: true, noDim: true,
                    buttons: [['Next →', 'next', false]] };
            case 'tour1': return { title: '① Footage is on the left', holes: ['assets'], labels: ['① Footage'],
                body: '<p>Add your videos and photos here. They appear as cards.</p>', buttons: [['Next', 'next', true]] };
            case 'tour2': return sub === 0
                ? { title: '② Preview is at the top', holes: ['output'], labels: ['② Top: Preview'],
                    body: '<p>Play and check your result here.</p>', buttons: [['Next', 'next', true]] }
                : { title: '② Timeline is at the bottom', holes: ['timeline'], labels: ['② Bottom: Timeline'],
                    body: '<p>Video, captions, and audio appear in time order.</p>', buttons: [['Next', 'next', true]] };
            case 'tour3': return sub === 0
                ? { title: '③ AI partner is on the right', holes: ['replay-chat'], labels: ['③ AI partner'], place: 'left',
                    body: '<p>Describe what you want and the AI edits your video.</p><p>Your requests and AI replies appear as shown on the right.</p>', buttons: [['Next', 'next', true]] }
                : { title: 'Now, let us make this together', body: '', minimal: true, fullFog: true, buttons: [['Next', 'next', true]] };
            case 'drag': return this.state.imported
                ? { title: 'Footage is already imported', holes: ['assets'], body: '<p>Continue to the next step.</p>', buttons: [['Next', 'next', true]] }
                : { title: 'First, import footage', holes: ['assets'], rings: ['finder-file'], wide: true,
                body: `<p>Drag the sample video to Footage on the left.</p><p class="ao-note">${navigator.platform.includes('Mac') ? 'Finder' : 'Explorer'} lets you preview the contents on the right.</p>`,
                link: ['import', 'Click here if dragging is difficult'] };
            case 'matpreview': return sub === 0
                ? { ...MATERIAL_PREVIEW_SELECT_COPY, clear: ['assets'], rings: ['sample-card'] }
                : { title: 'This is the footage preview', holes: ['material-preview'], rings: ['material-play-toggle'], body: '<p>Press ▶ below to play. Continue after checking.</p>', buttons: [['Next', 'next', true]] };
            case 'ask': return sub === 0
                ? { title: 'Ask the AI on the right to edit', holes: ['partner'], rings: ['answer-choices'], wide: true, place: 'left',
                    body: '<p>Describe what you want and the AI builds the timeline. Do you already use an AI service?</p>',
                    choices: [['claude', 'Claude', 'Pro・Max'], ['chatgpt', 'ChatGPT', 'Free accounts work too'], ['google', 'Google', 'AI Pro or free account'], ['none', 'None of these', ''], ['other', 'Other AI', 'Cursor, Copilot, Devin, and others']] }
                : { title: 'Follow a prepared example this time', holes: [askHighlightTarget(this.state.answer)], wide: true, place: 'left',
                    body: `<p>${askConnectionCopy(this.state.answer)}</p><p>Next, a prepared example shows the process from request to result without using AI. Connect a real AI partner at the end.</p>`,
                    buttons: [['Start example', 'replay', true]], link: ['reanswer', 'Choose again'] };
            case 'prompt': return onboardingRevisit(this.state) === 'completed'
                ? { title: 'The example has finished', clear: ['replay-chat'], rings: ['replay-input'], place: 'left',
                    body: '<p>Watch again or continue.</p>', buttons: [['Watch again', 'again-work', false], ['Next', 'next', true]] }
                : sub === 0
                ? { title: 'Ask the AI like this', clear: ['replay-chat'], rings: ['replay-input'], wide: true, place: 'left',
                    body: `<div class="ao-prompt-entry">「<span class="ao-typed">${esc(this.promptTyped)}</span><span aria-hidden="true">▍</span>」</div><p class="ao-note">You can also type it yourself.</p>`,
                    buttons: [['Copy', 'copy', false], ['Fill input', 'insert', true]] }
                : { title: 'Click Send', clear: ['replay-chat'], rings: ['replay-input'], place: 'left',
                    body: '<p>The prepared example plays next. No AI is used.</p>', buttons: [['Send', 'send', true]] };
            case 'work': return { title: 'AI is editing', noDim: true, narrow: true,
                body: `<p class="ao-live">${esc(this.live)}</p><p>Items appear in the timeline below and preview above as the AI adds them.</p><p class="ao-note">This example takes about 18 seconds. Actual editing may take several minutes (not measured).</p>`,
                buttons: this.workError ? [['Try again', 'retry-work', true]] : undefined };
            case 'play': return sub === 0 ? { title: 'Done. Try playing it', clear: ['output'], rings: ['play-button'], bounce: true, body: '<p>Press ▶.</p>' }
                : { title: 'Captions, diagrams, sound effects, and BGM are added', holes: ['output'], body: '<p>Elements appear in sync with speech. Press ▶ again to stop. Continue after watching.</p>', buttons: [['Next', 'next', true]] };
            case 'caption': return ([
                { ...CAPTION_GUIDE_COPY[0], clear: ['output'], rings: ['caption-text'], bounce: true },
                { ...CAPTION_GUIDE_COPY[1], clear: ['output', 'caption-style'], rings: ['caption-style'],
                    buttons: [['Next', 'next', true]] },
                { ...CAPTION_GUIDE_COPY[2], clear: ['output'], rings: ['caption-text'], buttons: [['Next', 'next', true]] }
            ] as CoachSpec[])[Math.min(sub, 2)];
            case 'daihon': return sub === 0
                ? { ...DAIHON_GUIDE_COPY[0], clear: ['daihon-button'], rings: ['daihon-button'], bounce: true, place: 'left' }
                : sub === 1 ? { ...DAIHON_GUIDE_COPY[1], clear: ['daihon', 'output'], rings: ['daihon-first-row'], place: 'top' }
                : { ...DAIHON_GUIDE_COPY[2], clear: ['daihon', 'output'], place: 'top', buttons: [['Next', 'next', true]] };
            case 'export': return ([
                { title: 'Export from the left menu', clear: ['menu-button'], rings: ['menu-button'], bounce: true, body: '<p>Press ≡.</p>' },
                { title: 'Click Export…', clear: ['menu-panel'], rings: ['export-button'], bounce: true, body: '<p>Available once edit data (edit.json) exists.</p>' },
                { title: 'Use Standard and click Export', clear: ['export-dialog'], rings: ['export-submit'], bounce: true, place: 'top', body: '<p>Change quality and destination here.</p>' },
                { title: 'Exporting', noDim: true, rings: ['export-progress'], place: 'bottom', body: '<p>Progress appears at the bottom right. You can keep working.</p>' },
                { title: 'Export complete', clear: ['assets'], rings: ['export-result'], body: '<p>The exported file appears in Finished files.</p><p>You can also ask your AI partner to export. It shows the contents and asks for confirmation first.</p>', buttons: [['Next', 'next', true]] }
            ] as CoachSpec[])[Math.min(sub, 4)];
            default: return undefined;
        }
    }

    protected finder(): string {
        if (this.state.step !== 'drag' || this.state.imported) return '';
        const mac = navigator.platform.includes('Mac');
        const paths: Record<string, string> = {
            back: 'M15 4l-8 8 8 8', next: 'M9 4l8 8-8 8', up: 'M12 19V5m-6 6 6-6 6 6', refresh: 'M20 12a8 8 0 1 1-3-6m3-2v5h-5',
            plus: 'M12 4v16M4 12h16', cut: 'M4 4l16 16M20 4L4 20M7 17a3 3 0 1 0 0 6 3 3 0 0 0 0-6m10 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
            copy: 'M8 8h12v13H8zM4 17V4h12', paste: 'M8 4h8l2 3v14H6V7l2-3zm2 0v3h4V4', rename: 'M4 19h16M8 15l9-9 3 3-9 9-4 1z',
            share: 'M12 16V3m-5 5 5-5 5 5M5 15v6h14v-6', delete: 'M4 7h16M8 7l1 14h6l1-14M9 4h6', sort: 'M7 4v16m-3-3 3 3 3-3m7 3V4m-3 3 3-3 3 3', view: 'M4 5h7v6H4zm9 0h7v6h-7zM4 13h7v6H4zm9 0h7v6h-7z',
            folder: 'M3 6h7l2 2h9v12H3z', search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16m6 14 5 5', film: 'M4 3h16v18H4zM4 8h16M4 16h16M8 3v18M16 3v18'
        };
        const icon = (name: string): string => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
        const nav = (mac ? ['Favorites', 'Recent items', 'Applications', 'Desktop', 'Download', 'Documents', 'Pictures', 'Music', 'Movies', 'iCloud Drive']
            : ['Home', 'Gallery', 'OneDrive', 'Desktop', 'Download', 'Documents', 'Pictures', 'Music', 'Videos', 'PC'])
            .map(label => `<div class="ao-f-nav">${icon('folder')}<span>${label}</span></div>`).join('');
        const commands = mac ? `${icon('view')} View <span class="ao-f-sep"></span> ${icon('share')} Share` : `${icon('plus')} New ▾ <span class="ao-f-sep"></span> ${['cut', 'copy', 'paste', 'rename', 'share', 'delete'].map(icon).join('')} <span class="ao-f-sep"></span> ${icon('sort')} Sort ▾ ${icon('view')} View ▾ …`;
        return `<div class="ao-finder ${mac ? 'mac' : 'windows'}" data-akari-onboarding-target="finder"><div class="ao-f-title"><span class="ao-f-tab">${icon('folder')} AKARI sample <span>×</span></span><span class="ao-f-title-end">${mac ? '● ● ●' : '− □ ×'}</span></div><div class="ao-f-toolbar">${commands}</div><div class="ao-f-address">${icon('back')}${icon('next')}${icon('up')}${icon('refresh')}<span class="ao-f-breadcrumb">${mac ? 'Finder' : 'PC'} › Videos › AKARI sample</span><span class="ao-f-search">${icon('search')} Search</span></div><div class="ao-f-body"><div class="ao-f-side">${nav}</div><div class="ao-f-files"><div class="ao-f-file" data-ao-file draggable="true">${icon('film')}<span>サンプル動画.mp4<small>Drag from here</small></span></div></div><div class="ao-f-preview"><div>Details</div><video ${this.videoUrl ? `src="${this.videoUrl}"` : ''} muted autoplay loop playsinline></video><b>サンプル動画.mp4</b><small>Type: MPEG-4 movie<br>Length: 00:37<br>Size: 1280×720</small></div></div><div class="ao-f-status">1 item <span>1 selected</span></div></div>`;
    }

    protected chat(): string {
        const tour = this.state.step.startsWith('tour');
        if (!guideShowsChat(this.state.step)) return '';
        const lines = tour ? [`This is a finished example. This video was made with the following request to AI.`, `> ${PROMPT}`, ...LOG.flatMap(entry => entry.lines)] : this.logLines;
        const grouped = groupChatLines(lines);
        const messages = grouped.messages.map(message => {
            const content = message.lines.map(line => line.kind === 'code' ? `<code>${esc(line.text)}</code>` : `<p>${esc(line.text)}</p>`).join('');
            return `<div class="ao-message ${message.role}"><span class="ao-message-name">${message.role === 'user' ? 'You' : 'AI partner'}</span><div class="ao-bubble">${content}</div></div>`;
        }).join('');
        return `<div class="ao-chat" data-akari-onboarding-target="replay-chat"><h3>${tour ? 'AI partner (finished example)' : 'Example (without AI)'}</h3><div class="ao-chat-log">${grouped.note ? `<p class="ao-chat-note">${esc(grouped.note)}</p>` : ''}${messages}</div><textarea class="ao-chat-input" data-akari-onboarding-target="replay-input" ${this.state.step === 'prompt' && !this.state.workCompleted ? '' : 'readonly'}>${this.state.step === 'prompt' && this.state.sub && !this.state.workCompleted ? esc(PROMPT) : ''}</textarea><button data-ao="send" ${this.state.step === 'prompt' && this.state.sub && !this.state.workCompleted ? '' : 'disabled'}>Send</button></div>`;
    }

    protected render(): void {
        if (!this.root) return;
        const takeover = ['welcome', 'first', 'invite', 'done'].includes(this.state.step);
        const spec = this.coach();
        this.root.setAttribute('data-akari-onboarding-step', this.state.step);
        this.syncExportModalAccess();
        document.body.classList.toggle('akari-onboarding-export-active', this.state.step === 'export');
        document.body.classList.toggle('akari-onboarding-chat-active', guideShowsChat(this.state.step));
        document.body.classList.toggle('akari-onboarding-daihon-active', this.state.step === 'daihon');
        const takeHost = this.root.querySelector<HTMLElement>('.ao-takeover-host')!;
        if (takeover) {
            const intro = this.state.step !== 'done';
            if (takeHost.dataset.kind !== (intro ? 'intro' : 'done')) {
                takeHost.dataset.kind = intro ? 'intro' : 'done';
                takeHost.innerHTML = intro
                    ? `<div class="ao-takeover"><div class="ao-takeover-inner"><div class="ao-hero"></div><div class="ao-text in"></div></div></div>`
                    : `<div class="ao-takeover ao-done"><div class="ao-celebrate"></div><div class="ao-text in"></div></div>`;
            }
            if (takeHost.dataset.step !== this.state.step || this.state.step === 'invite') {
                takeHost.dataset.step = this.state.step;
                const textNode = takeHost.querySelector<HTMLElement>('.ao-text')!;
                textNode.innerHTML = this.takeover();
                textNode.classList.remove('out', 'in');
                void textNode.offsetWidth;
                textNode.classList.add('in');
            }
            const hero = takeHost.querySelector<HTMLElement>('.ao-hero');
            if (hero) {
                const visual = introVisual(this.state.step, this.busy);
                hero.hidden = visual.hero === 'none';
                hero.classList.toggle('before-after', visual.hero === 'before-after');
                hero.innerHTML = visual.hero === 'welcome'
                    ? (this.hero ? `<img src="${this.hero}" alt="">` : '')
                    : visual.hero === 'before-after'
                        ? `<img src="${BEFORE_AFTER_DATA_URL}" alt="Original footage on the left; the finished video with title, captions, diagrams, and BGM on the right"><div class="ao-before-after-labels"><span>Before</span><span>After</span></div><div class="ao-before-after-note">Title, captions, diagrams, and BGM</div>`
                        : '';
            }
        } else { takeHost.replaceChildren(); takeHost.dataset.kind = ''; takeHost.dataset.step = ''; }
        this.root.querySelector<HTMLElement>('.ao-finder-host')!.innerHTML = this.finder();
        const chatHost = this.root.querySelector<HTMLElement>('.ao-chat-host')!;
        chatHost.innerHTML = this.chat();
        chatHost.classList.toggle('ao-chat-target', guideTargetsChat(this.state.step, this.state.sub));
        const exampleHost = this.root.querySelector<HTMLElement>('.ao-example-host')!;
        if (this.state.step.startsWith('tour')) {
            if (!exampleHost.firstElementChild) exampleHost.innerHTML = `<div class="ao-example-preview"><video muted autoplay loop playsinline></video><div class="ao-example-title">Edit video by talking to AI</div><div class="ao-example-caption"></div><span class="ao-example-tag">Finished example</span></div>`;
            if (!this.videoUrl) void this.loadVideo();
            else {
                const video = exampleHost.querySelector<HTMLVideoElement>('video');
                if (video && video.src !== this.videoUrl) { video.src = this.videoUrl; void video.play().catch(() => undefined); }
            }
        } else exampleHost.replaceChildren();
        const coachHost = this.root.querySelector<HTMLElement>('.ao-coach-host')!;
        const key = spec ? `${this.state.step}:${this.state.sub}:${onboardingRevisit(this.state) ?? ''}` : '';
        if (key !== this.coachKey) {
            if (this.bounceTimer) window.clearTimeout(this.bounceTimer);
            this.bounceTimer = undefined;
            this.captionRingReady = false;
            this.coachKey = key;
            const token = ++this.coachToken;
            const mount = (): void => {
                if (token !== this.coachToken || !this.root) return;
                coachHost.innerHTML = spec ? this.coachMarkup(spec) : '';
                this.lastRects = '';
                this.placeCoach();
                this.timers.push(window.setTimeout(() => this.placeCoach(), 450));
                if (spec?.bounce) this.bounceTimer = window.setTimeout(() => {
                    if (this.state.step === 'caption' && this.state.sub === 0) {
                        this.captionRingReady = true;
                        this.lastRects = '';
                        this.placeCoach();
                    }
                    this.root?.querySelector('.ao-ring')?.classList.add('bounce');
                }, this.state.step === 'caption' && this.state.sub === 0 ? 2500 : 3000);
            };
            if (coachHost.firstElementChild && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                coachHost.firstElementChild.classList.add('out');
                this.timers.push(window.setTimeout(mount, 170));
            } else mount();
        } else if (spec) {
            const live = coachHost.querySelector<HTMLElement>('.ao-live');
            if (live) live.textContent = this.live;
        }
        this.placeCoach();
        if (this.state.step === 'drag' && !this.videoUrl) void this.loadVideo();
    }

    protected coachMarkup(spec: CoachSpec): string {
        const actions = (spec.buttons ?? []).map(([label, action, primary]) => `<button data-ao="${action}" class="${primary ? 'primary' : ''}">${label}</button>`).join('');
        const icon: Record<AiAnswer, string> = {
            claude: '<span class="akari-partner-claude-cli-icon"></span>',
            chatgpt: '<span class="akari-partner-codex-cli-icon"></span>',
            google: '<svg class="ao-google" viewBox="0 0 24 24" aria-label="Google"><path fill="#4285F4" d="M21.35 12.22c0-.69-.06-1.37-.18-2.03H12v3.84h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.16c1.85-1.7 2.9-4.21 2.9-7.2z"/><path fill="#34A853" d="M12 21.5c2.64 0 4.86-.88 6.48-2.38l-3.16-2.45c-.88.59-2 .94-3.32.94-2.55 0-4.71-1.72-5.48-4.03H3.26v2.53A9.8 9.8 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.52 13.58a5.9 5.9 0 0 1 0-3.76V7.29H3.26a9.8 9.8 0 0 0 0 8.82l3.26-2.53z"/><path fill="#EA4335" d="M12 5.79c1.43 0 2.72.49 3.74 1.47l2.8-2.8A9.41 9.41 0 0 0 12 2.1a9.8 9.8 0 0 0-8.74 5.19l3.26 2.53C7.29 7.51 9.45 5.79 12 5.79z"/></svg>', none: '<span class="ao-choice-symbol">⊘</span>', other: '<span class="ao-choice-symbol">⌑</span>'
        };
        const choices = spec.choices?.map(([answer, label, note]) => `<button data-ao="answer" data-answer="${answer}"><span class="ao-choice-icon">${icon[answer]}</span><span>${label}${note ? `<small>${note}</small>` : ''}</span></button>`).join('') ?? '';
        const count = onboardingCount(this.state.step);
        const eyebrow = this.state.step.startsWith('tour') ? 'Explore the layout' : count ? `STEP ${count.current} / ${count.total}` : '';
        const back = previousGuidePosition(this.state) && !spec.minimal ? '<button class="ao-back" data-ao="back">← Back</button>' : '';
        return `<div class="ao-coach ${spec.wide ? 'wide' : ''} ${spec.narrow ? 'narrow' : ''} ${spec.minimal ? 'minimal' : ''}" role="dialog" aria-live="polite">${eyebrow && !spec.minimal ? `<div class="ao-count">${eyebrow}</div>` : ''}<h3>${spec.title}</h3><div class="ao-body">${spec.body}</div>${choices ? `<div class="ao-choices">${choices}</div>` : ''}${spec.link ? `<button class="ao-link" data-ao="${spec.link[0]}">${spec.link[1]}</button>` : ''}${back || actions ? `<div class="ao-actions">${back}${actions}</div>` : ''}</div>`;
    }

    protected async loadVideo(): Promise<void> {
        if (!this.sample || this.videoUrl) return;
        try {
            const content = await this.files.readFile(URI.fromFilePath(this.sample.sourcePath));
            this.videoUrl = URL.createObjectURL(new Blob([new Uint8Array(content.value.buffer)], { type: 'video/mp4' }));
            const video = this.root?.querySelector<HTMLVideoElement>('.ao-f-preview video');
            if (video) { video.src = this.videoUrl; void video.play().catch(() => undefined); }
            const example = this.root?.querySelector<HTMLVideoElement>('.ao-example-preview video');
            if (example) { example.src = this.videoUrl; void example.play().catch(() => undefined); }
            const thumbnailVideo = document.createElement('video');
            thumbnailVideo.muted = true;
            thumbnailVideo.src = this.videoUrl;
            thumbnailVideo.addEventListener('loadeddata', () => {
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                canvas.getContext('2d')?.drawImage(thumbnailVideo, 0, 0, 160, 90);
                this.thumbnailUrl = canvas.toDataURL('image/jpeg', .8);
                if (this.root?.querySelector('.ao-hint svg')) this.showDragHint();
            }, { once: true });
        } catch { /* The import action remains available when preview decoding is unavailable. */ }
    }

    protected followTargets(): void {
        if (!this.root) return;
        this.placeCoach();
        this.placeFrame = requestAnimationFrame(() => this.followTargets());
    }

    protected placeCoach(): void {
        if (!this.root) return;
        const spec = this.coach();
        const dim = this.root.querySelector<HTMLElement>('.ao-dim');
        const coach = this.root.querySelector<HTMLElement>('.ao-coach');
        const blocker = this.root.querySelector<HTMLElement>('.ao-input-blocker');
        if (!spec || !dim) { dim?.classList.add('clear'); if (blocker) blocker.hidden = true; this.inputCutouts = []; return; }
        const rectOf = (name: string): DOMRect | undefined => {
            if (name === 'caption-text') {
                if (this.state.step === 'caption' && this.state.sub === 0 && !this.captionRingReady) return undefined;
                const frame = document.querySelector<HTMLIFrameElement>('[data-akari-onboarding-target="output"] iframe');
                const outer = frame?.getBoundingClientRect();
                if (outer && outer.width > 0 && outer.height > 0) {
                    const band = outputCaptionBandRect(outer);
                    return new DOMRect(band.x, band.y, band.width, band.height);
                }
            }
            if (name === 'caption-style') {
                const color = document.querySelector<HTMLElement>('[data-akari-bar-item="captionTextColor"]');
                const target = color && getComputedStyle(color).display !== 'none' && color.getClientRects().length
                    ? color : document.querySelector<HTMLElement>('[data-akari-bar-item="overflow"]');
                const rect = target?.getBoundingClientRect();
                return rect && rect.width > 0 && rect.height > 0 ? rect : undefined;
            }
            if (name === 'material-play-toggle') {
                const frame = document.querySelector<HTMLIFrameElement>('[data-akari-onboarding-target="material-preview"] iframe');
                try {
                    const play = frame?.contentDocument?.querySelector<HTMLElement>('#play-toggle');
                    const outer = frame?.getBoundingClientRect(), inner = play?.getBoundingClientRect();
                    if (outer && inner && inner.width > 0 && inner.height > 0)
                        return new DOMRect(outer.left + inner.left, outer.top + inner.top, inner.width, inner.height);
                } catch { /* The preview may use a separate origin while loading. */ }
                // A Theia webview can have a separate origin. The play button shifts in a narrow grid.
                // Frame the whole transport row instead of guessing its horizontal position.
                const outer = frame?.getBoundingClientRect();
                if (outer && outer.width > 0 && outer.height > 0) {
                    const row = materialPreviewTransportRect(outer);
                    return new DOMRect(row.x, row.y, row.width, row.height);
                }
            }
            let element = document.querySelector<HTMLElement>(`[data-akari-onboarding-target="${name}"]`);
            if (name === 'export-dialog') element = document.querySelector<HTMLElement>('[data-akari-onboarding-target="export-submit"]')?.closest<HTMLElement>('[role="dialog"]') ?? undefined;
            const rect = element?.getBoundingClientRect();
            return rect && rect.width > 0 && rect.height > 0 && element && getComputedStyle(element).display !== 'none'
                && getComputedStyle(element).visibility === 'visible' ? rect : undefined;
        };
        const chat = this.root.querySelector<HTMLElement>('.ao-chat');
        const partner = rectOf('partner');
        if (guideNeedsPartner(this.state.step) && !partner && this.partnerRevealAttempts > 0 && this.partnerRevealAttempts < 4
            && performance.now() - this.lastPartnerRevealAt >= 700) this.revealPartner();
        const fallbackReady = partnerFallbackReady(this.partnerRevealAttempts, this.lastPartnerRevealAt, performance.now());
        const panel = document.querySelector<HTMLElement>('#theia-right-content-panel')?.getBoundingClientRect();
        const fallbackWidth = Math.min(390, innerWidth * .32);
        const fallback = panel && panel.width > 48 && panel.height > 0
            ? new DOMRect(panel.left, panel.top, panel.width - 48, panel.height)
            : new DOMRect(Math.max(0, innerWidth - 48 - fallbackWidth), 40, fallbackWidth, innerHeight - 65);
        if (chat) {
            chat.hidden = !partner && !fallbackReady;
            const bounds = partner ?? fallback;
            Object.assign(chat.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
            chat.classList.toggle('ao-chat-fallback', !partner);
        }
        const framed = (spec.holes ?? []).map(rectOf).filter((rect): rect is DOMRect => !!rect);
        const clear = (spec.clear ?? []).map(rectOf).filter((rect): rect is DOMRect => !!rect);
        const ringRects = (spec.rings ?? []).map(rectOf).filter((rect): rect is DOMRect => !!rect);
        const ring = ringRects[0];
        const captionObstacles = this.state.step === 'caption' && this.state.sub > 0
            ? Array.from(document.querySelectorAll<HTMLElement>('[data-akari-bar-item], [data-akari-window]'))
                .filter(element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility === 'visible')
                .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
            : [];
        if (this.state.step === 'caption' && this.state.sub > 0) {
            const band = rectOf('caption-text');
            if (band) captionObstacles.push(band);
        }
        this.inputCutouts = guideInputCutouts(framed, clear, ringRects);
        if (blocker) {
            blocker.hidden = false;
            blocker.style.clipPath = guideBlockerClipPath(innerWidth, innerHeight, this.inputCutouts);
        }
        const all = [...framed, ...clear];
        const chatRect = chat?.getBoundingClientRect();
        const serial = JSON.stringify([this.state.step, this.state.sub, ...all.map(rect => [rect.x, rect.y, rect.width, rect.height]),
            ring && [ring.x, ring.y, ring.width, ring.height], chatRect && [chatRect.x, chatRect.y, chatRect.width, chatRect.height],
            ...captionObstacles.map(rect => [rect.x, rect.y, rect.width, rect.height])]);
        if (serial === this.lastRects) return;
        this.lastRects = serial;
        dim.classList.toggle('clear', !!spec.noDim);
        if (spec.noDim || spec.fullFog || !all.length) this.paintFog([]);
        else this.animateFog(all, framed.length, spec.labels);
        if (!spec.noDim && !spec.fullFog && !all.length) dim.classList.remove('clear');
        const rings = this.root.querySelector<HTMLElement>('.ao-rings')!;
        if (ring) {
            if (!rings.firstElementChild) rings.innerHTML = '<div class="ao-ring"></div>';
            const element = rings.firstElementChild as HTMLElement;
            Object.assign(element.style, { left: `${ring.x - 5}px`, top: `${ring.y - 5}px`, width: `${ring.width + 10}px`, height: `${ring.height + 10}px` });
        } else rings.replaceChildren();
        const example = this.root.querySelector<HTMLElement>('.ao-example-preview');
        const output = rectOf('output');
        if (example && output) {
            Object.assign(example.style, { left: `${output.x + 8}px`, top: `${output.y + 38}px`, width: `${Math.max(0, output.width - 16)}px`, height: `${Math.max(0, output.height - 54)}px` });
            const video = example.querySelector('video');
            const caption = example.querySelector<HTMLElement>('.ao-example-caption');
            if (video && caption && this.sample) {
                const item = this.sample.segments.find(segment => video.currentTime >= segment.start && video.currentTime < segment.end);
                caption.textContent = item?.text ?? '';
            }
        }
        if (this.root.querySelector('.ao-hint svg')) this.showDragHint();
        if (!coach) return;
        const anchor = ring ?? framed[0] ?? clear[0];
        if (this.state.step === 'daihon' && this.state.sub > 0) {
            coach.style.width = `${Math.max(190, (rectOf('output')?.left ?? 250) - 26)}px`;
        }
        const width = coach.offsetWidth, height = coach.offsetHeight;
        let x = anchor ? anchor.right + 14 : (innerWidth - width) / 2;
        let y = anchor ? anchor.top + (anchor.height - height) / 2 : (innerHeight - height) / 2;
        if (spec.minimal) { x = (innerWidth - width) / 2; y = innerHeight * (spec.noDim ? .66 : .42) - height / 2; }
        else if (spec.place === 'left') x = (anchor?.left ?? innerWidth / 2) - width - 14;
        else if (spec.place === 'top') { x = (anchor?.left ?? innerWidth / 2) + ((anchor?.width ?? 0) - width) / 2; y = (anchor?.top ?? innerHeight / 2) - height - 14; }
        else if (spec.place === 'bottom') { x = (anchor?.left ?? innerWidth / 2) + ((anchor?.width ?? 0) - width) / 2; y = (anchor?.bottom ?? innerHeight / 2) + 14; }
        if (x + width > innerWidth - 12 && anchor) x = anchor.left - width - 14;
        if (x < 8 && anchor && !spec.minimal) x = anchor.right + 14;
        if (this.state.step === 'work') { x = 20; y = innerHeight * .53; }
        if (this.state.step === 'drag') { x = (anchor?.right ?? 240) + 14; y = innerHeight - height - 24; }
        if (this.state.step === 'daihon' && this.state.sub > 0) { x = 12; y = 66; }
        if (this.state.step === 'caption' && this.state.sub > 0) {
            const outputRect = rectOf('output');
            if (outputRect) ({ x, y } = captionCoachPosition({ width: innerWidth, height: innerHeight },
                { width, height }, outputRect, captionObstacles));
        }
        coach.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
        coach.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 32))}px`;
    }

    protected paintFog(rects: DOMRect[], framed = 0, labels?: string[]): void {
        if (!this.root) return;
        const dim = this.root.querySelector<HTMLElement>('.ao-dim')!;
        const holes = this.root.querySelector<HTMLElement>('.ao-holes')!;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><defs><mask id="m"><rect width="100%" height="100%" fill="white"/>${rects.map(rect => `<rect x="${rect.x - 4}" y="${rect.y - 4}" width="${rect.width + 8}" height="${rect.height + 8}" rx="12" fill="black"/>`).join('')}</mask></defs><rect width="100%" height="100%" fill="black" mask="url(#m)"/></svg>`;
        const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        dim.style.maskImage = mask;
        dim.style.webkitMaskImage = mask;
        const chat = this.root.querySelector<HTMLElement>('.ao-chat');
        const chatRect = chat?.getBoundingClientRect();
        const frames = rects.slice(0, framed).map((rect, index) => `<div class="ao-hole" style="left:${rect.x - 4}px;top:${rect.y - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px">${labels?.[index] ? `<span class="ao-hole-label">${labels[index]}</span>` : ''}</div>`).join('');
        holes.innerHTML = frames + (guideTargetsChat(this.state.step, this.state.sub)
            && chatRect && chatRect.width > 0 && chatRect.height > 0
            ? `<div class="ao-hole ao-chat-frame" style="left:${chatRect.x - 4}px;top:${chatRect.y - 4}px;width:${chatRect.width + 8}px;height:${chatRect.height + 8}px"></div>` : '');
    }

    protected animateFog(target: DOMRect[], framed: number, labels?: string[]): void {
        if (this.fogFrame) cancelAnimationFrame(this.fogFrame);
        const current = this.fogFrom.length === target.length ? this.fogFrom : target.map(() => this.fogFrom.length === 1 ? this.fogFrom[0] : new DOMRect(0, 0, innerWidth, innerHeight));
        const from = current.map(rect => new DOMRect(rect.x, rect.y, rect.width, rect.height));
        const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
        const started = performance.now();
        const draw = (now: number): void => {
            const t = duration ? Math.min(1, (now - started) / duration) : 1;
            const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            this.fogFrom = target.map((rect, index) => new DOMRect(
                from[index].x + (rect.x - from[index].x) * eased,
                from[index].y + (rect.y - from[index].y) * eased,
                from[index].width + (rect.width - from[index].width) * eased,
                from[index].height + (rect.height - from[index].height) * eased));
            this.paintFog(this.fogFrom, framed, t === 1 ? labels : undefined);
            if (t < 1) this.fogFrame = requestAnimationFrame(draw);
        };
        this.fogFrame = requestAnimationFrame(draw);
    }

    protected scheduleDragHint(): void {
        if (this.dragHintTimer) window.clearTimeout(this.dragHintTimer);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        this.dragHintTimer = window.setTimeout(() => {
            if (this.state.step === 'drag' && !this.state.imported && !this.dragStarted) this.showDragHint();
        }, 2500);
    }

    protected hideDragHint(): void {
        const host = this.root?.querySelector<HTMLElement>('.ao-hint');
        if (host) { host.replaceChildren(); host.dataset.geometry = ''; }
    }

    protected showDragHint(): void {
        const host = this.root?.querySelector<HTMLElement>('.ao-hint');
        const file = this.root?.querySelector<HTMLElement>('.ao-f-file');
        const assets = document.querySelector<HTMLElement>('[data-akari-onboarding-target="assets"]');
        if (!host || !file || !assets || this.dragStarted || this.state.step !== 'drag') return;
        const a = file.getBoundingClientRect(), b = assets.getBoundingClientRect();
        const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2;
        const x2 = b.left + b.width / 2, y2 = b.top + b.height * .3;
        const geometry = [x1, y1, x2, y2, innerWidth, innerHeight, this.thumbnailUrl].join(':');
        if (host.dataset.geometry === geometry) return;
        host.dataset.geometry = geometry;
        const path = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${((x1 + x2) / 2).toFixed(1)} ${(Math.min(y1, y2) - 110).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        host.innerHTML = `<svg width="${innerWidth}" height="${innerHeight}" viewBox="0 0 ${innerWidth} ${innerHeight}"><defs><marker id="ao-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fb923c"/></marker></defs><path class="ao-hint-path" d="${path}" fill="none" stroke="#fb923c" stroke-width="3.5" stroke-dasharray="10 8" stroke-linecap="round" marker-end="url(#ao-arrow)"/><g>${this.thumbnailUrl ? `<image href="${this.thumbnailUrl}" x="-36" y="-20" width="72" height="40"/>` : '<rect x="-36" y="-20" width="72" height="40" fill="#714327"/>'}<rect x="-36" y="-20" width="72" height="40" fill="none" stroke="white"/><animateMotion dur="2.2s" repeatCount="indefinite" path="${path}" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear"/></g><text x="${x2.toFixed(1)}" y="${(y2 + 52).toFixed(1)}" text-anchor="middle" class="ao-hint-label">Drag here</text></svg>`;
    }

    protected celebrate(): void {
        const host = this.root?.querySelector<HTMLElement>('.ao-celebrate');
        if (!host || host.childElementCount || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const colors = ['#f97316', '#fdba74', '#facc15', '#f472b6', '#34d399', '#60a5fa', '#fff', '#a78bfa'];
        const random = (min: number, max: number): number => min + Math.random() * (max - min);
        const width = innerWidth, height = innerHeight;
        const piece = (): HTMLElement => {
            const item = document.createElement('i');
            item.className = 'ao-confetti';
            item.style.background = colors[Math.floor(Math.random() * colors.length)];
            item.style.width = `${random(6, 11)}px`;
            item.style.height = `${random(8, 18)}px`;
            host.appendChild(item);
            return item;
        };
        for (const flip of [false, true]) {
            const cone = document.createElement('div');
            cone.className = 'ao-popper';
            cone.style.left = `${flip ? width - 160 : 50}px`;
            cone.style.top = `${height - 170}px`;
            cone.innerHTML = `<svg viewBox="0 0 120 120" width="120" height="120" style="transform:scaleX(${flip ? -1 : 1})"><path d="M12 110 L42 30 L92 80 Z" fill="#f97316"/><path d="M24 86 L62 62 M31 66 L72 45" stroke="#fff9" stroke-width="6" stroke-linecap="round"/><g stroke="#facc15" stroke-width="4"><path d="M78 40 L98 14"/><path d="M86 54 L114 42"/><path d="M64 28 L70 2"/></g></svg>`;
            host.appendChild(cone);
            cone.animate([{ transform: 'scale(.2) rotate(-24deg)', opacity: 0 }, { transform: 'scale(1.18) rotate(8deg)', opacity: 1, offset: .2 }, { transform: 'scale(1)', opacity: 1, offset: .62 }, { transform: `translate(${flip ? 110 : -110}px,160px) rotate(25deg)`, opacity: 0 }], { duration: 1500, fill: 'forwards' });
            for (let index = 0; index < 65; index++) {
                const item = piece(), ox = flip ? width - 105 : 105, oy = height - 130;
                const vx = (flip ? -1 : 1) * random(120, 650), rise = random(300, 670);
                item.animate([{ transform: `translate(${ox}px,${oy}px)` }, { transform: `translate(${ox + vx * .5}px,${oy - rise}px) rotate(340deg)`, offset: .3 }, { transform: `translate(${ox + vx}px,${height + 40}px) rotate(900deg)` }], { duration: random(2600, 4200), delay: random(140, 320), fill: 'forwards' });
            }
        }
        for (let index = 0; index < 70; index++) {
            const item = piece(), x = random(0, width), sway = random(-90, 90);
            item.animate([{ transform: `translate(${x}px,-30px)` }, { transform: `translate(${x + sway}px,${height * .4}px) rotate(340deg)`, offset: .45 }, { transform: `translate(${x - sway}px,${height + 30}px) rotate(800deg)` }], { duration: random(3200, 5200), delay: random(450, 1700), fill: 'forwards' });
        }
        for (let index = 0; index < 9; index++) {
            const streamer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            streamer.setAttribute('viewBox', '-40 0 80 320');
            streamer.setAttribute('class', 'ao-streamer');
            streamer.style.left = `${random(40, width - 120)}px`;
            streamer.innerHTML = `<path d="M0 0 C30 30,-30 60,0 90 c22 0 22 -28 0 -28 c-22 0 -22 28 0 28 S34 150,0 180 S-30 230,0 260 c18 0 18 -24 0 -24 c-18 0 -18 24 0 24" fill="none" stroke="${colors[index]}" stroke-width="6" stroke-linecap="round" pathLength="1"/>`;
            host.appendChild(streamer);
            const path = streamer.querySelector('path')!;
            path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1300, delay: index * 75 + 250, fill: 'forwards' });
            streamer.animate([{ transform: 'translateY(-330px)' }, { transform: `translateY(${height + 20}px) rotate(25deg)` }], { duration: random(3600, 5200), delay: index * 75 + 250, fill: 'forwards' });
        }
        this.timers.push(window.setTimeout(() => host.replaceChildren(), 7600));
    }

    protected nudge(): void {
        const coach = this.root?.querySelector('.ao-coach');
        coach?.classList.remove('nudge');
        void (coach as HTMLElement | null)?.offsetWidth;
        coach?.classList.add('nudge');
    }

    protected handleClick = async (event: MouseEvent): Promise<void> => {
        const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ao]') : null;
        if (!element) return;
        const action = element.dataset.ao;
        if (action !== 'idle-close' && action !== 'close-guide') this.noteInteraction();
        if (action === 'idle-close' || action === 'close-guide') return this.close();
        if (action === 'retry-transition') {
            const retry = this.transitionFailure?.retry;
            if (retry) await retry();
            return;
        }
        if (action === 'skip-cleanup') {
            const skipCleanup = this.transitionFailure?.skipCleanup;
            if (skipCleanup) await skipCleanup();
            return;
        }
        if (action === 'fallback-next') return this.advanceAutomatically();
        if (action === 'next') {
            const step = this.state.step;
            if (step === 'welcome') return this.go('first');
            if (step === 'tour0' && this.state.sub === 0) return this.setSub(1);
            if (step === 'tour0' && this.state.sub === 1) return this.go('tour1');
            if (step === 'tour2' && this.state.sub === 0) return this.setSub(1);
            if (step === 'tour3' && this.state.sub === 0) return this.setSub(1);
            if (step === 'tour3' && this.state.sub === 1) return this.go('drag');
            if (step === 'prompt' && this.state.workCompleted) return this.go('play');
            if (step === 'drag' && this.state.imported) return this.go('matpreview');
            if (step === 'caption' && this.state.sub === 1) return this.setSub(2);
            if (['tour0', 'matpreview', 'play', 'caption', 'daihon', 'export'].includes(step)
                && (step === 'tour0' ? this.state.sub < 1 : step === 'caption' ? this.state.sub < 2
                    : step === 'export' ? this.state.sub < 4 : step === 'daihon' ? this.state.sub < 2 : this.state.sub < 1)) return this.nudge();
            const next: Partial<Record<OnboardingStep, OnboardingStep>> = {
                tour1: 'tour2', tour2: 'tour3', matpreview: 'ask', play: 'caption', caption: 'daihon',
                daihon: 'export', export: 'done'
            };
            if (next[step]) await this.go(next[step]!);
        } else if (action === 'yes') await this.go('invite');
        else if (action === 'back') {
            const previous = previousGuidePosition(this.state);
            if (previous) {
                if (this.state.step === 'export') this.restoreExportBackSurface();
                if (previous.step === 'caption' && previous.sub === 0)
                    window.dispatchEvent(new Event('akari.onboarding.clearPreviewSelection'));
                if (previous.step === this.state.step) await this.setSub(previous.sub);
                else await this.go(previous.step, previous.sub);
                if (this.state.step === 'daihon' && this.state.sub === 0)
                    window.dispatchEvent(new Event('akari.onboarding.revealPartner'));
            }
        }
        else if (action === 'no' || action === 'later') { await this.service.returnToHome(); this.closeVisual(); }
        else if (action === 'start') await this.prepare();
        else if (action === 'import') await this.importSample();
        else if (action === 'answer') {
            const answer = element.dataset.answer as AiAnswer;
            this.state = { ...this.state, answer };
            (window as Window & { akariOnboardingAnswer?: AiAnswer }).akariOnboardingAnswer = answer;
            window.dispatchEvent(new CustomEvent('akari.onboarding.answer', { detail: { answer } }));
            await this.setSub(1);
        } else if (action === 'reanswer') await this.setSub(0);
        else if (action === 'replay') await this.go('prompt');
        else if (action === 'again-work') {
            this.state = { ...this.state, workCompleted: false };
            await this.service.save(this.state);
            await this.go('work');
        }
        else if (action === 'copy') void navigator.clipboard.writeText(PROMPT);
        else if (action === 'insert') await this.setSub(1);
        else if (action === 'send' && this.state.step === 'prompt' && this.state.sub > 0) await this.go('work');
        else if (action === 'retry-work' && this.state.step === 'work') void this.startWork();
        else if (action === 'help-next') await this.assistStep();
        else if (action === 'learn') { this.closeVisual(); await this.openGuideSettings(); }
        else if (action === 'explore') this.closeVisual();
        else if (action === 'own') { this.closeVisual(); await this.startOwnVideo(); }
        else if (action === 'again') { await this.service.save(INITIAL_ONBOARDING_STATE); await this.open(); }
    };

    protected async prepare(): Promise<void> {
        this.busy = true;
        this.prepareError = '';
        this.render();
        try {
            const prepared = await this.service.prepare();
            this.sample = prepared.sample;
            this.state = { ...this.state, projectUri: prepared.projectUri, samplePath: prepared.sample.sourcePath, exampleActive: true };
            await this.service.save(this.state);
            await this.service.importSample(prepared.projectUri, prepared.sample.sourcePath);
            await this.service.writeExample(prepared.projectUri, prepared.sample.sourcePath, prepared.sample.segments, prepared.sample.segments.length, true);
            await this.go('tour0');
            if (this.transitionFailure) { this.busy = false; return; }
            await this.openProject(prepared.projectUri);
            await this.showOutput(prepared.projectUri);
        } catch (error) {
            this.prepareError = error instanceof Error && /network|fetch|ECONN|ENOTFOUND|timeout|ETIMEDOUT/i.test(error.message)
                ? 'Could not download sample footage. Check your internet connection.'
                : 'Could not prepare sample footage. Check the destination and free space.';
            this.busy = false;
            this.render();
        }
    }

    protected startPromptTypewriter(): void {
        this.promptTyped = '';
        const characters = [...PROMPT];
        let index = 0;
        const tick = (): void => {
            if (!this.root || this.state.step !== 'prompt' || this.state.sub !== 0) return;
            this.promptTyped += characters[index++];
            const typed = this.root.querySelector<HTMLElement>('.ao-typed');
            if (typed) typed.textContent = this.promptTyped;
            if (index < characters.length) this.timers.push(window.setTimeout(tick, 35));
        };
        this.timers.push(window.setTimeout(tick, 320));
    }

    protected async importSample(): Promise<void> {
        if (!this.state.projectUri || !this.sample || this.busy) return;
        this.busy = true;
        try {
            await this.service.importSample(this.state.projectUri, this.sample.sourcePath);
            this.state = { ...this.state, imported: true };
            window.dispatchEvent(new Event('akari.onboarding.refreshProject'));
            await new Promise<void>(resolve => window.setTimeout(resolve, 450));
            await this.go('matpreview');
        } catch (error) { this.live = error instanceof Error ? error.message : String(error); this.nudge(); }
        finally { this.busy = false; }
    }

    protected restoreExportBackSurface(): void {
        if (this.state.sub === 2) {
            // Setup has not submitted an export yet. Closing it restores access to the menu action.
            document.querySelector<HTMLElement>('.akari-export-dialog-host button[aria-label="Close"]')?.click();
            if (!this.exportMenuIsOpen()) this.pressExportMenuTab();
        } else if (this.state.sub === 1 && this.exportMenuIsOpen()) {
            this.pressExportMenuTab();
        }
    }

    protected exportMenuIsOpen(): boolean {
        const menu = document.querySelector<HTMLElement>('[data-akari-onboarding-target="menu-panel"]');
        return !!menu && menu.getClientRects().length > 0 && getComputedStyle(menu).visibility === 'visible';
    }

    protected pressExportMenuTab(): void {
        const tab = document.querySelector<HTMLElement>('[data-akari-onboarding-target="menu-button"]');
        if (!tab) return;
        const rect = tab.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        for (const [type, buttons] of [['pointerdown', 1], ['pointerup', 0]] as const) {
            tab.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
                button: 0, buttons, clientX, clientY
            }));
        }
    }

    protected syncExportModalAccess(): void {
        if (!this.root || this.state.step !== 'export') {
            this.exportInertObserver?.disconnect();
            this.exportInertObserver = undefined;
            return;
        }
        if (this.exportInertObserver) return;
        const root = this.root;
        // Theia makes every other body child inert while its modal is open. Keep the guide's controls clickable.
        this.exportInertObserver = new MutationObserver(() => {
            if (this.root === root && this.state.step === 'export' && root.hasAttribute('inert')) root.removeAttribute('inert');
        });
        this.exportInertObserver.observe(root, { attributes: true, attributeFilter: ['inert'] });
        if (root.hasAttribute('inert')) root.removeAttribute('inert');
    }

    protected handleExternalClick = (event: MouseEvent): void => {
        if (!this.root || this.root.contains(event.target as Node)) return;
        this.noteInteraction();
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-akari-onboarding-target]') : null;
        const name = target?.dataset.akariOnboardingTarget;
        if (this.state.step === 'matpreview' && name === 'sample-card' && this.state.sub === 0) {
            this.state = { ...this.state, materialOpened: true };
            void this.setSub(1);
        }
        else if (this.state.step === 'daihon' && name === 'daihon-button' && this.state.sub === 0) void this.setSub(1);
        else if (this.state.step === 'daihon' && name === 'daihon-first-row' && this.state.sub === 1) void this.setSub(2);
        else if (this.state.step === 'export') {
            const expected = ['menu-button', 'export-button', 'export-submit'][this.state.sub];
            if (name === expected) void this.setSub(this.state.sub + 1);
            else this.nudge();
        } else if (!['drag', 'play', 'caption', 'matpreview'].includes(this.state.step)) this.nudge();
    };

    protected handleDragOver = (event: DragEvent): void => {
        if (this.state.step === 'drag' && event.dataTransfer?.types.includes('application/x-akari-onboarding-sample')) event.preventDefault();
    };

    protected handleDrop = (event: DragEvent): void => {
        if (this.state.step !== 'drag' || !event.dataTransfer?.types.includes('application/x-akari-onboarding-sample')) return;
        const target = event.target instanceof Element ? event.target.closest('[data-akari-onboarding-target="assets"]') : null;
        if (!target) return this.nudge();
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.importSample();
    };

    protected handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.root) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); void this.close(); return; }
        if (event.key === 'F1' || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p')) {
            event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        if (event.key === 'Tab') {
            event.preventDefault(); event.stopImmediatePropagation();
            const focusable = Array.from(this.root.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not([readonly]),a[href]'))
                .filter(node => node.getClientRects().length > 0);
            const index = focusable.indexOf(document.activeElement as HTMLElement);
            focusable[(index + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length]?.focus();
            return;
        }
        const target = event.target instanceof Element ? event.target : undefined;
        const insideGuide = !!target && this.root.contains(target);
        const rect = target?.getBoundingClientRect();
        const allowed = rect && pointInGuideCutouts(rect.left + rect.width / 2, rect.top + rect.height / 2, this.inputCutouts);
        if (!insideGuide && !allowed) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        this.noteInteraction();
    };

    protected guardPointer = (event: Event): void => {
        if (!this.root || this.root.contains(event.target as Node)) return;
        const pointer = event as MouseEvent;
        if (shouldBlockGuidePointer(event.isTrusted, pointer.clientX, pointer.clientY, this.inputCutouts)) {
            event.preventDefault(); event.stopImmediatePropagation();
        }
    };

    protected handlePlayback = (event: CustomEvent<{ playing?: boolean }>): void => {
        if (this.state.step === 'play' && this.state.sub === 0 && event.detail?.playing) {
            this.state = { ...this.state, played: true };
            void this.setSub(1);
        }
    };

    protected handleCaptionSelection = (event: CustomEvent<{ captionId?: string }>): void => {
        if (this.state.step === 'caption' && this.state.sub === 0 && event.detail?.captionId) void this.setSub(1);
    };

    protected async startWork(): Promise<void> {
        if (!this.state.projectUri || !this.sample || this.busy) return;
        this.busy = true;
        this.workError = false;
        this.logLines = [`> ${PROMPT}`];
        this.render();
        const started = performance.now();
        const staged = this.service as AkariOnboardingService & { writeExample(
            projectUri: string, sourcePath: string, segments: SampleInformation['segments'],
            count: number, title: boolean, progress: { stage: number }): Promise<void> };
        try {
            for (const entry of LOG) {
                await new Promise<void>(resolve => {
                    this.timers.push(window.setTimeout(resolve, Math.max(0, entry.t - (performance.now() - started))));
                });
                if (!this.root || this.state.step !== 'work') return;
                this.live = entry.live ?? this.live;
                if (entry.count === 0) {
                    await this.service.writeExample(this.state.projectUri, this.sample.sourcePath, this.sample.segments, 0, false);
                    window.dispatchEvent(new Event('akari.onboarding.refreshTimeline'));
                    await this.seekOutput(this.state.projectUri, 1).catch(() => undefined);
                }
                if (entry.captions) {
                    for (let count = 1; count <= this.sample.segments.length; count++) {
                        await new Promise<void>(resolve => { this.timers.push(window.setTimeout(resolve, Math.max(75, Math.floor(3150 / this.sample!.segments.length)))); });
                        if (!this.root || this.state.step !== 'work') return;
                        await this.service.writeExample(this.state.projectUri, this.sample.sourcePath, this.sample.segments, count, false);
                        window.dispatchEvent(new Event('akari.onboarding.refreshTimeline'));
                        this.live = `Adding captions…（${count}/${this.sample.segments.length}）`;
                        this.render();
                        const segment = this.sample.segments[count - 1];
                        await this.seekOutput(this.state.projectUri, (segment.start + segment.end) / 2).catch(() => undefined);
                    }
                }
                if (entry.stage !== undefined) {
                    await staged.writeExample(this.state.projectUri, this.sample.sourcePath, this.sample.segments,
                        this.sample.segments.length, true, { stage: entry.stage });
                    window.dispatchEvent(new Event('akari.onboarding.refreshTimeline'));
                    const moments: Record<number, number> = { 1: 4.2, 2: 13.5, 3: 20.25, 4: 25.2,
                        5: 28.6, 6: 30.1, 7: 31.9, 8: 36.9 };
                    await this.seekOutput(this.state.projectUri, moments[entry.stage]).catch(() => undefined);
                }
                if (entry.lint) {
                    const errors = await this.service.lintExample(this.state.projectUri);
                    if (errors !== 0) throw new Error(`edit-lint: ${errors} findings`);
                }
                this.logLines.push(...entry.lines);
                this.render();
            }
            await new Promise<void>(resolve => { this.timers.push(window.setTimeout(resolve, 700)); });
            if (this.root && this.state.step === 'work') {
                this.state = { ...this.state, workCompleted: true };
                await this.service.save(this.state);
                await this.go('play');
            }
        } catch (error) {
            console.error('[akari-surfaces] onboarding replay failed', error);
            this.workError = true;
            this.live = 'Could not save the example. Check write permissions and try again.';
            this.render();
        } finally { this.busy = false; }
    }

    protected beginExportPoll(): void {
        if (this.exportPoll) window.clearInterval(this.exportPoll);
        this.exportPoll = window.setInterval(() => {
            if (this.state.step !== 'export' || this.state.sub !== 3 || !this.state.projectUri || this.exportFinishing) return;
            void this.service.hasExport(this.state.projectUri).then(async found => {
                if (!found || this.state.step !== 'export' || this.state.sub !== 3 || this.exportFinishing) return;
                const dialog = document.querySelector<HTMLElement>('.akari-export-dialog-host');
                if (dialog && !dialog.textContent?.includes('Export complete')) return;
                this.exportFinishing = true;
                try {
                    dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
                    await this.showAssets();
                    window.dispatchEvent(new Event('akari.onboarding.refreshProject'));
                    await this.setSub(4);
                } finally { this.exportFinishing = false; }
            });
        }, 1000);
    }

}
