import { deriveStoreLabBaseUrl } from 'akari-project/lib/common/asset-catalog-view';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import URI from '@theia/core/lib/common/uri';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { AkariLibraryStatus, AkariNewProjectService, AkariToolCheckResult, AkariToolId } from '../common/akari-new-project-protocol';
import { AkariFirstRunSetupDialog } from './akari-first-run-setup-dialog';
import { AKARI_APP_ICON } from './settings/app-icon';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AbstractDialog, ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { ApplicationShell, CommonCommands, WebSocketConnectionProvider, WidgetManager } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PluginServer } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { OS } from '@theia/core/lib/common/os';
import { buildExportEncoderChoices, ExportEncoder } from 'akari-shell-strip/lib/common/export-encoder-choices';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { CommandContribution, CommandRegistry, CommandService, MessageService } from '@theia/core/lib/common';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeymapsService } from '@theia/keymaps/lib/browser/keymaps-service';
import { KeyboardLayoutService } from '@theia/core/lib/browser/keyboard/keyboard-layout-service';
import { formatLibraryBytes, libraryMoveCopy } from '../common/library-storage';
import { PreferenceScope, PreferenceService, PreferenceSchemaService } from '@theia/core/lib/common/preferences';
import { StoreConnectionFlowController, StoreConnectionFlowState } from 'akari-project/lib/common/store-connection-flow';
import { AkariProjectService } from 'akari-project/lib/common/akari-project-protocol';
import { AKARI_BORDER, AKARI_SURFACE } from 'akari-project/lib/common/akari-surface-tokens';
import {
    AkariConnectionsService, ConnectionDoctor, ConnectionRow, ConnectionsList, GenerationKind, providerHasBalanceEndpoint,
    TRANSCRIBE_BACKENDS, TranscribeBackend
} from 'akari-shell-strip/lib/common/akari-connections-protocol';
import { generationOptions, generationSourceLabel } from '../common/generation-defaults-view';
import { storeReconnectRequired, STORE_RECONNECT_REQUIRED_MESSAGE } from '../common/store-entitlements-visibility';
import { dialogOutsideClick } from '../common/dialog-outside-click';
import { describeToolInstallOutcome, formatInstallProgressLabel } from '../common/tool-install-ui';
import { computeDownloadPercent, formatDownloadProgressLabel } from '../common/tool-install-progress';
import { deriveToolRowState, shouldShowToolNote, TOOL_UI, WHISPER_MODEL_SIZE_LABEL } from '../common/tool-guidance';
import { AKARI_VIDEO_LICENSE_URL, AKARI_VIDEO_NEW_ISSUE_URL, AKARI_VIDEO_REPO_URL } from '../common/repo-links';
import { AkariHomeCommands } from './akari-home-command-contribution';
import { AkariNarrationEnginesService, NarrationEngineRow, SettingsVoiceAvatar, SettingsVoiceProfile } from '../common/narration-engines-protocol';
import { falKeyAvailable, settingsVoiceEngineValue, voiceAvatarLabel, voiceSettingsActions } from '../common/voice-settings-model';
import { createGeminiConsentPrompt } from 'akari-annotations/lib/browser/voice-clone/gemini-consent-step';
import { geminiConsentCanNext, geminiConsentStatus,
    type GeminiConsentCheck } from 'akari-annotations/lib/common/voice-clone-model';
import { AkariAnnotationsService,
    type ImageRouteState } from 'akari-annotations/lib/common/akari-annotations-protocol';
import {
    AKARI_TRANSCRIBE_MODE, AKARI_TRANSCRIBE_AUTO_CUTS, AKARI_TRANSCRIBE_BACKEND, AKARI_TRANSCRIBE_COMPARE_SET,
    AKARI_NARRATION_ENGINE, AKARI_NARRATION_VOICE, AKARI_NARRATION_IRODORI_URL,
    AKARI_QUALITY_TIER, AKARI_DEVELOPER_MODE, AKARI_AGENT_TURN_END_NOTIFICATION, AKARI_CATALOG_ROOT,
    AKARI_TIMELINE_VISUAL_THUMBNAILS,
    WORKBENCH_COLOR_THEME, AKARI_EXPORT_QUALITY, AKARI_EXPORT_OUTPUT_DIRECTORY, AKARI_EXPORT_FILENAME_PATTERN,
    AKARI_EXPORT_ENCODER, AKARI_EXPORT_CODEC, AKARI_EXPORT_FPS, EXPORT_CODEC_CHOICES, EXPORT_FPS_CHOICES,
    SETTINGS_SECTIONS, SettingsSectionId, QUALITY_TIER_CHOICES, THEME_CHOICES, EXPORT_QUALITY_CHOICES, TRANSCRIBE_MODE_CHOICES,
    normalizeQualityTier, normalizeTheme, normalizeExportQuality, normalizeOutputDirectory,
    sectionForPreferenceKey, resolveSettingsSectionId, settingsSectionElementId, isSettingsSectionVisible,
    SETTINGS_SECTION_DESCRIPTIONS, SETTINGS_LAST_SECTION_KEY, initialSettingsSection, QUALITY_TIER_RESERVED_NOTE,
    normalizeExportEncoder, normalizeExportCodec, normalizeExportFps, isValidIrodoriUrl
} from '../common/settings-sections';
import { AKARI_APPEARANCE_THEME_MODE, AKARI_APPEARANCE_ZOOM, STATUS_BAR_KEYS, AKARI_PARTNER_REOPEN, clampZoom, matchesSettingsSearch, formatShortReleaseDate } from '../common/settings-sections';
import { PARTNER_CLI_ICON_CLASSES, PARTNER_CATALOG } from 'akari-partner/lib/browser/partner-catalog';
import { partnerSettingsCliRows } from '../common/partner-settings-rows';
import { installPartnerTerminalStyle } from 'akari-partner/lib/browser/partner-terminal-style';
import { AkariSettingsMaintenanceService, AKARI_SETTINGS_MAINTENANCE_PATH, PartnerDetail, StorageSnapshot, StorageEntry, StorageCleanTarget } from '../common/settings-maintenance-protocol';
import { AkariAiModelsService, AKARI_AI_MODELS_SERVICE_PATH } from '../common/ai-models-protocol';
import { AiModelsView } from './ai-models/ai-models-view';
import { parseUpdateCache, resolveUpdateDownloadUrl } from '../common/update-feed';
import {
    applyImmediateUpdaterFallback, applyShellUpdaterEvent, beginUserInitiatedUpdaterCheck,
    RELEASES_PAGE_URL, INITIAL_SHELL_UPDATER_UI_STATE, ShellUpdaterEvent, ShellUpdaterUiState, shouldOpenUpdaterBrowserFallback
} from '../common/shell-update-applier';
import { resolveSettingsUpdateView } from '../common/settings-update-view';
import { settingsIcon, SettingsIconName } from './settings/settings-icons';
import { ShortcutsSettingsView } from './settings/shortcuts-settings';
import {
    checkChips, choiceCards, dropdown, DropdownHandle, el, groupCard, segmentedControl, setPill, settingRow, settingsNote,
    statusPill, switchControl, textField
} from './settings/settings-ui';
import {
    PROVIDER_DISPLAY, PROVIDER_GROUP_LABELS, providerBillingUrl, providerGroup, providerInitial, providerLogo, ProviderGroup
} from 'akari-shell-strip/lib/browser/settings/provider-catalog';
import { makerBadge } from './settings/maker-badge';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONNECTION_MAKERS = require('../../../../../../packages/schemas/ai-makers.json');

const ENGINE_LABELS: Record<string, string> = {
    'speech-analyzer': 'SpeechAnalyzer (this Mac)', 'whisper-cpp': 'Whisper.cpp (local)',
    'cloud:scribe': 'Scribe (cloud)', 'cloud:groq': 'Groq (cloud)'
};
const ENGINE_DESCRIPTIONS: Record<string, string> = {
    'speech-analyzer': 'Fast and offline', 'whisper-cpp': 'Offline, focused on accuracy',
    'cloud:scribe': 'Requires an ElevenLabs key', 'cloud:groq': 'Requires a Groq key'
};
const ENGINE_SHORT_LABELS: Record<string, string> = {
    'speech-analyzer': 'SpeechAnalyzer', 'whisper-cpp': 'Whisper.cpp', 'cloud:scribe': 'Scribe', 'cloud:groq': 'Groq'
};
// narration-command.mjs の Gemini 30 声。既定の Leda を先頭にし、残りは名前順。
const GEMINI_NARRATION_VOICES = [
    'Leda', 'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe',
    'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux',
    'Iapetus', 'Kore', 'Laomedeia', 'Orus', 'Puck', 'Pulcherrima', 'Rasalgethi',
    'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix',
    'Zephyr', 'Zubenelgenubi'
] as const;
/** エンコーダのセグメントは短い名前で並べ、正式名は title（ホバー）に残す。 */
const ENCODER_SHORT_LABELS: Record<ExportEncoder, string> = {
    auto: 'Automatic', videotoolbox: 'GPU', nvenc: 'NVENC', qsv: 'QSV', amf: 'AMF', mf: 'Media Foundation', x264: 'CPU'
};
const TOOL_ICONS: Record<AkariToolId, SettingsIconName> = {
    ffmpeg: 'film', whisper: 'mic', 'yt-dlp': 'download', voicevox: 'user', blender: 'cube', 'speech-analyzer': 'spark', 'xcode-clt': 'terminal'
};
const STORAGE_COLORS = ['#9a9a9a', '#7a7a7a', '#5c5c5c', '#454545', '#333333'] as const;

export class AkariSettingsDialog extends AbstractDialog<void> {
    protected readonly body = element('main');
    protected readonly transcribe = element('section');
    protected readonly connections = element('section');
    protected readonly providerList = element('div');
    protected readonly subscriptionList = element('div');
    protected readonly imageAiRow = element('div');
    protected readonly storage = element('div');
    protected libraryStatus: AkariLibraryStatus | undefined;
    /** Akari アカウント節の中身（アカウント帯 + AKARI Store のグループ）。renderStore が描き直す。 */
    protected readonly storeRow = element('div');
    protected readonly sections = new Map<SettingsSectionId, HTMLElement>();
    protected aiModelsView?: AiModelsView;
    protected shortcutsView?: ShortcutsSettingsView;
    protected readonly storeController: StoreConnectionFlowController;
    protected storeState: StoreConnectionFlowState = { connection: { connected: false }, connectionLoading: true, phase: 'idle' };
    protected storeReconnect = false;
    protected storeStatusGeneration = 0;
    protected readonly notice = element('p');
    protected preferenceWrites: Promise<unknown> = Promise.resolve();
    protected readonly localPreferenceWrites = new Set<string>();
    protected readonly toolsView: SettingsToolsView;
    protected compareEnabled: boolean;
    protected compareDraft: string[];
    protected connectionSummary: { configured: number; total: number } | undefined;
    protected imageRouteStates: ImageRouteState[] = [];
    protected imageRoutesService?: AkariAnnotationsService;
    protected readonly searchInput = element('input');
    protected storageSnapshot: StorageSnapshot | undefined;
    protected diagnosticPath = '';
    protected diagnosticPathCustomized = false;
    protected credentialsPath = '';
    protected narrationState: { engines: NarrationEngineRow[]; voicevoxCaskAvailable: boolean } | undefined;
    protected voiceProfiles: SettingsVoiceProfile[] = [];
    protected voiceProfilesLoaded = false;
    protected voiceAvatars: SettingsVoiceAvatar[] = [];
    protected narrationRefreshGeneration = 0;
    protected narrationLoading = false;
    protected narrationBusy = '';
    protected narrationError = '';
    protected voicevoxPreviewSrc = '';
    protected partnerDetails: Record<string, PartnerDetail> | undefined;
    protected extensionVersions: Record<string, string> | undefined;
    protected aboutUpdaterUnsubscribe?: () => void;
    protected aboutUpdateRow?: HTMLElement;
    protected aboutUpdaterState: ShellUpdaterUiState = INITIAL_SHELL_UPDATER_UI_STATE;
    protected aboutLastEventKind?: ShellUpdaterEvent['kind'];
    protected aboutCurrentVersion?: string;
    protected aboutCheckedAt?: string;
    protected aboutDownloadUrl?: string;
    protected aboutUpdateGeneration = 0;
    protected aboutEventSequence = 0;

    constructor(
        protected readonly preferences: PreferenceService,
        protected readonly service: AkariConnectionsService,
        protected readonly storeService: AkariProjectService,
        protected readonly windows: WindowService,
        protected readonly commands: CommandService,
        protected readonly toolsService: AkariNewProjectService, protected readonly files: FileService, protected readonly env: EnvVariablesServer,
        protected readonly fileDialogs: FileDialogService, protected readonly maintenance: AkariSettingsMaintenanceService,
        protected readonly workspaceRoot: string | undefined, protected readonly widgetManager: WidgetManager,
        protected readonly shell: ApplicationShell, protected readonly pluginServer: PluginServer,
        protected readonly narrationService: AkariNarrationEnginesService,
        protected readonly keybindingRegistry: KeybindingRegistry, protected readonly commandRegistry: CommandRegistry,
        protected readonly keymapsService: KeymapsService, protected readonly keyboardLayout: KeyboardLayoutService,
        protected readonly aiModelsService: AkariAiModelsService, initialSection?: SettingsSectionId
    ) {
        super({ title: 'AKARI Video settings' });
        this.compareDraft = preferences.get<string[]>(AKARI_TRANSCRIBE_COMPARE_SET, []);
        this.compareEnabled = this.compareDraft.length > 0;
        this.storeController = new StoreConnectionFlowController(storeService, {
            openVerificationUrl: url => windows.openNewWindow(url, { external: true }),
            onChange: state => {
                if (this.isDisposed) { return; }
                this.storeState = state;
                this.renderStore();
                void this.refreshStoreEntitlements();
            }
        });
        this.toDispose.push(this.storeController);
        this.toolsView = new SettingsToolsView({ title: 'Tools', onWorkspaceCreated: async () => undefined, onFinished: () => undefined },
            files, env, toolsService, commands);
        this.toolsView.onToolsChanged = () => { if (!this.isDisposed) { this.renderSection('start'); } };
        this.toDispose.push(this.toolsView);
        this.buildDom();
        installPartnerTerminalStyle();
        let stored: string | null = null;
        try { stored = localStorage.getItem(SETTINGS_LAST_SECTION_KEY); } catch { /* 保存不可でも設定は使える。 */ }
        this.showSection(initialSettingsSection(initialSection, stored));
        for (const section of SETTINGS_SECTIONS) { this.renderSection(section.id); }
        this.toDispose.push(preferences.onPreferenceChanged(change => {
            if (this.localPreferenceWrites.delete(change.preferenceName)) { return; }
            const section = sectionForPreferenceKey(change.preferenceName);
            if (section) { this.renderSection(section); }
        }));
        void this.toolsView.refresh();
        void this.loadConnections();
        void this.storeController.refreshStatus();
        void this.loadStorage();
        void this.refreshLibraryStatus();
        void this.loadPartnerDetails();
        void this.maintenance.diagnosticDefaultPath().then(value => {
            if (!this.diagnosticPathCustomized && !this.diagnosticPath) { this.diagnosticPath = value; this.renderSection('help'); }
        });
    }

    setImageRoutesService(service: AkariAnnotationsService): void {
        this.imageRoutesService = service;
        void service.probeImageRoutes(['codex', 'antigravity', 'grok']).then(states => {
            if (!this.isDisposed) { this.imageRouteStates = states; this.renderSubscriptions(); }
        }).catch(() => {
            if (!this.isDisposed) {
                this.imageRouteStates = ['codex', 'antigravity', 'grok'].map(id => ({
                    id: id as ImageRouteState['id'], state: 'unknown' as const, detail: 'Could not check status'
                }));
                this.renderSubscriptions();
            }
        });
    }

    get value(): void { return undefined; }
    focusSearch(): void { this.searchInput.focus(); }
    refreshPrivacy(): void { if (!this.isDisposed) { this.renderSection('privacy'); } }
    protected override handleEnter(_event: KeyboardEvent): boolean { return false; }

    override close(): void {
        this.stopAboutUpdaterEvents();
        for (const input of Array.from(this.node.querySelectorAll<HTMLInputElement>('input[type=password]'))) { input.value = ''; }
        super.close();
    }

    protected buildDom(): void {
        this.node.setAttribute('data-akari-settings-dialog', 'true');
        const block = this.contentNode.parentElement;
        if (block) {
            Object.assign(block.style, {
                width: 'min(1040px, calc(100vw - 48px))', maxWidth: '1040px', minWidth: '0',
                height: 'min(760px, calc(100vh - 48px))', maxHeight: 'calc(100vh - 48px)',
                borderRadius: '12px', overflow: 'hidden', border: AKARI_BORDER.edge, background: AKARI_SURFACE.raised
            });
        }
        Object.assign(this.contentNode.style, { display: 'flex', flexDirection: 'row', padding: '0', flex: '1', minHeight: '0', maxHeight: 'none', overflow: 'hidden' });
        this.controlPanel.style.display = 'none';
        const nav = element('nav');
        nav.className = 'akari-set-nav';
        nav.setAttribute('aria-label', 'Settings sections');
        this.searchInput.className = 'akari-set-search';
        this.searchInput.type = 'search';
        this.searchInput.placeholder = 'Find settings';
        this.searchInput.setAttribute('aria-label', 'Search settings');
        this.searchInput.addEventListener('input', () => this.filterSections());
        const search = element('label'); search.className = 'akari-set-search-wrap';
        const keyHint = element('kbd', '⌘F');
        search.append(settingsIcon('search', 'sm'), this.searchInput, keyHint);
        nav.append(search);
        let previousGroup: string = 'main';
        for (const section of SETTINGS_SECTIONS) {
            if (section.group !== previousGroup) {
                const group = element('h3', section.group === 'data' ? 'Data and privacy' : section.group === 'support' ? 'Support' : 'Developer');
                group.className = 'akari-set-nav-group';
                group.setAttribute('data-settings-nav-group', section.group);
                nav.append(group);
            }
            previousGroup = section.group;
            nav.append(this.navigation(section.label, section.id, section.icon, 'badge' in section ? section.badge : undefined));
        }
        Object.assign(this.body.style, { display: 'flex', flexDirection: 'column', flex: '1', minWidth: '0', minHeight: '0', position: 'relative' });
        this.notice.setAttribute('role', 'alert');
        this.notice.className = 'akari-set-notice';
        this.body.append(this.notice);
        for (const section of SETTINGS_SECTIONS) {
            const node = section.id === 'transcribe' ? this.transcribe
                : section.id === 'connections' ? this.connections : element('section');
            node.id = settingsSectionElementId(section.id);
            node.className = 'akari-set-page';
            node.setAttribute('data-akari-settings-section', section.id);
            node.hidden = true;
            node.setAttribute('aria-labelledby', `${node.id}-heading`);
            Object.assign(node.style, { flex: '1', minHeight: '0', overflowY: 'auto' });
            this.sections.set(section.id, node);
            this.body.append(node);
        }
        this.storeRow.setAttribute('data-akari-store-settings', 'true');
        // AKARI Store は「Akari アカウント」節へ移した（2026-09-22）。接続と API キーの末尾には置かない。
        const storeMoved = settingsNote('Register narration API keys here too. AKARI Video Lab connections have moved to AKARI account.');
        storeMoved.append(' ', inlineLink('Open AKARI account', () => this.showSection('account')));
        this.connections.append(...this.sectionHeading('connections'), storeMoved, this.subscriptionList,
            element('h3', 'Pay as you go — API keys'), this.providerList, this.imageAiRow, this.storage);
        this.providerList.append(settingsNote('Loading connections…'));
        this.renderStore();
        this.contentNode.append(nav, this.body);
        this.addEventListener(this.node, 'keydown', event => {
            if (event.metaKey && event.key.toLowerCase() === 'f') { event.preventDefault(); this.searchInput.focus(); }
        });
    }

    showSection(section: SettingsSectionId): void {
        if (section !== 'about') { this.stopAboutUpdaterEvents(); }
        const block = this.contentNode.parentElement;
        if (block) {
            block.style.width = `min(${section === 'ai-models' ? 1440 : 1040}px, calc(100vw - 48px))`;
            block.style.maxWidth = section === 'ai-models' ? '1440px' : '1040px';
        }
        const navTarget = this.contentNode.querySelector<HTMLElement>(`[data-settings-nav="${section}"]`);
        if (navTarget?.hidden && this.searchInput.value) { this.searchInput.value = ''; this.filterSections(); }
        for (const [id, node] of this.sections) {
            node.hidden = !isSettingsSectionVisible(id, section);
            if (!node.hidden) { node.scrollTop = 0; }
        }
        try { localStorage.setItem(SETTINGS_LAST_SECTION_KEY, section); } catch { /* 保存不可でもページは切り替える。 */ }
        // 選択中は面の色（一段明るい面 + 太字 + アイコンだけアクセント色）で示す。縦バーは使わない（CSS 側）。
        for (const item of Array.from(this.contentNode.querySelectorAll<HTMLElement>('[data-settings-nav]'))) {
            if (item.getAttribute('data-settings-nav') === section) { item.setAttribute('aria-current', 'true'); }
            else { item.removeAttribute('aria-current'); }
        }
        this.highlightSearch(section);
        if (section === 'about' && this.sections.get('about')?.childElementCount) { this.renderSection('about'); }
        if (section === 'narration') { void this.refreshNarrationState(); }
    }

    protected filterSections(): void {
        const query = this.searchInput.value;
        let first: SettingsSectionId | undefined;
        for (const item of SETTINGS_SECTIONS) {
            const node = this.sections.get(item.id)!;
            const rows = Array.from(node.querySelectorAll<HTMLElement>(
                '.akari-set-row-label,.akari-set-row-desc,.akari-set-group-title,.akari-set-partner-name,.akari-set-partner-sub,.akari-set-storage-header,.akari-set-permission-row'
            )).map(row => row.textContent ?? '');
            const match = matchesSettingsSearch(query, item.label, SETTINGS_SECTION_DESCRIPTIONS[item.id], rows);
            const nav = this.contentNode.querySelector<HTMLElement>(`[data-settings-nav="${item.id}"]`);
            if (nav) { nav.hidden = !match; }
            if (match && !first) { first = item.id; }
        }
        const visible = Array.from(this.contentNode.querySelectorAll<HTMLElement>('[data-settings-nav]')).find(item => item.getAttribute('aria-current') === 'true' && !item.hidden);
        if (!visible && first) { this.showSection(first); }
        for (const item of SETTINGS_SECTIONS) { this.highlightSearch(item.id); }
        for (const group of Array.from(this.contentNode.querySelectorAll<HTMLElement>('[data-settings-nav-group]'))) {
            const name = group.getAttribute('data-settings-nav-group');
            group.hidden = !SETTINGS_SECTIONS.some(item => item.group === name && !this.contentNode.querySelector<HTMLElement>(`[data-settings-nav="${item.id}"]`)?.hidden);
        }
    }

    protected highlightSearch(id: SettingsSectionId): void {
        const query = this.searchInput.value.trim().toLocaleLowerCase();
        for (const row of Array.from(this.sections.get(id)!.querySelectorAll<HTMLElement>(
            '.akari-set-row,.akari-set-partner-row,.akari-set-storage-row,.akari-set-permission-row'
        ))) {
            row.classList.toggle('akari-set-search-hit', !!query && (row.querySelector('.akari-set-row-text')?.textContent ?? row.textContent ?? '').toLocaleLowerCase().includes(query));
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // attach ごとの状態と、detach 時に解除されるリスナでドラッグ終端の誤閉鎖を防ぐ。
        let armed = false;
        this.addEventListener(this.node, 'mousedown', event => {
            armed = dialogOutsideClick(armed, 'mousedown', event.target, this.node, event.button).armed;
        });
        this.addEventListener(this.node, 'click', event => {
            const result = dialogOutsideClick(armed, 'click', event.target, this.node, event.button);
            armed = result.armed;
            if (result.close) { this.close(); }
        });
    }

    protected navigation(label: string, target: SettingsSectionId, icon: SettingsIconName, badge?: string): HTMLButtonElement {
        const button = element('button');
        button.type = 'button';
        button.className = 'akari-set-nav-item';
        const title = element('span', label); title.className = 'akari-set-nav-label';
        button.append(settingsIcon(icon), title);
        if (badge) { const note = element('span', badge); note.className = `akari-set-nav-badge${badge === 'Coming soon' ? ' akari-set-nav-badge-soon' : ''}`; button.append(note); }
        button.addEventListener('click', () => this.showSection(target));
        button.setAttribute('data-settings-nav', target);
        return button;
    }

    protected sectionHeading(id: SettingsSectionId): HTMLElement[] {
        const heading = element('h2', SETTINGS_SECTIONS.find(item => item.id === id)!.label);
        heading.id = `${settingsSectionElementId(id)}-heading`;
        const lead = description(SETTINGS_SECTION_DESCRIPTIONS[id]);
        lead.className = 'akari-set-lead';
        lead.style.margin = '';
        return [heading, lead];
    }

    protected renderSection(id: SettingsSectionId): void {
        if (id === 'transcribe') { this.renderTranscribe(); return; }
        if (id === 'narration') { this.renderNarration(); return; }
        if (id === 'connections') { return; }
        if (id === 'ai-models' && this.aiModelsView) { return; }
        const section = this.sections.get(id)!;
        section.replaceChildren(...this.sectionHeading(id));
        if (id === 'ai-models') { this.aiModelsView = new AiModelsView(section, this.aiModelsService, this.workspaceRoot); return; }
        if (id === 'shortcuts') {
            this.shortcutsView?.dispose();
            this.shortcutsView = new ShortcutsSettingsView(section, this.keybindingRegistry, this.commandRegistry,
                this.keymapsService, this.keyboardLayout,
                () => this.preferences.get<'code' | 'keyCode'>('keyboard.dispatch', 'code'),
                this.files, this.env, this.maintenance, message => { this.notice.textContent = message; });
            return;
        }
        if (id === 'partner') { this.renderPartner(section); return; }
        if (id === 'storage') { this.renderStorageSection(section); return; }
        if (id === 'privacy') { this.renderPrivacy(section); return; }
        if (id === 'statistics') { this.renderStatistics(section); return; }
        if (id === 'help') { this.renderHelp(section); return; }
        if (id === 'about') { this.renderAbout(section); return; }
        if (id === 'account') {
            section.append(this.storeRow);
        } else if (id === 'tools') {
            section.append(this.toolsView.content);
            const directory = textField({ label: 'Catalog footage folder', placeholder: '(Find automatically)', wide: true });
            directory.value = normalizeOutputDirectory(this.preferences.get(AKARI_CATALOG_ROOT));
            directory.addEventListener('change', () => this.savePreference(AKARI_CATALOG_ROOT, directory.value));
            const pick = action('Choose', async () => {
                try {
                    const destination = await this.fileDialogs.showOpenDialog({
                        title: 'Choose catalog footage folder', canSelectFiles: false, canSelectFolders: true
                    });
                    if (!destination || this.isDisposed) { return; }
                    directory.value = destination.path.fsPath();
                    this.savePreference(AKARI_CATALOG_ROOT, directory.value);
                    await this.preferenceWrites;
                    if (!this.isDisposed) { this.renderSection('tools'); }
                } catch {
                    this.notice.textContent = 'Could not choose a folder.';
                }
            }, { small: true, icon: 'folder' });
            const catalogRow = groupCard('Footage folder', settingRow('Catalog footage folder', 'Footage folder used by the catalog tab. Leave empty to find it automatically', directory, pick));
            catalogRow.setAttribute('data-akari-catalog-root', 'true');
            section.append(catalogRow);
        } else if (id === 'start') {
            section.append(groupCard(undefined, settingRow('First video guide',
                'Learn AKARI Video while making your first video.',
                action('View', () => {
                    this.close();
                    void this.commands.executeCommand(AkariHomeCommands.OPEN_FIRST_VIDEO_GUIDE.id);
                }, { variant: 'primary' }))));
            const open = action('Open setup', () => {
                this.close();
                void this.commands.executeCommand(AkariHomeCommands.OPEN_FIRST_RUN_SETUP.id);
            });
            const hero = element('div');
            hero.className = 'akari-set-hero';
            const copy = element('div');
            const heroTitle = element('div', 'Getting ready');
            heroTitle.className = 'akari-set-hero-title';
            copy.append(heroTitle, description('Set up tools, your workspace, footage, and AI partner in order. Repeat at any time'));
            hero.append(copy, open);
            const card = groupCard(undefined, hero);
            const steps = this.startProgressSteps();
            if (steps) { card.append(steps); }
            section.append(card);
        } else if (id === 'quality') {
            const current = normalizeQualityTier(this.preferences.get(AKARI_QUALITY_TIER));
            section.append(
                groupCard('Quality tier',
                    choiceCards({ label: 'Preview quality', options: QUALITY_TIER_CHOICES, value: current, columns: 2,
                        onChange: value => this.savePreference(AKARI_QUALITY_TIER, value) }),
                    settingsNote(QUALITY_TIER_RESERVED_NOTE)),
                groupCard('Timeline', this.preferenceSwitch(AKARI_TIMELINE_VISUAL_THUMBNAILS, 'Show HTML / 3D footage thumbnails', false,
                    'Many assets can slow opening. Turn off to show only type colors and names')));
        } else if (id === 'notifications') {
            section.append(groupCard(undefined, this.preferenceSwitch(AKARI_AGENT_TURN_END_NOTIFICATION, 'AI completion notifications', true,
                'Notify when Claude Code or another partner finishes (only while the window is in the background)')));
        } else if (id === 'appearance') {
            const theme = this.preferences.get<string>(AKARI_APPEARANCE_THEME_MODE, normalizeTheme(this.preferences.get(WORKBENCH_COLOR_THEME)));
            const themes: { value: string; label: string; preview?: HTMLElement }[] = THEME_CHOICES.map(option => ({ ...option, preview: themePreview(option.value) }));
            if (!themes.some(option => option.value === theme)) { themes.push({ value: theme, label: theme }); }
            section.append(groupCard('Theme', choiceCards({ label: 'Theme', options: themes, value: theme, columns: 3,
                onChange: value => { this.savePreference(AKARI_APPEARANCE_THEME_MODE, value); this.applyTheme(value); } })));
            section.append(groupCard('Language', settingRow('Display language', 'Other languages are coming soon',
                segmentedControl({ label: 'Language', options: [{ value: 'en', label: 'English' }, { value: 'ja', label: 'Japanese (coming soon)', disabled: true }], value: 'en', onChange: () => undefined }))));
            const zoom = clampZoom(Number(this.preferences.get(AKARI_APPEARANCE_ZOOM, 100)));
            const zoomLabel = element('span', `${zoom}%`);
            const changeZoom = (next: number): void => { const value = clampZoom(next); zoomLabel.textContent = `${value}%`; this.savePreference(AKARI_APPEARANCE_ZOOM, value); applyAkariZoom(value); };
            section.append(groupCard('UI size', settingRow('UI size', 'Zoom 60–200%. You can also use ⌘+ / ⌘−',
                action('−', () => changeZoom(Number(zoomLabel.textContent?.replace('%', '')) - 10), { small: true }), zoomLabel,
                action('+', () => changeZoom(Number(zoomLabel.textContent?.replace('%', '')) + 10), { small: true }),
                action('Reset', () => changeZoom(100), { small: true }))));
            section.append(groupCard('Status bar items (bottom right)',
                this.preferenceSwitch(STATUS_BAR_KEYS.cpu, 'CPU', true, 'Utilization'),
                this.preferenceSwitch(STATUS_BAR_KEYS.gpu, 'GPU', true, 'Utilization'),
                this.preferenceSwitch(STATUS_BAR_KEYS.memory, 'Memory', true, 'Usage'),
                this.preferenceSwitch(STATUS_BAR_KEYS.disk, 'Free disk space', false, 'Free space'),
                this.preferenceSwitch(STATUS_BAR_KEYS.running, 'Running tasks', true, 'Partner, export, and transcription'),
                this.preferenceSwitch(STATUS_BAR_KEYS.accountBalance, 'Account balance', false, 'Only services that provide balances'),
                settingRow('Refresh interval', 'How often resource displays refresh', segmentedControl({ label: 'Refresh interval',
                    options: [{ value: '1', label: '1 second' }, { value: '3', label: '3 seconds' }, { value: '10', label: '10 seconds' }],
                    value: String(this.preferences.get(STATUS_BAR_KEYS.intervalSec, 3)), onChange: value => this.savePreference(STATUS_BAR_KEYS.intervalSec, Number(value)) }))));
        } else if (id === 'developer') {
            section.append(groupCard(undefined, this.preferenceSwitch(AKARI_DEVELOPER_MODE, 'Developer mode', false,
                'Open HTML as code and enable full settings')));
        } else if (id === 'export') {
            const platform = OS.type() === OS.Type.OSX ? 'darwin' : OS.type() === OS.Type.Windows ? 'win32' : 'linux';
            const directory = textField({ label: 'Export folder URI', placeholder: '(Project exports/)', wide: true });
            directory.value = normalizeOutputDirectory(this.preferences.get(AKARI_EXPORT_OUTPUT_DIRECTORY));
            directory.addEventListener('change', () => this.savePreference(AKARI_EXPORT_OUTPUT_DIRECTORY, directory.value));
            const pickDirectory = action('Choose', async () => {
                try {
                    const destination = await this.fileDialogs.showOpenDialog({
                        title: 'Choose export folder', canSelectFiles: false, canSelectFolders: true
                    });
                    if (!destination || this.isDisposed) { return; }
                    directory.value = destination.toString();
                    this.savePreference(AKARI_EXPORT_OUTPUT_DIRECTORY, directory.value);
                } catch {
                    this.notice.textContent = 'Could not choose a folder.';
                }
            }, { small: true, icon: 'folder' });
            const encoders = buildExportEncoderChoices(platform).map(choice => ({
                value: choice.value, label: ENCODER_SHORT_LABELS[choice.value], title: choice.label
            }));
            section.append(
                groupCard('Quality', choiceCards({ label: 'Export quality', options: EXPORT_QUALITY_CHOICES, columns: 4,
                    value: normalizeExportQuality(this.preferences.get(AKARI_EXPORT_QUALITY)),
                    onChange: value => this.savePreference(AKARI_EXPORT_QUALITY, value) })),
                groupCard('Format',
                    settingRow('Format / Codec', 'Use MP4 · H.264 if unsure', dropdown({ label: 'Format / Codec', options: EXPORT_CODEC_CHOICES,
                        value: normalizeExportCodec(this.preferences.get(AKARI_EXPORT_CODEC)),
                        onChange: value => this.savePreference(AKARI_EXPORT_CODEC, value) })),
                    settingRow('Encoder', 'Speed and compatibility. Automatic prefers hardware when available', segmentedControl({ label: 'Encoder', options: encoders,
                        value: normalizeExportEncoder(this.preferences.get(AKARI_EXPORT_ENCODER), platform),
                        onChange: value => this.savePreference(AKARI_EXPORT_ENCODER, value) })),
                    settingRow('Frame rate', 'Defaults to edit data', segmentedControl({ label: 'Frame rate', options: EXPORT_FPS_CHOICES,
                        value: String(normalizeExportFps(this.preferences.get(AKARI_EXPORT_FPS)) ?? '') as typeof EXPORT_FPS_CHOICES[number]['value'],
                        onChange: value => this.savePreference(AKARI_EXPORT_FPS, normalizeExportFps(Number(value))) }))),
                groupCard('Destination',
                    settingRow('Export folder', 'Leave empty to use the project exports/ folder', directory, pickDirectory),
                    settingRow('Advanced settings', 'Open full settings', action('Open', () => {
                        this.close();
                        void this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
                    }, { small: true }))),
                groupCard('After export',
                    this.preferenceSwitch('akari.export.openFolderAfter', 'Open folder when finished', false, 'Reveal the exported file in Finder'),
                    this.preferenceSwitch('akari.export.notifyAfter', 'Notify when finished', true, 'Only while the window is in the background'),
                    settingRow('File naming', 'Exported file name', dropdown({ label: 'File naming',
                        options: [{ value: 'project-date-time', label: 'Project_date_time' }, { value: 'project-name', label: 'Project name' }],
                        value: this.preferences.get<string>(AKARI_EXPORT_FILENAME_PATTERN, 'project-date-time'),
                        onChange: value => this.savePreference(AKARI_EXPORT_FILENAME_PATTERN, value) }))));
        }
    }

    protected applyTheme(mode: string): void {
        const selected = mode === 'system' ? ((window.akariNativeDark ?? matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light') : mode;
        this.savePreference(WORKBENCH_COLOR_THEME, selected);
    }

    protected renderPartner(section: HTMLElement): void {
        const rows = partnerSettingsCliRows().map(({ entry, name }) => {
            const id = entry.agent;
            const detail = this.partnerDetails?.[id];
            return this.partnerRow(id, name, detail?.installed === undefined ? 'Checking' : detail.installed ? 'Installed' : 'Not installed',
                detail?.detail || '—', detail?.installed === false ? 'Installation guide' : 'Start', async () => {
                this.close();
                await this.commands.executeCommand('akari.partner.open');
                if (!detail?.installed) { return; }
                const widget = this.widgetManager.tryGetWidget('akari-partner-onboarding') as unknown as { begin(entry: typeof PARTNER_CATALOG[number]): Promise<void> } | undefined;
                if (widget) { await widget.begin(entry); }
            });
        });
        const extensions = [
            { id: 'anthropic.claude-code', agent: 'claude' as const, name: 'Claude Code extension' },
            { id: 'openai.chatgpt', agent: 'codex' as const, name: 'Codex extension' }
        ].map(entry => this.partnerRow(entry.agent, entry.name,
            this.extensionVersions ? entry.id in this.extensionVersions ? 'Installed' : 'Not installed' : 'Checking',
            `${entry.id}${this.extensionVersions?.[entry.id] ? ` · ${this.extensionVersions[entry.id]}` : ''}`, 'Open', () => {
                this.close(); void this.commands.executeCommand('akari.partner.open');
            }));
        const cli = groupCard('CLI', ...rows);
        const cliHeading = cli.querySelector<HTMLElement>('.akari-set-group-title');
        if (cliHeading) { cliHeading.append(element('span', 'Shown above the divider on the right rail')); }
        const caution = element('div'); caution.className = 'akari-set-caution';
        caution.append(settingsIcon('info', 'sm'), element('span', 'Conversations end when the extension host restarts. Use the CLI for longer tasks.'));
        section.append(cli, groupCard('Official extensions',
            caution,
            ...extensions,
            settingRow('Find other extensions', 'From Open VSX (advanced)', action('Open', async () => {
                this.close();
                const widget = await this.widgetManager.getOrCreateWidget('vsx-extensions-view-container');
                if (!widget.isAttached) { await this.shell.addWidget(widget, { area: 'main' }); }
                await this.shell.activateWidget(widget.id);
            }, { small: true }))),
        groupCard('Behavior', this.preferenceSwitch(AKARI_PARTNER_REOPEN, 'Reopen the last partner on startup', true, 'Place above the divider on the right rail')));
    }

    protected partnerRow(id: keyof typeof PARTNER_CLI_ICON_CLASSES, name: string, state: string, sub: string,
        buttonLabel: string, onClick: () => void | Promise<void>): HTMLElement {
        const row = element('div'); row.className = 'akari-set-partner-row';
        const tile = element('span'); tile.className = 'akari-set-partner-tile';
        const icon = element('span'); icon.className = `akari-set-partner-icon ${PARTNER_CLI_ICON_CLASSES[id]}`; tile.append(icon);
        const text = element('div');
        const top = element('div'); top.className = 'akari-set-partner-name';
        const badge = element('span', state); badge.className = 'akari-set-partner-chip';
        top.append(element('b', name), badge);
        const subtitle = element('div', sub); subtitle.className = 'akari-set-partner-sub';
        text.append(top, subtitle);
        row.append(tile, text, action(buttonLabel, onClick, { small: true }));
        return row;
    }

    protected async loadPartnerDetails(): Promise<void> {
        const [cli, plugins] = await Promise.allSettled([this.maintenance.partnerDetails(), this.pluginServer.getInstalledPlugins()]);
        if (cli.status === 'fulfilled') { this.partnerDetails = cli.value; }
        if (plugins.status === 'fulfilled') {
            this.extensionVersions = {};
            for (const item of plugins.value) {
                const value = String(item); const at = value.lastIndexOf('@');
                if (at > 0) { this.extensionVersions[value.slice(0, at).toLowerCase()] = value.slice(at + 1); }
            }
        }
        if (!this.isDisposed) { this.renderSection('partner'); }
    }

    protected async loadStorage(): Promise<void> {
        try { this.storageSnapshot = await this.maintenance.measure(this.workspaceRoot); }
        catch { this.storageSnapshot = { entries: [], freeBytes: 0 }; this.notice.textContent = 'Could not check storage.'; }
        if (!this.isDisposed) { this.renderSection('storage'); }
    }

    protected renderStorageSection(section: HTMLElement): void {
        if (!this.storageSnapshot) {
            section.append(settingsNote('Checking…'));
        } else {
            const { entries, freeBytes } = this.storageSnapshot;
            const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
            const summary = element('div'); summary.className = 'akari-set-storage-total';
            summary.append(element('b', formatBytes(total)), element('span', `All AKARI data · Free space on Mac: ${freeBytes ? formatBytes(freeBytes) : 'Could not check'}`));
            const usage = element('div'); usage.className = 'akari-set-storage-usage';
            const legend = element('div'); legend.className = 'akari-set-storage-legend';
            entries.forEach((entry, index) => {
                const part = element('i'); part.style.width = `${total ? entry.bytes / total * 100 : 20}%`; part.style.background = STORAGE_COLORS[index];
                usage.append(part);
                const item = element('span', `${entry.label} ${formatBytes(entry.bytes)}`);
                item.style.setProperty('--akari-storage-color', STORAGE_COLORS[index]); legend.append(item);
            });
            section.append(groupCard(undefined, summary, usage, legend));
            const rows = entries.map(entry => this.storageDetailRow(entry));
            const breakdown = groupCard('Breakdown', ...rows);
            breakdown.querySelector('.akari-set-group-title')?.append(element('span', 'Click a row to open'));
            section.append(breakdown);
        }
        section.append(this.renderLibraryStorageCard());
    }

    protected renderLibraryStorageCard(): HTMLElement {
        const status = this.libraryStatus;
        const usage = status?.usage;
        const open = action('Open in Finder', () => {
            if (status?.root) { void this.maintenance.openPath(status.root); }
        }, { small: true, icon: 'folder' });
        open.disabled = !status?.root;
        const change = action('Change location…', () => void this.commands.executeCommand('akari.library.changeLocation'), { small: true });
        const clean = action('Clean up downloadable footage', () => void this.clearLabLibrary(), { small: true });
        clean.disabled = !usage?.cleanup.length;
        const card = groupCard('Footage location',
            settingRow('Current location', status?.root ?? 'Checking…', open, change),
            settingRow('Total', usage ? formatLibraryBytes(usage.totalBytes) : 'Checking…'),
            settingRow('From Lab', usage ? `${formatLibraryBytes(usage.bySource.lab.bytes)}（${usage.bySource.lab.count} items)` : 'Checking…'),
            settingRow('From footage sites', usage ? `${formatLibraryBytes(usage.bySource.site.bytes)}（${usage.bySource.site.count} items)` : 'Checking…'),
            settingRow('Your own', usage ? `${formatLibraryBytes(usage.bySource.own.bytes)}（${usage.bySource.own.count} items)` : 'Checking…'),
            settingRow('Downloadable footage', 'Review footage received from Lab before moving it to the trash', clean));
        card.setAttribute('data-akari-library-usage', 'true');
        const moveCopy = status ? libraryMoveCopy(status.state, status.previous, status.cloud) : {};
        if (moveCopy.retained) { card.append(settingsNote(moveCopy.retained)); }
        if (status?.state === 'pending') {
            card.append(settingRow('Review before moving', moveCopy.sync,
                action('Use this location', () => void this.acceptSyncedLibrary(), { small: true }),
                action('Choose another location', () => void this.commands.executeCommand('akari.library.changeLocation'), { small: true }),
                action('Do not move now', () => void this.declineSyncedLibrary(), { small: true })));
        }
        return card;
    }

    protected storageDetailRow(entry: StorageEntry): HTMLElement {
        const row = element('div'); row.className = 'akari-set-storage-row'; row.setAttribute('data-storage-row', entry.id);
        const header = element('button'); header.type = 'button'; header.className = 'akari-set-storage-header';
        header.setAttribute('aria-expanded', 'false');
        const badge = element('span', entry.safeToDelete); badge.className = entry.id === 'cache' ? 'akari-set-storage-safe' : 'akari-set-storage-keep';
        header.append(settingsIcon('chevr', 'sm'), element('b', entry.label), badge, element('span', formatBytes(entry.bytes)));
        const detail = element('div'); detail.className = 'akari-set-storage-detail'; detail.hidden = true;
        const why = element('div'); why.className = 'akari-set-storage-why'; why.append(settingsIcon('shield', 'sm'), element('span', entry.detail));
        const table = element('table');
        for (const child of entry.children) {
            const tr = element('tr');
            for (const value of [child.label, child.path, formatBytes(child.bytes)]) { tr.append(element('td', value)); }
            table.append(tr);
        }
        const actions = element('div'); actions.className = 'akari-set-storage-actions';
        if (entry.id === 'cache' || entry.id === 'models' || entry.id === 'history') {
            const target: StorageCleanTarget = entry.id === 'history' ? 'old-history' : entry.id;
            actions.append(action(entry.id === 'cache' ? 'Clean up…' : entry.id === 'models' ? 'Delete…' : 'Delete old items…',
                () => this.showStorageConfirmation(target, entry), { small: true }));
        }
        if (entry.id === 'cache' || entry.id === 'library') {
            actions.append(action('Reveal in Finder', () => void this.maintenance.revealPath(entry.path), { small: true }));
        }
        if (entry.id === 'exports') { actions.append(action('List', () => void this.maintenance.openPath(entry.path), { small: true })); }
        detail.append(why, table, actions);
        header.addEventListener('click', () => { const open = header.getAttribute('aria-expanded') !== 'true';
            header.setAttribute('aria-expanded', String(open)); detail.hidden = !open; row.classList.toggle('akari-set-storage-open', open); });
        row.append(header, detail); return row;
    }

    protected showStorageConfirmation(target: StorageCleanTarget, entry: StorageEntry): void {
        const overlay = element('div'); overlay.className = 'akari-set-storage-confirm'; overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', `${entry.label} — Confirm deletion`);
        const box = element('div'); box.className = 'akari-set-storage-confirm-box';
        box.append(element('h4', `${target === 'cache' ? 'Clean up' : 'Delete'} ${entry.label} (${formatBytes(entry.bytes)})?`));
        const yes = element('ul');
        yes.append(...entry.paths.map(location => element('li', `Delete: ${target === 'old-history' ? 'History older than 30 days' : entry.label}（${location}）`)),
            element('li', target === 'cache' ? 'Automatically recreated when needed' : target === 'models' ? 'Must be downloaded again before next use' : 'Only history older than 30 days is deleted'));
        const no = element('ul'); no.className = 'akari-set-storage-confirm-no';
        no.append(element('li', 'Kept: projects, footage, exports, and recent edit history'));
        const buttons = element('div'); buttons.className = 'akari-set-storage-confirm-actions';
        buttons.append(action('Cancel', () => overlay.remove(), { small: true }),
            action(target === 'cache' ? 'Clean up' : 'Delete', async () => {
                try { await this.maintenance.cleanStorage(target, this.workspaceRoot); overlay.remove(); await this.loadStorage(); }
                catch { this.notice.textContent = `${entry.label} could not be deleted.`; overlay.remove(); }
            }, { small: true, variant: 'primary' }));
        box.append(yes, no, buttons); overlay.append(box); this.body.append(overlay);
    }

    protected renderPrivacy(section: HTMLElement): void {
        const microphone = window.akariPermissions?.microphone;
        const permissionLabel = (value: string | undefined): string => value === 'granted' ? 'Granted'
            : value === 'denied' || value === 'restricted' ? 'Denied' : value === 'not-determined' ? 'Not set' : 'Check in System Settings';
        const notification = typeof Notification !== 'undefined' ? Notification.permission : undefined;
        const permissions: { icon: SettingsIconName; name: string; description: string; state: string; url: string }[] = [
            { icon: 'mic', name: 'Microphone', description: 'Voice editing (Akari Vibe) and annotation recording', state: permissionLabel(microphone), url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone' },
            { icon: 'folder', name: 'Documents, Desktop, and Downloads', description: 'Open projects and footage stored there', state: 'Check in System Settings', url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders' },
            { icon: 'bell', name: 'Notifications', description: 'When exports or AI tasks finish', state: permissionLabel(notification), url: 'x-apple.systempreferences:com.apple.preference.notifications' },
            { icon: 'terminal', name: 'Full Disk Access', description: 'Usually unnecessary; some external drives may require it', state: 'Check in System Settings', url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles' }
        ];
        const rows = permissions.map(item => {
            const row = element('div'); row.className = 'akari-set-permission-row';
            const tile = element('span'); tile.className = 'akari-set-partner-tile'; tile.append(settingsIcon(item.icon, 'sm'));
            const copy = element('div'); copy.append(element('b', item.name), element('span', item.description));
            const state = element('span', item.state); state.className = `akari-set-permission-state${item.state === 'Granted' ? ' akari-set-permission-state-ok' : ''}`;
            row.append(tile, copy, state, action('System Settings', () => this.windows.openNewWindow(item.url, { external: true }), { small: true }));
            return row;
        });
        section.append(groupCard('macOS permissions', ...rows),
        groupCard('Data sent externally', settingRow('Usage reporting', 'AKARI Video does not send usage data', statusPill('Not sent')),
            settingRow('API key', `Keys are stored at ${this.credentialsPath || (OS.type() === OS.Type.Windows ? '%USERPROFILE%\\.akari\\credentials.env' : '~/.akari/credentials.env')} (this PC only, permissions 600). They are not sent to AKARI servers`, action('Open location', () => {
                if (this.credentialsPath) { void this.maintenance.openPath(this.credentialsPath.replace(/[\\/][^\\/]+$/, '')); }
            }, { small: true }))));
    }

    protected renderStatistics(section: HTMLElement): void {
        const wrap = element('div'); wrap.className = 'akari-set-soon';
        const blurred = element('div'); blurred.className = 'akari-set-soon-blur'; blurred.setAttribute('aria-hidden', 'true');
        const kpi = element('div'); kpi.className = 'akari-set-stats-kpi';
        for (const [label, value] of [['Amount spent', '$23.10'], ['Tokens', '4.2 M'], ['Generated videos', '37 videos']]) {
            const tile = element('div'); tile.append(element('span', label), element('b', value)); kpi.append(tile);
        }
        const chart = element('div'); chart.className = 'akari-set-stats-chart';
        [20, 35, 28, 60, 44, 12, 8, 52, 70, 33, 41, 25, 18, 64].forEach((height, index) => {
            const bar = element('i'); bar.style.height = `${height}%`; if (index % 5 === 3) { bar.className = 'akari-set-stats-chart-hi'; } chart.append(bar);
        });
        blurred.append(groupCard('Last 30 days', kpi, chart));
        const services = [['OpenRouter · Akari Vibe', '$11.40', 62], ['fal · Image and video generation', '$9.20', 48],
            ['ElevenLabs · Narration', '$2.50', 14]] as const;
        blurred.append(groupCard('By service', ...services.map(([name, amount, percent]) => {
            const row = element('div'); row.className = 'akari-set-stats-service';
            const logo = element('span'); logo.className = 'akari-set-stats-service-logo';
            const bar = element('span'); bar.className = 'akari-set-stats-service-bar';
            const fill = element('i'); fill.style.width = `${percent}%`; bar.append(fill);
            row.append(logo, element('span', name), bar, element('span', amount)); return row;
        })));
        const veil = element('div'); veil.className = 'akari-set-soon-veil';
        const copy = element('div'); copy.append(element('b', 'Coming soon'), element('span', 'Usage and cost by service')); veil.append(copy);
        wrap.append(blurred, veil); section.append(wrap);
    }

    protected renderHelp(section: HTMLElement): void {
        const checklist = element('div'); checklist.className = 'akari-set-diagnostic-list';
        for (const label of ['App and OS versions', 'Recent logs (24 hours)', 'Tool status (ffmpeg and others)', 'Panel layout', 'Project edit.json']) {
            const item = element('span'); item.append(settingsIcon('check', 'sm'), element('span', label)); checklist.append(item);
        }
        const excluded = element('span', 'Excludes API keys and personal paths'); excluded.className = 'akari-set-diagnostic-excluded'; checklist.append(excluded);
        section.append(groupCard('Export diagnostics', checklist,
            settingRow('Destination', homeShortened(this.diagnosticPath || 'Checking…'), action('Change location', async () => {
                const destination = await this.fileDialogs.showSaveDialog({ title: 'Diagnostics destination', inputValue: this.diagnosticPath });
                if (destination) { this.diagnosticPath = destination.path.fsPath(); this.diagnosticPathCustomized = true; this.renderSection('help'); }
            }, { small: true })),
            settingRow('Create ZIP', 'Reveal the ZIP in Finder when finished. Open it to inspect its contents', action('Export', async () => {
                const left = document.querySelector<HTMLElement>('#theia-left-content-panel')?.getBoundingClientRect().width || 0;
                const right = document.querySelector<HTMLElement>('#theia-right-content-panel')?.getBoundingClientRect().width || 0;
                try { const location = await this.maintenance.exportDiagnostics(this.diagnosticPathCustomized ? this.diagnosticPath : undefined,
                    { width: window.innerWidth, height: window.innerHeight, leftPanelWidth: left, rightPanelWidth: right },
                    this.workspaceRoot, this.credentialsPath);
                    this.diagnosticPath = location; this.renderSection('help');
                    await this.maintenance.revealPath(location); this.notice.textContent = 'Diagnostics exported.'; }
                catch { this.notice.textContent = 'Could not export diagnostics.'; }
            }, { small: true }))),
        groupCard('Other',
            settingRow('Report a bug', 'Open a GitHub issue', action('Open', () => this.windows.openNewWindow(AKARI_VIDEO_NEW_ISSUE_URL, { external: true }), { small: true })),
            settingRow('Open logs folder', '~/Library/Logs/AKARI Video', action('Open', () => void this.maintenance.openPath('~/Library/Logs/AKARI Video'), { small: true })),
            settingRow('Reset panel layout', 'Restore default panel positions and right rail order', action('Reset', () => void this.commands.executeCommand('reset.layout'), { small: true }))));
    }

    protected renderAbout(section: HTMLElement): void {
        this.stopAboutUpdaterEvents();
        this.aboutUpdateRow = undefined;
        this.aboutUpdaterState = INITIAL_SHELL_UPDATER_UI_STATE;
        this.aboutLastEventKind = undefined;
        this.aboutCurrentVersion = undefined;
        this.aboutCheckedAt = undefined;
        this.aboutDownloadUrl = undefined;
        const generation = this.aboutUpdateGeneration;
        const eventSequence = this.aboutEventSequence;
        if (!section.hidden) {
            this.aboutUpdaterUnsubscribe = window.electronAkariUpdater?.onEvent(event => {
                if (this.isDisposed || section.hidden || generation !== this.aboutUpdateGeneration) { return; }
                this.aboutEventSequence += 1;
                this.applyAboutUpdaterEvent(event);
            });
        }
        section.append(groupCard('AKARI Video', settingsNote('Loading version and build information…')));
        void Promise.all([this.maintenance.appInfo(), window.electronAkariUpdater?.getLastEvent(), this.maintenance.getUpdateSettings().catch(() => undefined),
            window.electronAkariUpdater?.getCapabilities().catch(() => ({ updateUiEnabled: false })), this.resolveAboutUpdateDownloadUrl()]).then(([info, update, updateSettings, capabilities, downloadUrl]) => {
            if (this.isDisposed || !section.isConnected || generation !== this.aboutUpdateGeneration) { return; }
            this.aboutCurrentVersion = info.version;
            this.aboutCheckedAt ??= info.lastChecked;
            this.aboutDownloadUrl = downloadUrl ?? RELEASES_PAGE_URL;
            if (update && eventSequence === this.aboutEventSequence) { this.applyAboutUpdaterEvent(update, true); }
            section.replaceChildren(...this.sectionHeading('about'));
            const icon = element('img'); icon.src = info.icon || AKARI_APP_ICON; icon.alt = 'AKARI Video'; icon.width = 64; icon.height = 64;
            icon.onerror = () => { const logo = element('strong', 'AKARI'); logo.style.width = '64px'; icon.replaceWith(logo); };
            const hero = element('div'); hero.className = 'akari-set-about-hero';
            const identity = element('div'); identity.append(element('h3', 'AKARI Video'),
                element('p', `v${info.version} · ${info.buildDate} build · ${info.os}`));
            hero.append(icon, identity);
            const updateRow = capabilities && !capabilities.updateUiEnabled
                ? settingsNote('Updates cannot be checked in development builds')
                : this.createAboutUpdateRow();
            this.aboutUpdateRow = capabilities && !capabilities.updateUiEnabled ? undefined : updateRow;
            const main = groupCard(undefined, hero,
                updateRow,
                settingRow('Update channel', 'Prereleases offer early features but may be unstable', segmentedControl({ label: 'Update channel', options: [{ value: 'stable', label: 'Stable' }, { value: 'prerelease', label: 'Include prereleases' }],
                    value: updateSettings?.channel ?? this.preferences.get('akari.update.channel', 'prerelease'), onChange: value => {
                        this.savePreference('akari.update.channel', value);
                        void this.maintenance.setUpdateSettings({ channel: value });
                    } })),
                settingRow('Check automatically', 'Notify at the bottom right on startup', switchControl({ label: 'Check automatically',
                    checked: updateSettings?.autoCheck ?? this.preferences.get<boolean>('akari.update.autoCheck', true), onChange: checked => {
                        this.savePreference('akari.update.autoCheck', checked);
                        void this.maintenance.setUpdateSettings({ autoCheck: checked });
                    } })));
            section.append(main);
            if (info.recentChanges) {
                const release = element('div'); release.className = 'akari-set-about-release';
                release.append(element('b', `v${info.recentChanges.version}`), element('span', formatShortReleaseDate(info.recentChanges.date)));
                if (info.recentChanges.notesUrl) { release.append(action('View changes', () => this.windows.openNewWindow(info.recentChanges!.notesUrl!, { external: true }), { small: true })); }
                section.append(groupCard('Recent changes', release));
            }
            section.append(groupCard(undefined, settingRow('Links', 'akari.video · GitHub · Open-source licenses',
                ...[['Official website', 'https://akari.video'], ['GitHub', AKARI_VIDEO_REPO_URL], ['Licenses', AKARI_VIDEO_LICENSE_URL]].map(([label, url]) =>
                    action(label, () => this.windows.openNewWindow(url, { external: true }), { small: true })))));
        }).catch(() => { this.notice.textContent = 'Could not load app information.'; });
    }

    protected stopAboutUpdaterEvents(): void {
        this.aboutUpdateGeneration += 1;
        this.aboutUpdaterUnsubscribe?.();
        this.aboutUpdaterUnsubscribe = undefined;
    }

    protected applyAboutUpdaterEvent(event: ShellUpdaterEvent, replay = false): void {
        const openFallback = !replay && shouldOpenUpdaterBrowserFallback(this.aboutUpdaterState, event) && this.aboutDownloadUrl;
        this.aboutUpdaterState = applyShellUpdaterEvent(this.aboutUpdaterState, event);
        this.aboutLastEventKind = event.kind;
        if (!replay && (event.kind === 'update-not-available' || event.kind === 'update-available' || event.kind === 'update-downloaded')) {
            this.aboutCheckedAt = new Date().toISOString();
        }
        this.refreshAboutUpdateRow();
        if (openFallback) { this.windows.openNewWindow(openFallback, { external: true }); }
    }

    protected refreshAboutUpdateRow(): void {
        if (!this.aboutUpdateRow || this.isDisposed || this.sections.get('about')?.hidden) { return; }
        const next = this.createAboutUpdateRow();
        this.aboutUpdateRow.replaceWith(next);
        this.aboutUpdateRow = next;
    }

    protected createAboutUpdateRow(): HTMLElement {
        const view = resolveSettingsUpdateView({
            state: this.aboutUpdaterState,
            lastEventKind: this.aboutLastEventKind,
            currentVersion: this.aboutCurrentVersion ?? '',
            lastChecked: this.aboutCheckedAt ? new Date(this.aboutCheckedAt).toLocaleString('en-US') : 'Not checked yet',
            downloadUrl: this.aboutDownloadUrl
        });
        const button = action(view.button.label, () => {
            if (view.button.kind === 'restart') {
                void window.electronAkariUpdater?.restartAndInstall();
                return;
            }
            this.aboutUpdaterState = beginUserInitiatedUpdaterCheck(this.aboutUpdaterState);
            this.aboutLastEventKind = 'checking-for-update';
            this.refreshAboutUpdateRow();
            const api = window.electronAkariUpdater;
            if (!api) {
                this.aboutUpdaterState = applyImmediateUpdaterFallback(this.aboutUpdaterState, 'In-app updates are unavailable');
                this.refreshAboutUpdateRow();
                if (this.aboutDownloadUrl) { this.windows.openNewWindow(this.aboutDownloadUrl, { external: true }); }
                return;
            }
            const generation = this.aboutUpdateGeneration;
            void api.checkForUpdatesNow({ userInitiated: true }).catch(() => {
                if (this.isDisposed || this.sections.get('about')?.hidden || generation !== this.aboutUpdateGeneration) { return; }
                this.applyAboutUpdaterEvent({ kind: 'error', reason: 'Could not start the update' });
            });
        }, { small: true, variant: view.button.primary ? 'primary' : 'ghost', icon: view.button.kind === 'check' ? 'refresh' : undefined });
        button.disabled = view.button.disabled;
        const controls = [button];
        if (view.browserFallback && this.aboutDownloadUrl) {
            controls.push(action('Get in browser', () => this.windows.openNewWindow(this.aboutDownloadUrl!, { external: true }), { small: true }));
        }
        return settingRow(view.label, view.detail, ...controls);
    }

    protected async resolveAboutUpdateDownloadUrl(): Promise<string | undefined> {
        try {
            const home = await this.env.getValue('AKARI_HOME');
            const base = home?.value ? URI.fromFilePath(home.value) : new URI(await this.env.getHomeDirUri()).resolve('.akari');
            const cache = parseUpdateCache((await this.files.readFile(base.resolve('update-check.json'))).value.toString());
            const platform = OS.type() === OS.Type.OSX ? 'mac' : OS.type() === OS.Type.Windows ? 'win' : undefined;
            return resolveUpdateDownloadUrl(cache?.feed, platform);
        } catch { return undefined; }
    }

    async refreshLibraryStatus(): Promise<void> {
        try {
            this.libraryStatus = await this.toolsService.libraryStatus();
            if (!this.isDisposed) { this.renderSection('storage'); }
        } catch { this.notice.textContent = 'Could not check footage usage.'; }
    }

    showLibraryMoveProgress(progress: { bytes: number; totalBytes: number } | undefined): void {
        this.notice.textContent = progress?.totalBytes
            ? `Moving footage… ${formatLibraryBytes(progress.bytes)} / ${formatLibraryBytes(progress.totalBytes)}`
            : 'Moving footage… Wait for this to finish before importing or downloading.';
    }
    clearLibraryMoveProgress(): void { this.notice.textContent = ''; }

    protected async acceptSyncedLibrary(): Promise<void> {
        this.showLibraryMoveProgress(undefined);
        try { await this.toolsService.moveLibrary(); await this.refreshLibraryStatus(); this.notice.textContent = 'Footage moved.'; }
        catch { this.notice.textContent = 'Could not move footage.'; }
    }

    protected async declineSyncedLibrary(): Promise<void> {
        try { await this.toolsService.declineLibraryMove(); await this.refreshLibraryStatus(); }
        catch { this.notice.textContent = 'Could not save the selection.'; }
    }

    protected async clearLabLibrary(): Promise<void> {
        const targets = this.libraryStatus?.usage.cleanup ?? [];
        if (!targets.length) { return; }
        const list = element('div');
        list.append(element('p', `Footage from Lab: ${targets.length} items, total ${formatLibraryBytes(this.libraryStatus!.usage.cleanupBytes)} will be moved to the trash.`));
        const names = element('ul');
        Object.assign(names.style, { maxHeight: '260px', overflow: 'auto', paddingLeft: '22px' });
        for (const item of targets) { names.append(element('li', `${item.title}（${formatLibraryBytes(item.bytes)}）`)); }
        list.append(names);
        const confirmed = await new ConfirmDialog({
            title: 'Clean up downloadable footage', msg: list, ok: 'Move to trash', cancel: 'Cancel'
        }).open();
        if (!confirmed) { return; }
        try {
            const directories = await this.toolsService.labCleanupTargets(targets.map(item => item.libraryDir));
            let count = 0;
            for (const directory of directories) {
                if (await this.toolsService.isLibraryMoving()) { throw new Error('moving'); }
                await this.files.delete(URI.fromFilePath(directory), { recursive: true, useTrash: true });
                count++;
            }
            this.notice.textContent = `${count} items moved to trash.`;
            await this.refreshLibraryStatus();
        } catch { this.notice.textContent = 'Could not clean up footage.'; }
    }

    /** はじめかたの進み具合。道具・接続の状態が読めたものだけ出す（読めないうちは枠ごと出さない）。 */
    protected startProgressSteps(): HTMLElement | undefined {
        const tools = this.toolsView?.checkedTools?.filter(tool => !tool.unsupported);
        const steps: { name: string; detail: string; done: boolean }[] = [];
        if (tools && tools.length > 0) {
            const ready = tools.filter(tool => tool.available).length;
            steps.push({ name: 'Tools', detail: `${ready} / ${tools.length} is available`, done: ready === tools.length });
        }
        if (this.connectionSummary && this.connectionSummary.total > 0) {
            const { configured, total } = this.connectionSummary;
            steps.push({ name: 'Connection', detail: `API key ${configured} / ${total}`, done: configured > 0 });
        }
        if (steps.length === 0) { return undefined; }
        const wrap = element('div');
        wrap.className = 'akari-set-steps';
        wrap.setAttribute('data-akari-start-steps', 'true');
        for (const step of steps) {
            const node = element('div');
            node.className = 'akari-set-step';
            node.setAttribute('data-done', String(step.done));
            const name = element('div');
            name.className = 'akari-set-step-name';
            name.append(settingsIcon(step.done ? 'check' : 'circle'), element('span', step.name));
            const detail = element('span', step.detail);
            detail.className = 'akari-set-step-desc';
            node.append(name, detail);
            wrap.append(node);
        }
        return wrap;
    }

    /** オン / オフの設定 1 行（スイッチ）。 */
    protected preferenceSwitch(key: string, label: string, fallback: boolean, detail: string): HTMLElement {
        return settingRow(label, detail, switchControl({
            label, checked: this.preferences.get<boolean>(key, fallback),
            onChange: checked => this.savePreference(key, checked)
        }));
    }

    protected renderTranscribe(): void {
        const mode = this.preferences.get(AKARI_TRANSCRIBE_MODE) === 'advanced' ? 'advanced' : 'simple';
        const backend = this.preferences.get<TranscribeBackend>(AKARI_TRANSCRIBE_BACKEND, 'auto');
        const compareSet = this.preferences.get<string[]>(AKARI_TRANSCRIBE_COMPARE_SET, []);
        if (compareSet.length > 0) { this.compareDraft = compareSet; this.compareEnabled = true; }
        this.transcribe.replaceChildren(...this.sectionHeading('transcribe'));
        this.transcribe.append(groupCard('Mode', choiceCards({ label: 'Transcription mode', options: TRANSCRIBE_MODE_CHOICES, value: mode, columns: 2,
            onChange: value => this.savePreference(AKARI_TRANSCRIBE_MODE, value) })));
        const engines = TRANSCRIBE_BACKENDS.map(id => ({ value: id, label: ENGINE_LABELS[id], description: ENGINE_DESCRIPTIONS[id] }));
        let fixedEngine: typeof TRANSCRIBE_BACKENDS[number] = backend === 'auto' ? 'speech-analyzer' : backend;
        const engine: DropdownHandle = dropdown({ label: 'Transcription engine', options: engines, value: fixedEngine, disabled: backend === 'auto',
            onChange: value => { fixedEngine = value; this.savePreference(AKARI_TRANSCRIBE_BACKEND, value); } });
        const policy = segmentedControl({ label: 'Engine to use', value: backend === 'auto' ? 'auto' : 'fixed',
            options: [{ value: 'auto', label: 'Automatic' }, { value: 'fixed', label: 'Selected engine' }],
            onChange: value => {
                engine.akariSetDisabled?.(value === 'auto');
                this.savePreference(AKARI_TRANSCRIBE_BACKEND, value === 'auto' ? 'auto' : fixedEngine);
            } });
        this.transcribe.append(groupCard('Engine',
            settingRow('Engine to use', 'Automatic uses SpeechAnalyzer, then Whisper. Cloud engines are used only when explicitly selected', policy),
            settingRow('Selected engine', 'Used only with Selected engine', engine)));
        if (mode === 'simple') {
            this.transcribe.append(settingsNote('Engine comparison and automatic cut candidates: available in Advanced mode'));
            return;
        }
        const chips = checkChips({ label: 'Engines to compare', checked: this.compareDraft,
            options: TRANSCRIBE_BACKENDS.map(id => ({ value: id, label: ENGINE_SHORT_LABELS[id] })),
            onToggle: (id, checked) => {
                this.compareDraft = TRANSCRIBE_BACKENDS.filter(candidate => candidate === id ? checked : this.compareDraft.includes(candidate));
                this.savePreference(AKARI_TRANSCRIBE_COMPARE_SET, [...this.compareDraft]);
            } });
        chips.hidden = !this.compareEnabled;
        const compare = switchControl({ label: 'Use this set for comparisons', checked: this.compareEnabled, onChange: checked => {
            this.compareEnabled = checked;
            chips.hidden = !checked;
            this.savePreference(AKARI_TRANSCRIBE_COMPARE_SET, this.compareEnabled ? [...this.compareDraft] : []);
        } });
        const cuts = switchControl({ label: 'Create cut candidates automatically', checked: this.preferences.get<boolean>(AKARI_TRANSCRIBE_AUTO_CUTS, true),
            onChange: checked => this.savePreference(AKARI_TRANSCRIBE_AUTO_CUTS, checked) });
        this.transcribe.append(groupCard('Advanced',
            settingRow('Use this set for comparisons', 'Comparison is optional. Select the engines to compare', compare), chips,
            settingRow('Create cut candidates automatically', 'Fillers, retakes, and silence. Candidates are not added to the timeline', cuts)));
    }

    protected renderNarration(): void {
        const section = this.sections.get('narration')!;
        section.replaceChildren(...this.sectionHeading('narration'));
        const voicevox = this.narrationState?.engines.find(row => row.id === 'voicevox');
        const gemini = this.narrationState?.engines.find(row => row.id === 'gemini-tts');
        const irodoriState = this.narrationState?.engines.find(row => row.id === 'irodori');
        const voicevoxDetail = voicevox?.availability.detail;
        const voicevoxRunning = voicevoxDetail?.running === true;
        const voicevoxFound = voicevoxDetail?.app_found === true;
        const voicevoxPill = this.narrationLoading ? 'Checking…' : voicevoxRunning
            ? `Running · ${voicevoxDetail?.version ?? 'Could not check version'}` : voicevoxFound ? 'Stopped' : 'Not installed';
        const engineCard = (id: string, label: string, state: string, description: string): { card: HTMLElement; actions: HTMLElement } => {
            const card = element('div');
            card.setAttribute('data-akari-narration-engine', id);
            Object.assign(card.style, { padding: '14px 16px', borderBottom: '1px solid var(--theia-border-color, #404040)' });
            const heading = element('div');
            Object.assign(heading.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' });
            heading.append(element('strong', label), statusPill(state, state.startsWith('Running') || state === 'fal key configured' || state === 'Trial · Connected' ? 'ok' : 'neutral'));
            const detail = element('div', description);
            detail.style.opacity = '0.8';
            const actions = element('div');
            Object.assign(actions.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '9px' });
            card.append(heading, detail, actions);
            return { card, actions };
        };
        const vv = engineCard('voicevox', 'VOICEVOX', voicevoxPill,
            'This Mac · Free · Voice attribution required (VOICEVOX: character name)');
        if (!this.narrationLoading && !voicevoxFound && !voicevoxRunning) {
            if (this.narrationState?.voicevoxCaskAvailable) {
                const install = action(this.narrationBusy === 'install' ? 'Installing…' : 'Add', () => void this.installVoicevox(), { small: true });
                install.disabled = Boolean(this.narrationBusy);
                install.setAttribute('data-akari-narration-action', 'install');
                vv.actions.append(install);
            }
            const official = action('Open official website', () => this.windows.openNewWindow('https://voicevox.hiroshiba.jp/', { external: true }), { small: true });
            official.setAttribute('data-akari-narration-action', 'official');
            vv.actions.append(official);
        } else if (!this.narrationLoading && voicevoxRunning) {
            const preview = action(this.narrationBusy === 'preview' ? 'Creating…' : 'Preview voice', () => void this.previewVoicevox(), { small: true });
            preview.disabled = Boolean(this.narrationBusy);
            preview.setAttribute('data-akari-narration-action', 'preview');
            const stop = action('Stop', () => void this.operateVoicevox('stop'), { small: true });
            stop.disabled = Boolean(this.narrationBusy) || !voicevoxDetail?.managed;
            stop.title = voicevoxDetail?.managed ? '' : 'Quit from the VOICEVOX app';
            stop.setAttribute('data-akari-narration-action', 'stop');
            vv.actions.append(preview, stop);
        } else if (!this.narrationLoading && voicevoxFound) {
            const start = action(this.narrationBusy === 'start' ? 'Starting…' : 'Start', () => void this.operateVoicevox('start'), { small: true });
            start.disabled = Boolean(this.narrationBusy);
            start.setAttribute('data-akari-narration-action', 'start');
            vv.actions.append(start);
        }
        if (this.voicevoxPreviewSrc && voicevoxRunning) {
            const audio = element('audio');
            audio.controls = true;
            audio.src = this.voicevoxPreviewSrc;
            audio.setAttribute('data-akari-narration-preview', 'true');
            vv.card.append(audio);
        }
        if (this.narrationBusy === 'install') {
            const progress = element('div');
            progress.className = 'akari-set-progress';
            progress.append(element('i'));
            vv.card.append(progress, settingsNote('Installing…'));
        }
        const geminiCard = engineCard('gemini-tts', 'Gemini 2.5 Flash TTS', this.narrationLoading ? 'Checking…' :
            gemini?.availability.state === 'available' ? 'fal key configured' : 'No fal key configured',
            'Cloud · Via fal.ai · Pay as you go (provisional $0.05 / 1,000 characters)');
        const connectionsButton = action('Open Connections and API keys', () => this.showSection('connections'), { small: true });
        connectionsButton.setAttribute('data-akari-narration-action', 'connections');
        geminiCard.actions.append(connectionsButton);
        const irodori = engineCard('irodori', 'Irodori (my PC)', this.narrationLoading ? 'Checking…' :
            irodoriState?.availability.state === 'available' ? 'Trial · Connected' : 'Cannot connect',
            'Connect to a separately running Irodori-TTS server (MIT). Supports Mac MPS (about 15 seconds per sentence after the first run on M1).');
        const experimentalPill = statusPill('Trial', 'neutral');
        experimentalPill.setAttribute('data-akari-experimental', 'true');
        irodori.card.querySelector('strong')?.after(experimentalPill);
        const irodoriUrl = element('input'); irodoriUrl.type = 'text';
        irodoriUrl.value = this.preferences.get(AKARI_NARRATION_IRODORI_URL) ?? 'http://127.0.0.1:8088';
        irodoriUrl.setAttribute('aria-label', 'Irodori server URL'); irodoriUrl.setAttribute('data-akari-irodori-url', 'true');
        const invalidUrlNote = settingsNote('Enter an HTTP or HTTPS server URL.');
        invalidUrlNote.hidden = true; invalidUrlNote.setAttribute('data-akari-irodori-url-error', 'true');
        const saveUrl = action('Save', () => {
            const value = irodoriUrl.value.trim();
            if (!isValidIrodoriUrl(value)) { invalidUrlNote.hidden = false; return; }
            invalidUrlNote.hidden = true;
            this.savePreference(AKARI_NARRATION_IRODORI_URL, value);
            void this.preferenceWrites.then(() => this.refreshNarrationState());
        }, { small: true });
        saveUrl.setAttribute('data-akari-narration-action', 'save-irodori-url');
        irodori.card.append(settingRow('Server URL', 'Irodori server on this PC or another PC', irodoriUrl, saveUrl));
        irodori.card.append(invalidUrlNote);
        const checkIrodori = action('Check connection', () => void this.refreshNarrationState(), { small: true });
        checkIrodori.setAttribute('data-akari-narration-action', 'check-irodori');
        irodori.actions.append(checkIrodori);
        const setup = element('details'); const summary = element('summary', 'Server setup'); setup.append(summary);
        const commandLine = (command: string): HTMLElement => {
            const pre = element('pre'); pre.append(element('code', command)); return pre;
        };
        const setupSteps = (platform: string, backends: readonly { label: string; command: string }[]): void => {
            setup.append(element('h4', platform), commandLine('git clone https://github.com/Aratako/Irodori-TTS-Server.git'),
                commandLine('cd Irodori-TTS-Server'));
            for (const backend of backends) setup.append(element('p', backend.label), commandLine(backend.command));
            setup.append(commandLine('cp .env.example .env'),
                commandLine('uv run --no-sync python -m irodori_openai_tts --host 0.0.0.0 --port 8088'));
        };
        setupSteps('Windows（PowerShell）', [
            { label: 'NVIDIA GPU', command: 'uv sync --extra cu128' },
            { label: 'CPU only', command: 'uv sync --extra cpu' }
        ]);
        setupSteps('Linux', [
            { label: 'NVIDIA GPU', command: 'uv sync --extra cu128' },
            { label: 'AMD GPU（ROCm）', command: 'uv sync --extra rocm' },
            { label: 'CPU only', command: 'uv sync --extra cpu' }
        ]);
        setup.append(element('h4', 'macOS（Apple Silicon）'),
            commandLine('git clone https://github.com/Aratako/Irodori-TTS-Server.git'),
            commandLine('cd Irodori-TTS-Server'), commandLine('uv sync --extra cpu'),
            commandLine('cp .env.example .env'),
            commandLine('IRODORI_MODEL_DEVICE=mps IRODORI_CODEC_DEVICE=mps uv run --no-sync python -m irodori_openai_tts --host 0.0.0.0 --port 8088'),
            element('p', 'Initial model download: about 3.3 GB. Subsequent runs take about 15 seconds per sentence (measured on M1, 2026-09-24).'));
        setup.append(element('p', 'To use another PC, enter http://<server PC IP>:8088 as the AKARI server URL and allow port 8088 through its firewall.'));
        irodori.card.append(setup);
        const officialIrodori = action('Open official repository', () => this.windows.openNewWindow('https://github.com/Aratako/Irodori-TTS-Server', { external: true }), { small: true });
        officialIrodori.setAttribute('data-akari-narration-action', 'irodori-official'); irodori.actions.append(officialIrodori);
        section.append(groupCard('Engine', vv.card, geminiCard.card, irodori.card));
        const voicesSection = groupCard('My voice');
        const createVoice = action('Create my voice…', () => void this.commands.executeCommand('akari.voice.create').then(() => this.refreshNarrationState()), { small: true });
        createVoice.setAttribute('data-akari-voice-action', 'create');
        voicesSection.append(settingRow('My voice', 'Save the recording as the source', createVoice));
        if (!this.voiceProfilesLoaded) voicesSection.append(settingsNote(this.narrationError ? 'Could not load voices.' : 'Loading…'));
        const profiles = this.voiceProfiles.filter(profile => !profile.legacy || !this.voiceProfiles.some(other => other.id === profile.id && !other.legacy));
        for (const profile of profiles) {
            const buttons = element('div'); Object.assign(buttons.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
            const choices = voiceSettingsActions(profile, irodoriState?.availability.state === 'available',
                falKeyAvailable(this.narrationState?.engines.find(engine => engine.id === 'fal-qwen3')),
                this.narrationState?.engines.some(engine => engine.id === 'gemini-3.8-flash-tts' && engine.availability.state !== 'unconfigured'));
            const addButton = (label: string, id: string, callback: () => void): void => {
                const button = action(label, callback, { small: true }); button.setAttribute('data-akari-voice-action', id); buttons.append(button);
            };
            if (choices.migrate) addButton('Move to new location', 'migrate', () => void this.voiceAction(async () => {
                if (!await this.confirmVoiceAction('Move to new location', 'Copy to the new location. Keep the old location', 'Move')) return;
                await this.narrationService.voiceMigrateLegacy(profile.id);
            }));
            if (choices.rename) {
                const name = element('input'); name.value = profile.label; name.setAttribute('aria-label', `${profile.label} name`); buttons.append(name);
                addButton('Rename', 'rename', () => void this.voiceAction(() => this.narrationService.voiceRename(profile.id, name.value)));
            }
            const copy = (engine: 'irodori' | 'fal-qwen3'): void => void this.voiceAction(async () => {
                let approved = false;
                if (engine === 'fal-qwen3') {
                    approved = await new ConfirmDialog({ title: 'Cost approval', msg: 'Send the recording to the cloud (fal) to create a copy. Estimated cost: about $0.01. Continue?',
                        ok: 'Approve cost', cancel: 'Cancel' }).open();
                    if (!approved) return;
                }
                await this.narrationService.voiceCopy({ profile: profile.id, engine, approved,
                    irodoriUrl: engine === 'irodori' ? this.preferences.get(AKARI_NARRATION_IRODORI_URL) : undefined });
            });
            if (choices.addIrodori) addButton('Add copy… Irodori (my PC)', 'copy-irodori', () => copy('irodori'));
            if (choices.addFal) addButton('Add copy… Cloud (fal)', 'copy-fal', () => copy('fal-qwen3'));
            const copyGemini = (): void => void this.voiceAction(async () => {
                const consentAudioPath = await this.geminiConsentDialog();
                if (!consentAudioPath) return;
                try {
                    const approved = await new ConfirmDialog({ title: 'Cost approval',
                        msg: 'Send the source and your recorded consent to Google to create a voice. Voice creation cost cannot be estimated. Continue?',
                        ok: 'Approve cost', cancel: 'Cancel' }).open();
                    if (!approved) return;
                    await this.narrationService.voiceCopy({ profile: profile.id, engine: 'gemini-3.8-flash-tts', consentAudioPath, approved: true });
                } finally { await this.narrationService.voiceDiscardGeminiConsent(consentAudioPath); }
            });
            if (choices.addGemini) addButton('Add copy… Google Gemini 3.8', 'copy-gemini', copyGemini);
            if (choices.remakeIrodori) addButton('Recreate · Irodori (my PC)', 'remake-irodori', () => copy('irodori'));
            if (choices.remakeFal) addButton('Recreate · Cloud (fal)', 'remake-fal', () => copy('fal-qwen3'));
            if (choices.remakeGemini) addButton('Recreate · Google Gemini 3.8', 'remake-gemini', copyGemini);
            if (choices.remove) addButton('Delete', 'delete', () => void this.voiceAction(async () => {
                if (!await this.confirmVoiceAction('Delete my voice', 'Delete the local recording and Irodori registration. Cloud voices remain on fal / Google', 'Delete')) return;
                await this.narrationService.voiceDelete(profile.id, this.preferences.get(AKARI_NARRATION_IRODORI_URL));
            }));
            const row = settingRow(profile.label, undefined, buttons);
            row.setAttribute('data-akari-voice-profile', profile.id);
            Object.assign(row.style, { gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' });
            const control = row.querySelector<HTMLElement>('.akari-set-row-control');
            if (control) control.style.justifyContent = 'flex-start';
            const detail = element('div', `${voiceAvatarLabel(profile.avatar, this.voiceAvatars)} · ${profile.created_at?.slice(0, 10) ?? 'Unknown date'} · ${profile.duration_s?.toFixed(1) ?? '—'} seconds`);
            detail.className = 'akari-set-row-desc';
            const pills = element('div'); Object.assign(pills.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' });
            for (const engine of profile.engines) {
                pills.append(statusPill(engine === 'irodori' ? 'Irodori (my PC)' : 'Cloud (fal)', 'neutral'));
                if (profile.copies?.[engine]?.stale) pills.append(statusPill('Outdated', 'warn'));
            }
            if (profile.legacy) pills.append(statusPill('Old location', 'warn'));
            row.querySelector('.akari-set-row-text')?.append(detail, pills);
            voicesSection.append(row);
        }
        section.append(voicesSection);
        if (this.narrationError) section.append(settingsNote(this.narrationError));
        const engine = this.preferences.get(AKARI_NARRATION_ENGINE);
        const voiceValue = this.preferences.get(AKARI_NARRATION_VOICE);
        const voices = typeof voiceValue === 'object' && voiceValue !== null && !Array.isArray(voiceValue)
            ? voiceValue as Record<string, unknown> : {};
        const geminiVoice = typeof voices['gemini-tts'] === 'string' && GEMINI_NARRATION_VOICES.some(id => id === voices['gemini-tts'])
            ? voices['gemini-tts'] : 'Leda';
        const voicevoxSpeaker = typeof voices.voicevox === 'string' && voices.voicevox ? voices.voicevox : 'Not selected';
        const defaultEngineSelect = element('select');
        defaultEngineSelect.setAttribute('aria-label', 'Default engine');
        defaultEngineSelect.dataset.akariNarrationDefaultEngine = 'true';
        const chevron = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="m2 4 4 4 4-4" fill="none" stroke="#a0a0a0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
        Object.assign(defaultEngineSelect.style, { appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box',
            minWidth: '220px', maxWidth: '320px', minHeight: '34px', padding: '7px 32px 7px 12px', borderRadius: '8px',
            backgroundColor: 'var(--akari-bg)', border: '1px solid var(--akari-line)', color: 'var(--akari-ink)',
            fontSize: '13px', cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,${chevron}")`,
            backgroundPosition: 'right 12px center', backgroundRepeat: 'no-repeat', backgroundSize: '12px 12px' });
        defaultEngineSelect.addEventListener('focus', () => { defaultEngineSelect.style.borderColor = 'var(--akari-accent-light)'; });
        defaultEngineSelect.addEventListener('blur', () => { defaultEngineSelect.style.borderColor = 'var(--akari-line)'; });
        const addGroup = (label: string, rows: Array<[string, string]>): void => {
            const group = element('optgroup'); group.label = label;
            for (const [id, title] of rows) {
                const state = this.narrationState?.engines.find(row => row.id === id);
                const option = element('option', `${title}${state?.availability.state === 'unconfigured' && label === 'Cloud' ? '(No key)' : ''}`);
                option.value = id; group.append(option);
            }
            defaultEngineSelect.append(group);
        };
        addGroup('This Mac', [['voicevox', 'VOICEVOX'], ['irodori', 'Irodori (trial)']]);
        addGroup('Cloud', [['gemini-3.8-flash-tts', 'Gemini 3.8 Flash TTS'],
            ['gemini-3.1-flash-tts', 'Gemini 3.1 Flash TTS'], ['gemini-tts', 'Gemini 2.5 Flash TTS'],
            ['elevenlabs-v3', 'ElevenLabs v3'], ['fish-s2.1-pro', 'Fish Audio S2.1-Pro'],
            ['minimax-2.6-hd', 'MiniMax 2.6 HD'], ['chatterbox', 'Chatterbox multilingual']]);
        addGroup('My voice', profiles.filter(profile => typeof profile.consent === 'string' ? profile.consent.trim() : profile.consent?.self_voice)
            .map(profile => [`voice:${profile.id}`, `My voice (${profile.label}）`]));
        if (!this.voiceProfilesLoaded && typeof engine === 'string' && engine.startsWith('voice:')
            && !profiles.some(profile => `voice:${profile.id}` === engine)) {
            const option = element('option', 'My voice (loading…)'); option.value = engine;
            defaultEngineSelect.lastElementChild?.append(option);
        }
        defaultEngineSelect.value = settingsVoiceEngineValue(engine, profiles, this.voiceProfilesLoaded);
        defaultEngineSelect.addEventListener('change', () => this.savePreference(AKARI_NARRATION_ENGINE, defaultEngineSelect.value));
        section.append(groupCard('Defaults',
            settingRow('Default engine', 'Engine selected when opening the narration popup',
                defaultEngineSelect),
            settingRow('Default Gemini voice', 'Voice for Gemini 2.5 Flash TTS',
                dropdown({ label: 'Default Gemini voice', options: GEMINI_NARRATION_VOICES.map(id => ({ value: id, label: id })),
                    value: geminiVoice, onChange: value => {
                        const current = this.preferences.get(AKARI_NARRATION_VOICE);
                        const saved = typeof current === 'object' && current !== null && !Array.isArray(current)
                            ? current as Record<string, unknown> : {};
                        this.savePreference(AKARI_NARRATION_VOICE, { ...saved, 'gemini-tts': value });
                    } })),
            settingRow('Default VOICEVOX voice', 'Saved when you choose a voice in the narration popup',
                element('span', voicevoxSpeaker))));
        const note = settingsNote('To use Gemini, register a fal key in Connections and API keys.');
        note.append(' ', inlineLink('Open Connections and API keys', () => this.showSection('connections')));
        section.append(note);
    }

    protected async refreshNarrationState(): Promise<void> {
        const generation = ++this.narrationRefreshGeneration;
        this.narrationLoading = true;
        this.renderNarration();
        try { const [state, profiles, avatars] = await Promise.all([
            this.narrationService.narrationEngines(this.preferences.get<string>(AKARI_NARRATION_IRODORI_URL, 'http://127.0.0.1:8088')),
            this.narrationService.voiceProfiles(), this.narrationService.voiceAvatars()]);
            if (generation === this.narrationRefreshGeneration) {
                this.narrationState = state; this.voiceProfiles = profiles.profiles; this.voiceProfilesLoaded = true;
                this.voiceAvatars = avatars.avatars; this.narrationError = '';
            } }
        catch (error) { if (generation === this.narrationRefreshGeneration)
            this.narrationError = error instanceof Error ? error.message : 'Could not retrieve status.'; }
        finally { if (generation === this.narrationRefreshGeneration) {
            this.narrationLoading = false; if (!this.isDisposed) this.renderNarration();
        } }
    }
    protected async voiceAction(callback: () => Promise<void>): Promise<void> {
        try { await callback(); await this.refreshNarrationState(); }
        catch (error) { this.narrationError = String(error); this.renderNarration(); }
    }
    protected geminiConsentDialog(): Promise<string | undefined> {
        return new Promise(resolve => {
            const overlay = element('div'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Spoken consent for Google');
            overlay.setAttribute('data-akari-gemini-consent', 'true');
            Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '1000', background: '#0009',
                display: 'flex', alignItems: 'center', justifyContent: 'center' });
            const panel = element('div'); Object.assign(panel.style, { background: '#242832', border: '1px solid #777',
                borderRadius: '10px', padding: '20px', width: 'min(560px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', gap: '12px' });
            const phrase = createGeminiConsentPrompt();
            const note = element('p', 'Read and record in your own voice. Verification runs on this PC.');
            const input = element('input') as HTMLInputElement; input.type = 'file'; input.accept = '.wav,.m4a,.mp3,.webm'; input.setAttribute('aria-label', 'Consent recording file');
            let blob: Blob | undefined; let recorder: MediaRecorder | undefined; let stream: MediaStream | undefined;
            let checkedPath: string | undefined; let consentCheck: GeminiConsentCheck | undefined;
            const resetCheck = (): void => {
                if (checkedPath) void this.narrationService.voiceDiscardGeminiConsent(checkedPath);
                checkedPath = undefined; consentCheck = undefined;
            };
            input.onchange = () => { blob = input.files?.[0]; resetCheck(); note.textContent = blob ? 'Recording selected. Please verify it.' : 'Choose a recording.'; };
            const record = action('Record', () => void (async () => {
                if (recorder?.state === 'recording') { recorder.stop(); record.textContent = 'Record'; return; }
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const chunks: Blob[] = []; recorder = new MediaRecorder(stream);
                    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
                    recorder.onstop = () => { blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }); resetCheck();
                        stream?.getTracks().forEach(track => track.stop()); note.textContent = 'Recorded. Please verify it.'; };
                    recorder.start(); record.textContent = 'Stop';
                } catch { note.textContent = 'Microphone unavailable. Choose a recording file.'; }
            })(), { small: true });
            const finish = (path?: string): void => { recorder?.state === 'recording' && recorder.stop(); stream?.getTracks().forEach(track => track.stop());
                overlay.remove(); resolve(path); };
            const cancel = action('Cancel', () => { resetCheck(); finish(); }, { small: true });
            const next = action('Verify on this PC', () => void (async () => {
                if (checkedPath && geminiConsentCanNext(true, consentCheck)) { finish(checkedPath); return; }
                if (!blob) { note.textContent = 'A consent recording is required.'; return; }
                next.disabled = true;
                try {
                    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    const result = await this.narrationService.voiceCheckGeminiConsent(btoa(binary));
                    consentCheck = { pass: true, checks: { script: { ok: true, score: result.score } } };
                    if (!geminiConsentCanNext(true, consentCheck)) throw new Error(geminiConsentStatus(consentCheck));
                    checkedPath = result.path; note.textContent = geminiConsentStatus(consentCheck);
                    next.textContent = 'Next';
                } catch (error) { note.textContent = String(error); } finally { next.disabled = false; }
            })(), { small: true });
            next.setAttribute('data-gemini-consent-next', 'true');
            const buttons = element('div'); buttons.append(cancel, next);
            panel.append(element('strong', 'Spoken consent for Google'), phrase, record, input, note, buttons);
            overlay.append(panel); this.node.append(overlay);
        });
    }
    protected confirmVoiceAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
        return new Promise(resolve => {
            const overlay = element('div'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', title);
            overlay.setAttribute('data-akari-voice-confirmation', 'true');
            Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '1000', background: '#0009',
                display: 'flex', alignItems: 'center', justifyContent: 'center' });
            const panel = element('div'); Object.assign(panel.style, { background: '#242832', border: '1px solid #777',
                borderRadius: '10px', padding: '20px', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '12px' });
            panel.append(element('strong', title), element('p', message));
            const buttons = element('div'); Object.assign(buttons.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
            const finish = (accepted: boolean): void => { overlay.remove(); resolve(accepted); };
            const cancel = action('Cancel', () => finish(false), { small: true });
            const accept = action(confirmLabel, () => finish(true), { small: true });
            accept.setAttribute('data-akari-voice-confirm', 'true');
            buttons.append(cancel, accept); panel.append(buttons); overlay.append(panel); this.node.append(overlay);
            accept.focus();
        });
    }

    protected async operateVoicevox(operation: 'start' | 'stop'): Promise<void> {
        this.narrationBusy = operation;
        this.renderNarration();
        let actionError = '';
        try {
            if (operation === 'start') await this.narrationService.startNarrationEngine('voicevox');
            else { await this.narrationService.stopNarrationEngine('voicevox'); this.voicevoxPreviewSrc = ''; }
        } catch (error) { actionError = error instanceof Error ? error.message : 'Operation failed.'; }
        finally {
            this.narrationBusy = '';
            await this.refreshNarrationState();
            if (actionError && !this.isDisposed) { this.narrationError = actionError; this.renderNarration(); }
        }
    }

    protected async previewVoicevox(): Promise<void> {
        this.narrationBusy = 'preview'; this.renderNarration();
        let actionError = '';
        try { this.voicevoxPreviewSrc = await this.narrationService.previewVoicevox(); }
        catch (error) { actionError = error instanceof Error ? error.message : 'Could not create voice preview.'; }
        finally {
            this.narrationBusy = '';
            await this.refreshNarrationState();
            if (actionError && !this.isDisposed) { this.narrationError = actionError; this.renderNarration(); }
            const audio = this.sections.get('narration')?.querySelector<HTMLAudioElement>('[data-akari-narration-preview]');
            if (audio) void audio.play().catch(() => { /* ユーザー操作が必要なら controls を使う */ });
        }
    }

    protected async installVoicevox(): Promise<void> {
        this.narrationBusy = 'install'; this.renderNarration();
        let actionError = '';
        try {
            const result = await this.toolsService.installTool('voicevox');
            actionError = result.outcome === 'failed' ? result.message : '';
        } catch (error) { actionError = error instanceof Error ? error.message : 'Could not install.'; }
        finally {
            this.narrationBusy = '';
            await this.refreshNarrationState();
            if (actionError && !this.isDisposed) { this.narrationError = actionError; this.renderNarration(); }
        }
    }

    protected savePreference(key: string, value: unknown): void {
        this.localPreferenceWrites.add(key);
        this.preferenceWrites = this.preferenceWrites.then(() => this.preferences.set(key, value, PreferenceScope.User)).then(() => {
            setTimeout(() => this.localPreferenceWrites.delete(key), 500);
        }).catch(() => {
            this.localPreferenceWrites.delete(key);
            this.notice.textContent = 'Could not save settings.';
            if (!this.isDisposed) {
                const section = sectionForPreferenceKey(key);
                if (section) { this.renderSection(section); }
            }
        });
    }

    protected async loadConnections(): Promise<void> {
        try {
            const list = await this.service.listConnections();
            if (this.isDisposed) { return; }
            this.renderSubscriptions();
            this.renderProviders(list.providers);
            await this.renderImageAi();
            this.renderStorage(list.credentials);
            this.credentialsPath = list.credentials.path;
            this.renderSection('privacy');
        } catch {
            this.providerList.replaceChildren(settingsNote('Could not load connections.'), action('Reload', () => void this.loadConnections(), { small: true }));
        }
    }

    protected async renderImageAi(): Promise<void> {
        const state = await this.service.imageAiSettings();
        if (this.isDisposed) return;
        const status = settingsNote(state.configured
            ? `fal · Key configured${state.maskedTail ? `(Ending in ${state.maskedTail}）` : ''}`
            : 'fal · Configure a key to use');
        status.setAttribute('data-akari-image-ai-status', state.configured ? 'configured' : 'unconfigured');
        const input = element('input'); input.type = 'password'; input.autocomplete = 'off';
        input.placeholder = 'fal key'; input.setAttribute('aria-label', 'Image key');
        const result = settingsNote(''); result.setAttribute('role', 'status');
        const save = action('Save', () => {
            if (!input.value.trim()) { result.textContent = 'Enter a key.'; return; }
            save.disabled = true;
            void this.service.setImageAiKey(input.value).then(() => this.renderImageAi()).catch(() => {
                result.textContent = 'Could not save the key.'; save.disabled = false;
            });
        }, { small: true });
        const check = action('Check connection', () => {
            check.disabled = true; result.textContent = 'Checking connection…';
            void this.service.checkImageAiConnection().then(doctor => { result.textContent = doctor.detail; })
                .catch(() => { result.textContent = 'Could not check the connection.'; })
                .finally(() => { check.disabled = false; });
        }, { small: true });
        const card = element('div');
        card.append(status, settingRow('Image AI key', 'Save in the credentials file on this PC.', input, save));
        if (state.narrationKeyAvailable) {
            const reuse = action(state.useNarrationKey ? 'Using the same key' : 'Use the same key', () => {
                reuse.disabled = true;
                void this.service.useNarrationImageAiKey(true).then(() => this.renderImageAi())
                    .catch(() => { result.textContent = 'Could not switch keys.'; reuse.disabled = false; });
            }, { small: true });
            reuse.disabled = state.useNarrationKey;
            card.append(settingRow('Narration fal key', 'Reuse a configured key.', reuse));
        }
        card.append(settingRow('Connection', 'Send a lightweight read-only request to the service.', check), result);
        this.imageAiRow.replaceChildren(card);
    }

    /** グループ見出し（生成 AI / 文字起こし）ごとのカードに並べる。並びは formatConnections の順を保つ。 */
    protected renderProviders(providers: ConnectionRow[]): void {
        const groups = new Map<ProviderGroup, ConnectionRow[]>();
        for (const row of providers) {
            const group = providerGroup(row.id);
            groups.set(group, [...groups.get(group) ?? [], row]);
        }
        const order: ProviderGroup[] = ['generate', 'transcribe'];
        this.providerList.replaceChildren(...order.filter(group => groups.has(group)).map(group => {
            const card = groupCard(PROVIDER_GROUP_LABELS[group], ...groups.get(group)!.map(row => this.providerRow(row)));
            card.setAttribute('data-akari-provider-group', group);
            return card;
        }));
        this.updateConnectionSummary(providers);
    }

    protected renderSubscriptions(): void {
        const entries = [
            { id: 'codex', label: 'ChatGPT（Codex）', maker: 'openai', guide: 'Run codex login in the terminal' },
            { id: 'antigravity', label: 'Antigravity', maker: 'google', guide: 'Start agy in the terminal and sign in' },
            { id: 'grok', label: 'Grok', maker: 'xai', guide: 'Run grok login in the terminal' }
        ] as const;
        const rows = entries.map(entry => {
            const state = this.imageRouteStates.find(row => row.id === entry.id);
            const row = element('div'); row.className = 'akari-set-prov';
            row.setAttribute('data-akari-subscription', entry.id);
            const logo = element('div'); logo.className = 'akari-set-logo';
            logo.appendChild(makerBadge(CONNECTION_MAKERS, entry.maker, false));
            const detail = element('div');
            detail.style.minWidth = '0';
            const name = element('div'); name.className = 'akari-set-prov-name';
            name.append(element('span', entry.label));
            const status = state?.state === 'ready' ? 'Available' : state?.state === 'signed-out' ? 'Sign-in required'
                : state?.state === 'missing' ? 'Not installed' : state?.state === 'unknown' ? 'Could not verify' : 'Checking';
            name.append(statusPill(status, state?.state === 'ready' ? 'ok' : 'neutral'));
            detail.append(name, element('div', state?.state === 'ready' ? 'Signed in · Images' : entry.guide));
            row.append(logo, detail);
            return row;
        });
        this.subscriptionList.replaceChildren(groupCard('No extra cost — Your subscriptions', ...rows));
    }

    protected updateConnectionSummary(providers: ConnectionRow[]): void {
        this.connectionSummary = { configured: providers.filter(row => row.configured).length, total: providers.length };
        this.renderSection('start');
    }

    protected async refreshStoreEntitlements(): Promise<void> {
        const generation = ++this.storeStatusGeneration;
        if (!this.storeState.connection.connected || this.storeState.phase !== 'idle') {
            this.storeReconnect = false;
            this.renderStore();
            return;
        }
        try {
            const view = await this.storeService.getAssetCatalogView(undefined);
            if (this.isDisposed || generation !== this.storeStatusGeneration) { return; }
            this.storeReconnect = storeReconnectRequired(true, view.entitlementsStatus);
            this.renderStore();
        } catch { /* Keep the saved-credential status if the catalog is unavailable. */ }
    }

    /**
     * Akari アカウント節の中身: アカウント帯（接続状態・接続 / 解除）+ AKARI Store のグループ（状態・Store を開く）。
     * 将来のプラン（サブスク）の席はこの下に足す — 今は「準備中」の枠を出さない（2026-09-22 裁定）。
     * このメソッドは element / description / action と deriveStoreLabBaseUrl だけで組む
     * （akari-project/test/service-urls.test.mjs がメソッド単体を取り出して Store の URL を検査する）。
     */
    protected renderStore(): void {
        const state = this.storeState;
        const busy = state.phase === 'starting' || state.phase === 'pending';
        const connected = state.connection.connected && !this.storeReconnect;
        const who = state.connection.email ?? state.connection.identifier ?? '';
        const statusText = state.connectionLoading ? 'Checking connection…'
            : state.phase === 'starting' ? 'Starting connection…'
                : state.phase === 'pending' ? `Approve in your browser · Verification code: ${state.userCode ?? ''}`
                    : this.storeReconnect ? STORE_RECONNECT_REQUIRED_MESSAGE
                        : state.connection.connected ? `Connected · ${who}` : 'Not connected';
        const url = `${deriveStoreLabBaseUrl(state.connection.url)}/`;

        const band = element('div');
        band.className = 'akari-set-group';
        band.setAttribute('data-akari-account-band', 'true');
        band.setAttribute('data-akari-settings-group', 'Account');
        const bandInner = element('div');
        bandInner.className = 'akari-set-account';
        const avatar = element('div');
        avatar.className = 'akari-set-avatar akari-set-avatar-user';
        avatar.setAttribute('aria-hidden', 'true');
        const identity = element('div');
        const name = element('div', connected ? (who || 'Connected to AKARI account') : 'AKARI account not connected');
        name.className = 'akari-set-account-name';
        const lead = description(connected ? 'Use purchased footage in AKARI Video.'
            : 'Connect to add footage purchased from AKARI Video Lab to your library.');
        lead.className = 'akari-set-account-desc';
        identity.append(name, lead);
        const controls = element('div');
        controls.className = 'akari-set-store-controls';
        if (busy) {
            controls.append(action('Cancel', () => this.storeController.cancel(), { small: true }));
        } else {
            if (!state.connection.connected || this.storeReconnect) {
                const connect = action(this.storeReconnect ? 'Reconnect' : 'Connect', () => void this.storeController.start(), { variant: 'primary' });
                connect.disabled = state.connectionLoading;
                controls.append(connect);
            }
            if (state.connection.connected) {
                const disconnect = action('Disconnect', () => {
                    disconnect.disabled = true;
                    void this.storeController.disconnect().catch(() => {
                        this.notice.textContent = 'Could not disconnect the AKARI account.';
                        if (!this.isDisposed) { this.renderStore(); }
                    });
                }, { small: true });
                disconnect.disabled = state.connectionLoading;
                controls.append(disconnect);
            }
        }
        bandInner.append(avatar, identity, controls);
        band.append(bandInner);

        const store = element('div');
        store.className = 'akari-set-group';
        store.setAttribute('data-akari-store-group', 'true');
        store.setAttribute('data-akari-settings-group', 'AKARI Video Lab');
        const storeTitle = element('div', 'AKARI Video Lab');
        storeTitle.className = 'akari-set-group-title';
        const statusRow = element('div');
        statusRow.className = 'akari-set-row';
        const statusCopy = element('div');
        const statusLabel = element('div', 'Connection');
        statusLabel.className = 'akari-set-row-label';
        const statusDetail = description('Find and buy footage and effects packs for your videos. Connect to use purchased footage in AKARI Video.');
        statusDetail.className = 'akari-set-row-desc';
        statusCopy.append(statusLabel, statusDetail);
        const status = element('span', statusText);
        status.className = `akari-set-pill ${connected ? 'akari-set-pill-ok' : this.storeReconnect ? 'akari-set-pill-warn' : 'akari-set-pill-neutral'}`;
        status.setAttribute('role', 'status');
        status.setAttribute('data-akari-store-status', connected ? 'connected' : this.storeReconnect ? 'reconnect' : busy ? 'pending' : 'disconnected');
        statusRow.append(statusCopy, status);
        const openRow = element('div');
        openRow.className = 'akari-set-row';
        const openCopy = element('div');
        const openLabel = element('div', 'Open AKARI Video Lab');
        openLabel.className = 'akari-set-row-label';
        const openUrl = description(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        openUrl.className = 'akari-set-row-desc';
        openCopy.append(openLabel, openUrl);
        openRow.setAttribute('data-akari-store-open', url);
        openRow.append(openCopy, action('Open', () => this.windows.openNewWindow(url, { external: true }), { small: true, iconAfter: 'ext' }));
        store.append(storeTitle, statusRow, openRow);
        if (state.error) {
            const error = description(state.error);
            error.className = 'akari-set-store-error';
            error.setAttribute('role', 'alert');
            store.append(error);
        }
        this.storeRow.replaceChildren(band, store);
    }

    protected renderStorage(credentials: ConnectionsList['credentials']): void {
        const detail = !credentials.exists ? `${credentials.path} · Created on registration. Plain text with owner-only permissions (600). CLI tools and skills also read this file.`
            : credentials.secure_permissions ? `${credentials.path} · Plain text with owner-only permissions (600). CLI tools and skills also read this file.`
                : `${credentials.path} · Current permissions are not 600. Corrected on the next registration or deletion.`;
        this.storage.replaceChildren(groupCard('Key storage', settingRow('Storage location', `Keys are stored at ${credentials.path} (this PC only, permissions 600).${detail}`, segmentedControl<'file' | 'encrypted'>({
            label: 'Key storage', value: 'file', onChange: () => undefined,
            options: [{ value: 'file', label: 'This file' }, { value: 'encrypted', label: 'Encrypted', disabled: true, title: 'Encrypted storage using this Mac login key is coming soon' }]
        }))), settingsNote('Only the last four characters are shown after registration. Keys are never included in reports, diffs, or chat.'));
    }

    protected providerRow(row: ConnectionRow): HTMLElement {
        const card = element('div');
        card.className = 'akari-set-prov';
        card.setAttribute('data-akari-provider', row.id);
        const logo = element('div');
        logo.className = 'akari-set-logo';
        const logoSource = providerLogo(row.id);
        if (logoSource) {
            const image = element('img');
            image.src = logoSource;
            image.alt = '';
            image.setAttribute('data-akari-provider-logo', row.id);
            logo.append(image);
        } else {
            logo.textContent = providerInitial(row.label);
            logo.setAttribute('data-akari-provider-logo-placeholder', row.id);
        }
        const main = element('div');
        main.style.minWidth = '0';
        const heading = element('div');
        heading.className = 'akari-set-prov-name';
        const status = statusPill('', 'neutral');
        status.setAttribute('role', 'status');
        heading.append(element('span', row.label), status);
        if (row.source === 'legacy') {
            const badge = element('span', 'Reading from old location');
            badge.className = 'akari-set-pill akari-set-pill-warn';
            badge.setAttribute('data-credential-source', 'legacy');
            heading.append(badge);
        }
        if (row.id === 'fal') { heading.append(statusPill('Recommended', 'accent')); }
        const display = PROVIDER_DISPLAY[row.id];
        const copy = element('div', display?.description ?? row.description);
        copy.className = 'akari-set-prov-desc';
        if (display?.highlight) { copy.append(element('em', display.highlight)); }
        const detail = element('div');
        detail.className = 'akari-set-prov-status';
        main.append(heading, copy, detail);
        const balance = providerHasBalanceEndpoint(row.id) ? this.balanceRow(row) : undefined;
        if (balance) { main.append(balance.node); }
        const controls = element('div');
        controls.className = 'akari-set-keyin';
        const actions = element('div');
        actions.className = 'akari-set-prov-actions';
        actions.append(controls);
        const links = element('div');
        links.className = 'akari-set-keyin';
        const billing = providerBillingUrl(row.id);
        if (billing) { links.append(action('Dashboard', () => this.windows.openNewWindow(billing, { external: true }), { small: true, iconAfter: 'ext' })); }
        if (row.setup_url?.startsWith('https://')) {
            const setupUrl = row.setup_url;
            links.append(action('Get key', () => this.windows.openNewWindow(setupUrl, { external: true }), { small: true, iconAfter: 'ext' }));
        }
        if (links.childElementCount > 0) { actions.append(links); }
        const paintStatus = (): void => {
            const [text, tone] = doctorPill(row);
            setPill(status, text, tone);
            status.setAttribute('data-connection-status', row.doctor.status);
            detail.textContent = row.configured ? doctorLabel(row.doctor) : '';
            balance?.setConfigured(row.configured);
        };
        const run = async (operation: () => Promise<void>): Promise<void> => {
            for (const control of Array.from(controls.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button'))) { control.disabled = true; }
            setPill(status, 'Checking…', 'neutral');
            try {
                await operation();
                renderControls();
                const list = await this.service.listConnections();
                if (!this.isDisposed) {
                    this.renderStorage(list.credentials);
                    this.renderProviders(list.providers);
                }
            } catch { detail.textContent = 'Operation failed. Check your input and destination.'; }
            finally {
                for (const control of Array.from(controls.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button'))) { control.disabled = false; }
            }
        };
        const renderControls = (): void => {
            controls.replaceChildren();
            paintStatus();
            if (row.configured) {
                const tail = element('code', `••••${row.masked_tail ?? ''}`);
                tail.className = 'akari-set-key-tail';
                controls.append(tail, action('Check', () => void run(async () => {
                    row.doctor = (await this.service.checkConnection(row.id)).doctor;
                }), { small: true }), action('Delete', () => void run(async () => {
                    await this.service.deleteCredential(row.id);
                    row.configured = false; row.masked_tail = null;
                    row.doctor = { status: 'unconfigured', detail: 'Not configured', last_checked: null };
                }), { small: true }));
                if (row.source === 'legacy') {
                    controls.append(action('Move to new location', () => void run(async () => {
                        await this.service.migrateCredential(row.id);
                    }), { small: true }));
                }
            } else {
                const input = textField({ label: `${row.label} API key`, type: 'password', placeholder: 'Paste API key' });
                input.autocomplete = 'off';
                const save = action('Save', () => void run(async () => {
                    // Send once, then immediately clear the DOM, including on failed requests.
                    let request: ReturnType<AkariConnectionsService['setCredential']>;
                    try { request = this.service.setCredential(row.id, input.value); }
                    finally { input.value = ''; }
                    const result = await request;
                    row.configured = result.ok; row.masked_tail = result.masked_tail; row.doctor = result.doctor;
                }), { small: true });
                controls.append(input, save);
            }
        };
        renderControls();
        card.append(logo, main, actions);
        if (row.id === 'fal') {
            const defaults = element('div');
            defaults.className = 'akari-set-defaults';
            defaults.setAttribute('data-akari-generation-defaults', 'true');
            main.append(defaults);
            void this.renderGenerationDefaults(defaults);
        }
        return card;
    }

    /** 「残高を見る」: 押したときだけ node 側へ問い合わせる（自動では取りにいかない）。キーはレンダラーへ来ない。 */
    protected balanceRow(row: ConnectionRow): { node: HTMLElement; setConfigured(configured: boolean): void } {
        const node = element('div');
        node.className = 'akari-set-bal';
        node.setAttribute('data-akari-balance', row.id);
        const value = element('span', '—');
        value.className = 'akari-set-bal-value';
        value.setAttribute('data-state', 'idle');
        value.setAttribute('role', 'status');
        const time = element('span');
        time.className = 'akari-set-bal-time';
        const accountLink = row.id === 'openrouter'
            ? action('Check account balance in dashboard', () => this.windows.openNewWindow('https://openrouter.ai/settings/credits', { external: true }), { small: true, iconAfter: 'ext' })
            : undefined;
        if (accountLink) { accountLink.style.display = 'none'; }
        const button = action('View balance', async () => {
            button.disabled = true;
            value.className = 'akari-set-bal-value';
            value.setAttribute('data-state', 'loading');
            value.textContent = 'Checking…';
            time.textContent = '';
            if (accountLink) { accountLink.style.display = 'none'; }
            try {
                const result = await this.service.readBalance(row.id);
                if (this.isDisposed) { return; }
                if (result.ok) {
                    value.textContent = result.display ?? '';
                    value.setAttribute('data-state', 'ok');
                    time.textContent = 'Just now';
                    time.title = new Date(result.checked_at).toLocaleString('en-US');
                    if (accountLink) { accountLink.style.display = result.account_url ? '' : 'none'; }
                } else {
                    value.textContent = result.error ?? 'Could not retrieve balance.';
                    value.className = 'akari-set-bal-error';
                    value.setAttribute('data-state', 'error');
                }
            } catch {
                value.textContent = 'Could not retrieve balance.';
                value.className = 'akari-set-bal-error';
                value.setAttribute('data-state', 'error');
            } finally {
                button.disabled = !row.configured;
            }
        }, { small: true, icon: 'refresh' });
        button.setAttribute('data-akari-balance-button', row.id);
        node.append(button, value, ...(accountLink ? [accountLink] : []), time);
        return {
            node,
            setConfigured: configured => {
                button.disabled = !configured;
                if (!configured) {
                    value.className = 'akari-set-bal-value';
                    value.setAttribute('data-state', 'idle');
                    value.textContent = 'Not connected';
                    time.textContent = '';
                    if (accountLink) { accountLink.style.display = 'none'; }
                } else if (value.getAttribute('data-state') === 'idle') {
                    value.textContent = '—';
                }
            }
        };
    }

    private async renderGenerationDefaults(container: HTMLElement): Promise<void> {
        container.replaceChildren(settingsNote('Loading default generation models…'));
        try {
            const [defaults, catalog] = await Promise.all([
                this.service.readGenerationDefaults(), this.service.readGenerationCatalog()
            ]);
            if (this.isDisposed) { return; }
            const controls: DropdownHandle[] = [];
            const rowFor = (field: 'still' | 'video', kind: GenerationKind, label: string): HTMLElement => {
                const options = generationOptions(catalog.models, kind, defaults.effective[field]).map(item => {
                    const [family, id, ...rest] = item.label.split(' · ');
                    return item.missing ? { value: item.value, label: item.value,
                        description: item.value === 'fal:gpt-image-2.5-flare' ? 'Cannot select on this screen' : 'Not in catalog' }
                        : { value: item.value, label: family, description: [id, ...rest].filter(Boolean).join(' · ') || undefined };
                });
                const control = dropdown({ label: `${label} default model`, options, value: defaults.effective[field] ?? '',
                    onChange: async value => {
                        for (const item of controls) { item.akariSetDisabled?.(true); }
                        try {
                            await this.service.setGenerationDefaults({ [field]: value });
                            if (!this.isDisposed) { await this.renderGenerationDefaults(container); }
                        } catch {
                            this.notice.textContent = 'Could not save default generation models.';
                            if (!this.isDisposed) { await this.renderGenerationDefaults(container); }
                        } finally {
                            for (const item of controls) { item.akariSetDisabled?.(false); }
                        }
                    } });
                control.setAttribute('data-akari-generation-default', field);
                controls.push(control);
                const source = element('span', generationSourceLabel(defaults.source[field]));
                source.className = 'akari-set-source';
                source.setAttribute('data-akari-generation-source', defaults.source[field]);
                source.setAttribute('data-akari-generation-source-for', field);
                return settingRow(`Default model: ${label}`, undefined, control, source);
            };
            container.replaceChildren(
                rowFor('still', 'image', 'Images'), rowFor('video', 'video', 'Video'),
                settingsNote('Initial models for image and video generation. Saved in workspace .akari/connections.json. Select even without configured keys')
            );
            for (const note of Array.from(container.querySelectorAll<HTMLElement>('.akari-set-note'))) { note.style.margin = '8px 0 0'; }
        } catch {
            if (this.isDisposed) { return; }
            container.replaceChildren(settingsNote('Could not load the generation model catalog.'),
                action('Reload', () => void this.renderGenerationDefaults(container), { small: true }));
        }
    }

    override dispose(): void {
        this.stopAboutUpdaterEvents();
        this.shortcutsView?.dispose();
        super.dispose();
    }
}

/** Embed the read-only first-run dialog's tool state; inherit its selection, install results
 * and progress polling so the two screens cannot drift, but draw the rows in the settings
 * card language (icon · name · purpose · status pill or button). Never openSetup:
 * settings must not write the onboarding marker or create a workspace. */
class SettingsToolsView extends AkariFirstRunSetupDialog {
    onToolsChanged: (() => void) | undefined;
    get content(): HTMLElement { return this.body; }
    get checkedTools(): AkariToolCheckResult[] | undefined { return this.toolCheck?.tools; }
    refresh(): Promise<void> { return this.recheckTools(); }

    protected override buildDom(): void {
        this.body.append(this.errorNotice, this.panel);
    }

    protected override renderState(): void {
        if (this.isDisposed) { return; }
        this.selectedToolIds.delete('speech-analyzer');
        for (const tool of this.toolCheck?.tools ?? []) {
            if (tool.unsupported) { this.selectedToolIds.delete(tool.id); }
        }
        this.errorNotice.textContent = this.setupError ?? '';
        this.errorNotice.className = 'akari-set-notice';
        this.errorNotice.style.margin = '0 0 12px';
        this.panel.replaceChildren();
        this.renderToolsStep();
        this.onToolsChanged?.();
    }

    protected override renderToolsStep(): void {
        this.panel.setAttribute('data-akari-setup-tools', 'true');
        const tools = this.toolCheck?.tools ?? [];
        const order = ['required', 'advanced', 'recommended'];
        const rows = [...tools].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier)).map(tool => this.createToolRow(tool));
        const recheck = action(this.checkingTools ? 'Checking…' : 'Check again', () => void this.recheckTools(), { small: true, icon: 'refresh' });
        recheck.setAttribute('data-akari-tool-recheck', 'true');
        recheck.disabled = this.checkingTools || this.installingTools;
        const card = groupCard('Tools', ...rows);
        if (!this.toolCheck && this.checkingTools) {
            const status = settingsNote('Checking tools…');
            status.setAttribute('role', 'status');
            status.style.margin = '10px 16px 14px';
            card.append(status);
        }
        if (this.installProgress) {
            const progress = settingsNote(formatInstallProgressLabel(TOOL_UI[this.installProgress.id].name, this.installProgress.index, this.installProgress.total));
            progress.setAttribute('role', 'status');
            progress.setAttribute('data-akari-tool-install-overall-progress', 'true');
            progress.style.margin = '10px 16px 14px';
            card.append(progress);
        }
        card.append(settingRow('Recheck status', 'Click after installing, including with another method', recheck));
        this.panel.append(card);
    }

    protected override createToolRow(tool: AkariToolCheckResult): HTMLElement {
        const info = TOOL_UI[tool.id];
        const rowState = deriveToolRowState(tool);
        const row = element('div');
        row.className = 'akari-set-tool';
        row.setAttribute('data-akari-tool-id', tool.id);
        row.setAttribute('data-akari-tool-available', String(tool.available));
        const icon = element('div');
        icon.className = 'akari-set-tool-icon';
        icon.append(settingsIcon(TOOL_ICONS[tool.id] ?? 'wrench'));
        const body = element('div');
        body.style.minWidth = '0';
        const name = element('b', info.name);
        name.className = 'akari-set-tool-name';
        const purpose = element('span', info.purpose);
        purpose.className = 'akari-set-tool-desc';
        body.append(name, purpose);
        const extra = (text: string, tone?: 'error'): void => {
            const line = element('span', text);
            line.className = 'akari-set-tool-extra';
            if (tone) { line.setAttribute('data-tone', tone); }
            body.append(line);
        };
        // 版の欄に実行ログ（パス入り）が返る道具がある（whisper-cli）。パスを含むものは版として出さない。
        if (tool.version && !/[\\/]/.test(tool.version)) { extra(tool.version); }
        if (tool.id === 'whisper' && tool.model) {
            const voiceInk = tool.model.path ? /[\\/]com\.prakashjoshipax\.VoiceInk[\\/]/.test(tool.model.path) : false;
            const line = tool.model.path
                ? `Model: ${voiceInk ? 'Using VoiceInk model · ' : ''}${homeShortened(tool.model.path)}`
                : `Recognition model · ${WHISPER_MODEL_SIZE_LABEL} · ${tool.model.available ? 'Downloaded' : 'Not downloaded'}`;
            extra(line);
            body.lastElementChild?.setAttribute('data-akari-tool-model-state', String(tool.model.available));
        }
        if (tool.needs?.length) { extra(tool.needs.join(' · ')); }
        if (shouldShowToolNote(tool)) { extra(info.note ?? ''); }
        const installResult = this.toolInstallResults.get(tool.id);
        if (installResult && !tool.available) {
            extra(describeToolInstallOutcome(installResult, info.name), installResult.outcome === 'failed' ? 'error' : undefined);
            body.lastElementChild?.setAttribute('data-akari-tool-install-result', installResult.outcome);
        }
        if (this.installingTools && this.installProgress?.id === tool.id) {
            const progress = this.currentToolProgress?.toolId === tool.id ? this.currentToolProgress : undefined;
            const percent = progress?.kind === 'download' ? computeDownloadPercent(progress.downloadedBytes ?? 0, progress.totalBytes) : undefined;
            const track = element('div');
            track.className = 'akari-set-progress';
            track.setAttribute('data-akari-tool-progress-bar', 'true');
            const fill = element('i');
            fill.style.width = `${percent ?? 35}%`;
            track.append(fill);
            body.append(track);
            extra(progress?.kind === 'download' ? formatDownloadProgressLabel(progress.downloadedBytes ?? 0, progress.totalBytes) : progress?.phase ?? 'Preparing…');
        }
        let trailing: HTMLElement;
        if (!tool.unsupported && !tool.available && !info.osProvided) {
            const install = action(this.installingTools && this.installProgress?.id === tool.id ? 'Installing…' : 'Set up', () => {
                this.selectedToolIds = new Set([tool.id]);
                void this.installSelectedTools();
            }, { small: true });
            install.disabled = this.installingTools;
            install.setAttribute('data-akari-tool-install', tool.id);
            install.title = `${rowState.label} · ${info.sizeLabel}`;
            trailing = install;
        } else {
            trailing = statusPill(rowState.label, tool.available && !tool.unsupported ? 'ok' : 'neutral');
            trailing.setAttribute('data-akari-tool-availability-label', 'true');
        }
        row.append(icon, body, trailing);
        return row;
    }

    override dispose(): void {
        this.stopProgressPolling();
        super.dispose();
    }
}

@injectable()
export class AkariSettingsCommandContribution implements CommandContribution {
    @inject(PreferenceService) protected readonly preferences!: PreferenceService;
    @inject(PreferenceSchemaService) protected readonly preferenceSchemas!: PreferenceSchemaService;
    @inject(AkariConnectionsService) protected readonly connections!: AkariConnectionsService;
    @inject(AkariAnnotationsService) protected readonly imageRoutes!: AkariAnnotationsService;
    @inject(AkariNarrationEnginesService) protected readonly narrationEngines!: AkariNarrationEnginesService;
    @inject(AkariProjectService) protected readonly store!: AkariProjectService;
    @inject(WindowService) protected readonly windows!: WindowService;
    @inject(CommandService) protected readonly commands!: CommandService;
    @inject(CommandRegistry) protected readonly commandRegistry!: CommandRegistry;
    @inject(KeybindingRegistry) protected readonly keybindingRegistry!: KeybindingRegistry;
    @inject(KeymapsService) protected readonly keymapsService!: KeymapsService;
    @inject(KeyboardLayoutService) protected readonly keyboardLayout!: KeyboardLayoutService;
    @inject(AkariNewProjectService) protected readonly tools!: AkariNewProjectService;
    @inject(FileService) protected readonly files!: FileService;
    @inject(FileDialogService) protected readonly fileDialogs!: FileDialogService;
    @inject(EnvVariablesServer) protected readonly env!: EnvVariablesServer;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(WebSocketConnectionProvider) protected readonly connectionsProvider!: WebSocketConnectionProvider;
    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(WidgetManager) protected readonly widgetManager!: WidgetManager;
    @inject(ApplicationShell) protected readonly shell!: ApplicationShell;
    @inject(PluginServer) protected readonly pluginServer!: PluginServer;
    protected maintenance?: AkariSettingsMaintenanceService;
    protected dialog: AkariSettingsDialog | undefined;
    protected requestedSection: SettingsSectionId | undefined;
    protected opened: Promise<unknown> | undefined;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'akari.library.isMoving' }, { execute: () => this.tools.isLibraryMoving() });
        commands.registerCommand({ id: 'akari.library.changeLocation', label: 'Change footage location…' }, {
            execute: async () => {
                const selected = await this.fileDialogs.showOpenDialog({
                    title: 'Choose footage location', canSelectFiles: false, canSelectFolders: true
                });
                if (!selected) { return; }
                this.messages.info('Moving footage…');
                this.dialog?.showLibraryMoveProgress(undefined);
                const poll = window.setInterval(() => {
                    void this.tools.libraryMoveProgress().then(value => this.dialog?.showLibraryMoveProgress(value));
                }, 400);
                try {
                    const result = await this.tools.moveLibrary(selected.path.fsPath());
                    this.messages.info(result.state === 'pending'
                        ? 'This location is synced. Review footage settings before moving.'
                        : 'Footage location changed.');
                    await this.dialog?.refreshLibraryStatus();
                } catch (error) {
                    this.messages.error(error instanceof Error ? error.message : 'Could not move footage.');
                    throw error;
                } finally {
                    window.clearInterval(poll);
                    this.dialog?.clearLibraryMoveProgress();
                }
            }
        });
        window.addEventListener('akari-permissions', event => {
            window.akariPermissions = (event as CustomEvent<{ microphone: string }>).detail;
            this.dialog?.refreshPrivacy();
        });
        window.addEventListener('keydown', event => {
            if (this.dialog && event.metaKey && event.key.toLowerCase() === 'f') {
                event.preventDefault(); event.stopImmediatePropagation(); this.dialog.focusSearch();
            }
        }, true);
        this.preferenceSchemas.addSchema({ properties: {
            [AKARI_APPEARANCE_THEME_MODE]: { type: 'string', enum: ['dark', 'light', 'system'], default: 'dark' },
            [AKARI_APPEARANCE_ZOOM]: { type: 'number', minimum: 60, maximum: 200, default: 100 },
            [STATUS_BAR_KEYS.cpu]: { type: 'boolean', default: true },
            [STATUS_BAR_KEYS.gpu]: { type: 'boolean', default: true },
            [STATUS_BAR_KEYS.memory]: { type: 'boolean', default: true },
            [STATUS_BAR_KEYS.disk]: { type: 'boolean', default: false },
            [STATUS_BAR_KEYS.running]: { type: 'boolean', default: true },
            [STATUS_BAR_KEYS.intervalSec]: { type: 'number', enum: [1, 3, 10], default: 3 },
            [STATUS_BAR_KEYS.accountBalance]: { type: 'boolean', default: false },
            [AKARI_PARTNER_REOPEN]: { type: 'boolean', default: true },
            'akari.export.openFolderAfter': { type: 'boolean', default: false },
            'akari.export.notifyAfter': { type: 'boolean', default: true },
            [AKARI_EXPORT_FILENAME_PATTERN]: { type: 'string', enum: ['project-date-time', 'project-name'], default: 'project-date-time' },
            'akari.update.channel': { type: 'string', enum: ['stable', 'prerelease'], default: 'prerelease' },
            'akari.update.autoCheck': { type: 'boolean', default: true }
        } });
        const applyZoom = (): void => applyAkariZoom(clampZoom(Number(this.preferences.get(AKARI_APPEARANCE_ZOOM, 100))));
        const applySystemTheme = (): void => {
            if (this.preferences.get<string>(AKARI_APPEARANCE_THEME_MODE, 'dark') === 'system') {
                const selected = (window.akariNativeDark ?? matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
                void this.preferences.set(WORKBENCH_COLOR_THEME, selected, PreferenceScope.User).then(() => {
                    window.electronTheiaCore?.setTheme('system');
                });
            }
        };
        void this.preferences.ready.then(() => { applyZoom(); applySystemTheme(); });
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === AKARI_APPEARANCE_ZOOM) { applyZoom(); }
            if (change.preferenceName === AKARI_APPEARANCE_THEME_MODE) { applySystemTheme(); }
            if (change.preferenceName === WORKBENCH_COLOR_THEME && this.preferences.get<string>(AKARI_APPEARANCE_THEME_MODE, 'dark') === 'system') {
                setTimeout(() => window.electronTheiaCore?.setTheme('system'), 0);
            }
        });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySystemTheme);
        window.addEventListener('akari-native-theme', event => {
            window.akariNativeDark = !!(event as CustomEvent<{ dark: boolean }>).detail?.dark;
            applySystemTheme();
        });
        window.addEventListener('keydown', event => {
            if (!event.metaKey || event.altKey || event.ctrlKey) { return; }
            const target = event.target as HTMLElement | null;
            if (target?.closest('.xterm, .terminal-widget, .theia-terminal')) { return; }
            if (event.key !== '+' && event.key !== '=' && event.key !== ';' && event.key !== '-') { return; }
            event.preventDefault();
            const current = clampZoom(Number(document.documentElement.dataset.akariZoom || this.preferences.get(AKARI_APPEARANCE_ZOOM, 100)));
            const value = clampZoom(current + (event.key === '-' ? -10 : 10));
            applyAkariZoom(value);
            void this.preferences.set(AKARI_APPEARANCE_ZOOM, value, PreferenceScope.User);
        }, true);
        // Reuse the existing RPC proxies. Opening a second channel for the same path hangs
        // in Theia; other extensions couple here only through path strings and JSON.
        commands.registerCommand({ id: 'akari.settings.readStatus' }, {
            execute: (path: string) => {
                if (path === '/services/akari-surfaces-new-project') { return this.tools.checkTools(); }
                if (path === '/services/akari-surfaces-connections') { return this.connections.listConnections(); }
                throw new Error('Unknown status service');
            }
        });
        commands.registerCommand({ id: 'akari.settings.open', label: 'AKARI Video settings' }, {
            execute: (arg?: unknown) => {
                const section = resolveSettingsSectionId(arg);
                if (section) {
                    this.requestedSection = section;
                    this.dialog?.showSection(section);
                }
                if (!this.opened) {
                    this.opened = this.openSettings().finally(() => { this.opened = undefined; });
                }
                return this.opened;
            }
        });
    }

    protected async openSettings(): Promise<void> {
        await this.preferences.ready;
        this.maintenance ??= this.connectionsProvider.createProxy<AkariSettingsMaintenanceService>(AKARI_SETTINGS_MAINTENANCE_PATH);
        const root = this.workspaceService.tryGetRoots()[0]?.resource.path.fsPath();
        const aiModels = this.connectionsProvider.createProxy<AkariAiModelsService>(AKARI_AI_MODELS_SERVICE_PATH);
        const dialog = new AkariSettingsDialog(this.preferences, this.connections, this.store, this.windows, this.commands, this.tools, this.files, this.env, this.fileDialogs, this.maintenance, root, this.widgetManager, this.shell, this.pluginServer, this.narrationEngines, this.keybindingRegistry, this.commandRegistry, this.keymapsService, this.keyboardLayout, aiModels, this.requestedSection);
        dialog.setImageRoutesService(this.imageRoutes);
        this.dialog = dialog;
        try { await dialog.open(); }
        finally {
            this.dialog = undefined;
            this.requestedSection = undefined;
            dialog.dispose();
        }
    }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) { node.textContent = text; }
    return node;
}
function action(
    label: string, click: () => void,
    options: { variant?: 'primary' | 'ghost'; small?: boolean; icon?: SettingsIconName; iconAfter?: SettingsIconName } = {}
): HTMLButtonElement {
    const button = element('button');
    button.type = 'button';
    button.className = `akari-set-btn akari-set-btn-${options.variant ?? 'ghost'}${options.small ? ' akari-set-btn-sm' : ''}`;
    if (options.icon) { button.append(settingsIcon(options.icon, 'sm')); }
    button.append(element('span', label));
    if (options.iconAfter) { button.append(settingsIcon(options.iconAfter, 'sm')); }
    button.addEventListener('click', click);
    return button;
}
function description(text: string): HTMLElement {
    const node = element('p', text);
    node.className = 'akari-set-row-desc';
    node.style.margin = '0';
    return node;
}
/** 文中の小さなリンク風ボタン。 */
function inlineLink(label: string, click: () => void): HTMLButtonElement {
    const button = action(label, click, { small: true });
    button.style.marginLeft = '4px';
    return button;
}
/** ホームディレクトリの接頭辞を ~ に縮める（画面とスクリーンショットに利用者名を出さない）。 */
function homeShortened(path: string): string {
    return path.replace(/^\/(?:Users|home)\/[^/]+/, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~');
}
function formatBytes(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    const unit = bytes < 1024 ** 2 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
    const scale = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
    return `${(bytes / scale).toFixed(1)} ${unit}`;
}
function applyAkariZoom(value: number): void {
    document.documentElement.dataset.akariZoom = String(value);
    if (window.electronTheiaCore?.setZoomLevel) {
        window.electronTheiaCore.setZoomLevel(Math.log(value / 100) / Math.log(1.2));
    } else {
        document.documentElement.style.setProperty('zoom', `${value}%`);
    }
}
/** テーマの見本（そのテーマのパレットで描いた小さな画面）。 */
function themePreview(theme: string): HTMLElement {
    const preview = el('div', 'akari-set-theme-preview');
    preview.setAttribute('data-theme', theme);
    preview.setAttribute('aria-hidden', 'true');
    preview.append(el('i'), el('i', 'm'), el('i'));
    return preview;
}
/** 状態のピルは「接続済み / 未接続」の 2 値（キーが通らないと分かったときだけ「繋がらない」）。確認の詳細は下の 1 行に出す。 */
function doctorPill(row: ConnectionRow): [string, 'ok' | 'neutral' | 'warn'] {
    if (!row.configured || row.doctor.status === 'unconfigured') { return ['Not connected', 'neutral']; }
    if (row.doctor.status === 'unauthorized') { return ['Cannot connect', 'warn']; }
    return ['Connected', 'ok'];
}
function doctorLabel(doctor: ConnectionDoctor): string {
    if (doctor.status === 'unconfigured') { return 'Not configured'; }
    if (doctor.status === 'ok') { return `Connected · ${doctor.last_checked ? new Date(doctor.last_checked).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}`; }
    if (!doctor.last_checked) { return 'Configured · Not checked'; }
    return `Cannot connect (${doctor.detail}）`;
}
