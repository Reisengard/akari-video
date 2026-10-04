import { buildExportEncoderChoices, ExportEncoder, ExportPlatform } from 'akari-shell-strip/lib/common/export-encoder-choices';

// ナビの順（2026-09-22 設定ダイアログ刷新）。Akari アカウントを先頭に置き、テーマは開発者モードから外観へ移した。
// icon は browser/settings/settings-icons.ts の線画 SVG の名前（絵文字・記号文字は使わない）。
export const SETTINGS_SECTIONS = [
    { id: 'account', label: 'AKARI account', group: 'main', icon: 'user' },
    { id: 'start', label: 'Getting started', group: 'main', icon: 'play' },
    { id: 'export', label: 'Export', group: 'main', icon: 'download' },
    { id: 'appearance', label: 'Appearance', group: 'main', icon: 'contrast', badge: 'Language and size' },
    { id: 'connections', label: 'Connections and API keys', group: 'main', icon: 'key' },
    { id: 'ai-models', label: 'AI models', group: 'main', icon: 'spark' },
    { id: 'partner', label: 'Partner', group: 'main', icon: 'bot', badge: 'New' },
    { id: 'transcribe', label: 'Transcription', group: 'main', icon: 'mic' },
    { id: 'narration', label: 'Narration', group: 'main', icon: 'mic' },
    { id: 'quality', label: 'Preview quality', group: 'main', icon: 'gauge' },
    { id: 'notifications', label: 'Notifications', group: 'main', icon: 'bell' },
    { id: 'tools', label: 'Tools', group: 'main', icon: 'wrench' },
    { id: 'shortcuts', label: 'Shortcuts', group: 'main', icon: 'keyboard', badge: 'New' },
    { id: 'storage', label: 'Storage', group: 'data', icon: 'disk', badge: 'New' },
    { id: 'privacy', label: 'Privacy and permissions', group: 'data', icon: 'shield', badge: 'New' },
    { id: 'statistics', label: 'Statistics and usage', group: 'data', icon: 'chart', badge: 'Coming soon' },
    { id: 'help', label: 'Help', group: 'support', icon: 'help', badge: 'New' },
    { id: 'about', label: 'About', group: 'support', icon: 'info', badge: 'New' },
    { id: 'developer', label: 'Developer mode', group: 'developer', icon: 'code' }
] as const;

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];

export const SETTINGS_SECTION_DESCRIPTIONS: Record<SettingsSectionId, string> = {
    account: 'Manage your AKARI account connection and download footage purchased from AKARI Video Lab.',
    start: 'Open the first video guide and set up tools and your workspace.',
    export: 'Choose default export quality, format, frame rate, and destination.',
    appearance: 'Colors, language, size, and status bar items.',
    partner: 'Choose the AI you work with (CLI or official extension). Partner and extension settings have moved here from the left rail.',
    storage: 'Disk space used by AKARI. Open a row to see its location, contents, and whether it is safe to delete.',
    privacy: 'macOS permissions and data sent externally. Partners started from the terminal inherit these permissions.',
    statistics: 'Usage across connected services.',
    help: 'Troubleshooting tools. Include diagnostics when reporting a bug to help resolve it faster.',
    about: 'Version and updates.',
    connections: 'Manage external services and API keys, and choose default image and video generation models.',
    'ai-models': 'Find models, choose favorites and defaults, and compare capabilities.',
    transcribe: 'Choose the transcription mode and engine.',
    narration: 'Install and start speech engines, and choose the default engine and voice.',
    quality: 'Choose how previews are rendered.',
    notifications: 'Configure notifications when your AI partner finishes working.',
    tools: 'Check and set up the tools needed to create videos.',
    shortcuts: 'Press a key to change a shortcut. Use the menu on the right to disable it or restore the default.',
    developer: 'Configure developer views.'
};

/** プレビュー品質の節に小さく出す注記（値を読む機能がまだ無いことを隠さない）。 */
export const QUALITY_TIER_RESERVED_NOTE = 'No feature currently uses this value (reserved for AI generation quality tiers)';

export const SETTINGS_LAST_SECTION_KEY = 'akari.settings.lastSection';

export function initialSettingsSection(explicit: unknown, stored: unknown): SettingsSectionId {
    return resolveSettingsSectionId(explicit) ?? resolveSettingsSectionId(stored) ?? SETTINGS_SECTIONS[0].id;
}

export function isSettingsSectionVisible(id: SettingsSectionId, selected: SettingsSectionId): boolean {
    return id === selected;
}

// スキーマは browser/akari-preferences.ts が所有。純関数側は文字列ミラー。
export const AKARI_QUALITY_TIER = 'akari.qualityTier';
export const AKARI_TIMELINE_VISUAL_THUMBNAILS = 'akari.timeline.visualThumbnails';
export const AKARI_DEVELOPER_MODE = 'akari.developerMode';
export const AKARI_AGENT_TURN_END_NOTIFICATION = 'akari.notifications.agentTurnEnd';
export const AKARI_TRANSCRIBE_MODE = 'akari.transcribe.mode';
export const AKARI_TRANSCRIBE_BACKEND = 'akari.transcribe.backend';
export const AKARI_TRANSCRIBE_COMPARE_SET = 'akari.transcribe.compareSet';
export const AKARI_TRANSCRIBE_AUTO_CUTS = 'akari.transcribe.autoCuts';
export const AKARI_NARRATION_ENGINE = 'akari.narration.engine';
export const AKARI_NARRATION_VOICE = 'akari.narration.voice';
export const AKARI_NARRATION_IRODORI_URL = 'akari.narration.irodoriUrl';
export function isValidIrodoriUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
            && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}
// テーマのスキーマは Theia、書き出しは akari-shell-strip/akari-export-preferences.ts が所有。
// 設定キーは文字列ミラー、OS ごとのエンコーダ選択肢は所有拡張から共有する。
export const WORKBENCH_COLOR_THEME = 'workbench.colorTheme';
export const AKARI_EXPORT_QUALITY = 'akari.export.quality';
export const AKARI_EXPORT_ENCODER = 'akari.export.encoder';
export const AKARI_EXPORT_CODEC = 'akari.export.codec';
export const AKARI_EXPORT_FPS = 'akari.export.fps';
export const AKARI_EXPORT_OUTPUT_DIRECTORY = 'akari.export.outputDirectory';
export const AKARI_EXPORT_FILENAME_PATTERN = 'akari.export.fileNamePattern';
// カタログのスキーマは akari-project/akari-project-frontend-module.ts が所有。設定キーは文字列ミラー。
export const AKARI_CATALOG_ROOT = 'akari.catalog.root';
export const AKARI_APPEARANCE_THEME_MODE = 'akari.appearance.themeMode';
export const AKARI_APPEARANCE_ZOOM = 'akari.appearance.zoom';
export const STATUS_BAR_KEYS = {
    cpu: 'akari.statusBar.cpu', gpu: 'akari.statusBar.gpu', memory: 'akari.statusBar.memory',
    disk: 'akari.statusBar.disk', running: 'akari.statusBar.running',
    intervalSec: 'akari.statusBar.intervalSec', accountBalance: 'akari.statusBar.accountBalance'
} as const;
export const AKARI_PARTNER_REOPEN = 'akari.partner.reopenLast';

export const SECTION_PREFERENCE_KEYS: Record<SettingsSectionId, readonly string[]> = {
    account: [], // AKARI Store は PreferenceService ではなく Store の接続フローが所有する。
    start: [],
    export: [AKARI_EXPORT_QUALITY, AKARI_EXPORT_ENCODER, AKARI_EXPORT_CODEC, AKARI_EXPORT_FPS, AKARI_EXPORT_OUTPUT_DIRECTORY,
        'akari.export.openFolderAfter', 'akari.export.notifyAfter', AKARI_EXPORT_FILENAME_PATTERN],
    appearance: [WORKBENCH_COLOR_THEME, AKARI_APPEARANCE_THEME_MODE, AKARI_APPEARANCE_ZOOM, ...Object.values(STATUS_BAR_KEYS)],
    connections: [], // API キーは PreferenceService ではなく接続サービスが所有する。
    'ai-models': [],
    partner: [AKARI_PARTNER_REOPEN],
    transcribe: [AKARI_TRANSCRIBE_MODE, AKARI_TRANSCRIBE_BACKEND, AKARI_TRANSCRIBE_COMPARE_SET, AKARI_TRANSCRIBE_AUTO_CUTS],
    narration: [AKARI_NARRATION_ENGINE, AKARI_NARRATION_VOICE, AKARI_NARRATION_IRODORI_URL],
    quality: [AKARI_QUALITY_TIER, AKARI_TIMELINE_VISUAL_THUMBNAILS],
    notifications: [AKARI_AGENT_TURN_END_NOTIFICATION],
    tools: [AKARI_CATALOG_ROOT],
    shortcuts: [],
    storage: [], privacy: [], statistics: [], help: [], about: [],
    developer: [AKARI_DEVELOPER_MODE]
};

export function sectionForPreferenceKey(key: string): SettingsSectionId | undefined {
    const section = SETTINGS_SECTIONS.find(item => SECTION_PREFERENCE_KEYS[item.id].includes(key));
    if (section) { return section.id; }
    if (key.startsWith('akari.transcribe.')) { return 'transcribe'; }
    if (key.startsWith('akari.narration.')) { return 'narration'; }
    if (key.startsWith('akari.export.')) { return 'export'; }
    return undefined;
}

/**
 * `akari.settings.open` の引数（`'export'` / `{ section: 'export' }`）を節 id へ解決する。
 * テーマは開発者モードから外観へ移したので、旧 id `developer` でテーマを指して来た場合
 * （`{ section: 'developer', preference: 'workbench.colorTheme' }`）は外観へ寄せる。
 */
export function resolveSettingsSectionId(argument: unknown): SettingsSectionId | undefined {
    const record = typeof argument === 'object' && argument !== null ? argument as { section?: unknown; preference?: unknown } : undefined;
    const id = record && 'section' in record ? record.section : argument;
    const section = SETTINGS_SECTIONS.find(item => item.id === id)?.id;
    if (section === 'developer' && typeof record?.preference === 'string') {
        return sectionForPreferenceKey(record.preference) ?? section;
    }
    return section;
}

export function settingsSectionElementId(id: SettingsSectionId): string {
    return `akari-settings-${id}`;
}

// 選択肢の並びは画面の並び（カード・セグメントの左から）。description は選択カード・ドロップダウンの一言。
export const QUALITY_TIER_CHOICES = [
    { value: 'draft', label: 'Draft', description: 'Quick checks', icon: 'bolt' },
    { value: 'final', label: 'Final', description: 'Final quality', icon: 'gem' }
] as const;
export const THEME_CHOICES = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Follow system' }] as const;
export function clampZoom(value: number): number { return Math.min(200, Math.max(60, Math.round(value / 10) * 10)); }
export function matchesSettingsSearch(query: string, label: string, description: string, rows: readonly string[]): boolean {
    const needle = query.trim().toLocaleLowerCase();
    return !needle || [label, description, ...rows].some(value => value.toLocaleLowerCase().includes(needle));
}
/** フィードの公開日を、そのフィードで記された暦日のまま短く表示する。 */
export function formatShortReleaseDate(value: unknown): string {
    if (typeof value !== 'string') { return ''; }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) { return ''; }
    const month = Number(match[2]); const day = Number(match[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${month}/${day}` : '';
}
export const EXPORT_QUALITY_CHOICES = [
    { value: 'light', label: 'Lightweight', description: 'Sharing and review' },
    { value: 'standard', label: 'Standard', description: 'Everyday posts' },
    { value: 'high', label: 'High quality', description: 'Large screens' },
    { value: 'master', label: 'Master', description: 'Re-editing and archiving' }
] as const;
export const EXPORT_CODEC_CHOICES = [
    { value: 'h264', label: 'MP4 · H.264', description: 'Widely compatible' },
    { value: 'hevc', label: 'MP4 · H.265（HEVC）', description: 'Smaller at the same quality' },
    { value: 'prores422', label: 'MOV · ProRes 422 HQ', description: 'Transfer to an editor' },
    { value: 'png', label: 'PNG sequence', description: 'One image per frame' }
] as const;
export const EXPORT_FPS_CHOICES = [
    { value: '', label: 'Edit data' },
    { value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }
] as const;
export const TRANSCRIBE_MODE_CHOICES = [
    { value: 'simple', label: 'Simple', description: 'One automatic pass. Recommended for everyday use', icon: 'spark' },
    { value: 'advanced', label: 'Advanced', description: 'Compare engines and automatically create cut candidates', icon: 'sliders' }
] as const;

export function normalizeExportCodec(value: unknown): typeof EXPORT_CODEC_CHOICES[number]['value'] {
    return EXPORT_CODEC_CHOICES.find(choice => choice.value === value)?.value ?? 'h264';
}
export function normalizeExportFps(value: unknown): 24 | 30 | 60 | undefined {
    return value === 24 || value === 30 || value === 60 ? value : undefined;
}
export function normalizeExportEncoder(value: unknown, platform: ExportPlatform): ExportEncoder {
    return buildExportEncoderChoices(platform).find(choice => choice.value === value)?.value ?? 'auto';
}

export function normalizeQualityTier(value: unknown): 'draft' | 'final' {
    return value === 'final' ? 'final' : 'draft';
}
export function normalizeTheme(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value : 'dark';
}
export function normalizeExportQuality(value: unknown): typeof EXPORT_QUALITY_CHOICES[number]['value'] {
    return EXPORT_QUALITY_CHOICES.find(choice => choice.value === value)?.value ?? 'standard';
}
export function normalizeOutputDirectory(value: unknown): string {
    return typeof value === 'string' ? value : '';
}
