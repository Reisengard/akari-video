import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
    SETTINGS_SECTIONS, SECTION_PREFERENCE_KEYS, sectionForPreferenceKey,
    resolveSettingsSectionId, settingsSectionElementId, normalizeQualityTier,
    SETTINGS_SECTION_DESCRIPTIONS, SETTINGS_LAST_SECTION_KEY, initialSettingsSection, isSettingsSectionVisible,
    normalizeExportCodec, normalizeExportFps, normalizeExportEncoder, EXPORT_CODEC_CHOICES, EXPORT_FPS_CHOICES,
    normalizeTheme, normalizeExportQuality, normalizeOutputDirectory,
    QUALITY_TIER_CHOICES, THEME_CHOICES, EXPORT_QUALITY_CHOICES, QUALITY_TIER_RESERVED_NOTE
} from '../../lib/common/settings-sections.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Preference keys round-trip to unique sections', () => {
    const keys = new Set();
    assert.deepEqual(Object.keys(SECTION_PREFERENCE_KEYS), SETTINGS_SECTIONS.map(section => section.id));
    assert.deepEqual(SECTION_PREFERENCE_KEYS.quality, ['akari.qualityTier', 'akari.timeline.visualThumbnails']);
    for (const { id } of SETTINGS_SECTIONS) {
        for (const key of SECTION_PREFERENCE_KEYS[id]) {
            assert.equal(sectionForPreferenceKey(key), id);
            assert.equal(keys.has(key), false, key);
            keys.add(key);
        }
    }
    assert.equal(sectionForPreferenceKey('akari.transcribe.future'), 'transcribe');
    assert.equal(sectionForPreferenceKey('akari.export.codec'), 'export');
    assert.equal(sectionForPreferenceKey('unknown'), undefined);
});

test('Legacy quality, theme, developer, notifications, and Store settings move to their sections', () => {
    for (const [key, section] of [
        ['akari.qualityTier', 'quality'], ['workbench.colorTheme', 'appearance'],
        ['akari.developerMode', 'developer'], ['akari.notifications.agentTurnEnd', 'notifications']
    ]) { assert.equal(sectionForPreferenceKey(key), section); }
    const dialog = source('../browser/akari-settings-dialog.ts');
    assert.match(dialog, /this\.storeRow\.setAttribute\('data-akari-store-settings', 'true'\)/);
    assert.match(dialog, /this\.connections\.append\([^;]*this\.providerList/s);
    // AKARI Store は Akari アカウント節へ移した（2026-09-22）。接続と API キーの一覧には入れない。
    assert.doesNotMatch(dialog, /this\.providerList\.(?:replaceChildren|append)\([^;]*this\.storeRow/s);
    assert.doesNotMatch(dialog, /this\.connections\.append\([^;]*this\.storeRow/s);
    assert.match(dialog, /if \(id === 'account'\) \{\s*section\.append\(this\.storeRow\);/);
    assert.match(dialog, /new StoreConnectionFlowController/);
    assert.match(dialog, /this\.storeController\.disconnect\(\)/);
});

test('Section arguments accept objects or strings and ignore unknown values', () => {
    for (const { id } of SETTINGS_SECTIONS) {
        assert.equal(resolveSettingsSectionId({ section: id }), id);
        assert.equal(resolveSettingsSectionId(id), id);
    }
    for (const value of [undefined, null, {}, [], 1, true, 'unknown', { section: 'unknown' }, { section: {} }]) {
        assert.equal(resolveSettingsSectionId(value), undefined);
    }
});

test('Section order, groups, and DOM IDs match navigation contracts', () => {
    assert.deepEqual(SETTINGS_SECTIONS.map(section => section.id),
        ['account', 'start', 'export', 'appearance', 'connections', 'ai-models', 'partner', 'transcribe', 'narration', 'quality', 'notifications', 'tools', 'shortcuts', 'storage', 'privacy', 'statistics', 'help', 'about', 'developer']);
    assert.deepEqual(SETTINGS_SECTIONS.map(section => section.label),
        ['AKARI account', 'Getting started', 'Export', 'Appearance', 'Connections and API keys', 'AI models', 'Partner', 'Transcription', 'Narration', 'Preview quality', 'Notifications', 'Tools', 'Shortcuts', 'Storage', 'Privacy and permissions', 'Statistics and usage', 'Help', 'About', 'Developer mode']);
    for (const { id, group } of SETTINGS_SECTIONS) {
        assert.equal(group, id === 'developer' ? 'developer' : ['storage', 'privacy', 'statistics'].includes(id) ? 'data' : ['help', 'about'].includes(id) ? 'support' : 'main');
        assert.equal(settingsSectionElementId(id), `akari-settings-${id}`);
    }
});

test('Valid preferences persist and invalid preferences normalize to defaults', () => {
    for (const { value } of QUALITY_TIER_CHOICES) { assert.equal(normalizeQualityTier(value), value); }
    for (const { value } of THEME_CHOICES) { assert.equal(normalizeTheme(value), value); }
    for (const { value } of EXPORT_QUALITY_CHOICES) { assert.equal(normalizeExportQuality(value), value); }
    for (const value of [undefined, null, 1, false, {}, [], '']) {
        assert.equal(normalizeQualityTier(value), 'draft');
        assert.equal(normalizeTheme(value), 'dark');
        assert.equal(normalizeExportQuality(value), 'standard');
        assert.equal(normalizeOutputDirectory(value), '');
    }
    assert.equal(normalizeQualityTier('unknown'), 'draft');
    assert.equal(normalizeExportQuality('unknown'), 'standard');
    assert.equal(normalizeTheme('custom-theme'), 'custom-theme');
    assert.equal(normalizeTheme('  '), 'dark');
    assert.equal(normalizeOutputDirectory('file:///tmp/exports'), 'file:///tmp/exports');
});

test('Home Store settings open the connections section', () => {
    const home = source('../browser/akari-home-widget.tsx');
    const body = home.match(/protected async openStoreSettings\(\): Promise<void> \{([\s\S]*?)\n    \}/)?.[1].trim();
    assert.equal(body, "await this.commands.executeCommand('akari.settings.open', { section: 'connections' });");
});

test('The old settings widget is absent from the rail allowlist while its opener remains', () => {
    const curation = source('../../../akari-shell-strip/src/browser/akari-activity-bar-curation.ts');
    assert.equal(curation.includes('akari-settings-widget'), false);
    assert.match(curation, /id: 'akari-settings-opener'/);
});

test('Legacy settings widget and restoration WidgetFactory are removed', () => {
    assert.equal(existsSync(new URL('../browser/akari-settings-widget.tsx', import.meta.url)), false);
    assert.equal(source('../browser/akari-surfaces-frontend-module.ts').includes('AkariSettingsWidget'), false);
    assert.equal(source('../browser/akari-settings-dialog.ts').includes('akari-settings-widget'), false);
});

test('Section selection displays only the selected section', () => {
    for (const { id: selected } of SETTINGS_SECTIONS) {
        const visible = SETTINGS_SECTIONS.filter(({ id }) => isSettingsSectionVisible(id, selected));
        assert.deepEqual(visible.map(({ id }) => id), [selected]);
    }
});

test('Explicit section overrides restoration and invalid stored values are ignored', () => {
    assert.equal(SETTINGS_LAST_SECTION_KEY, 'akari.settings.lastSection');
    for (const { id } of SETTINGS_SECTIONS) {
        assert.equal(initialSettingsSection(id, 'tools'), id);
        assert.equal(initialSettingsSection({ section: id }, 'tools'), id);
        assert.equal(initialSettingsSection(undefined, id), id);
        assert.equal(initialSettingsSection('unknown', id), id);
        assert.equal(initialSettingsSection({ section: 'unknown' }, id), id);
        assert.equal(initialSettingsSection(id, 'unknown'), id);
    }
    for (const stored of [undefined, null, '', 'unknown', {}, [], 1, true]) {
        assert.equal(initialSettingsSection(undefined, stored), 'account');
        assert.equal(initialSettingsSection('unknown', stored), 'account');
    }
});

test('All AKARI schema keys appear without relying on fallback sections', () => {
    const declared = Object.values(SECTION_PREFERENCE_KEYS).flat();
    const schemaKeys = new Set();
    const dialog = source('../browser/akari-settings-dialog.ts');
    // akari-project が所有する開発者モードとカタログの設定も、ページ掲載の網羅検査に含める。
    for (const path of ['../browser/akari-preferences.ts', '../../../akari-shell-strip/src/browser/akari-export-preferences.ts',
        '../../../akari-project/src/browser/akari-project-frontend-module.ts']) {
        const schema = source(path);
        const constants = new Map([...schema.matchAll(/export const (\w+) = '(akari\.[^']+)'/g)]
            .map(([, name, key]) => [name, key]));
        for (const match of schema.matchAll(/(?:\[(\w+)\]|['"](akari\.[^'"]+)['"])\s*:\s*\{/g)) {
            const key = match[2] ?? constants.get(match[1]);
            if (!key) { continue; }
            schemaKeys.add(key);
            assert.ok(declared.includes(key), `${key} must be listed explicitly`);
            const section = sectionForPreferenceKey(key);
            assert.ok(section, key);
            assert.ok(SECTION_PREFERENCE_KEYS[section].includes(key), key);
            if (match[1]) {
                assert.ok(dialog.includes(`this.preferences.get(${match[1]})`) ||
                    dialog.includes(`this.preferences.get<boolean>(${match[1]},`) ||
                    dialog.includes(`this.preferences.get<TranscribeBackend>(${match[1]},`) ||
                    dialog.includes(`this.preferences.get<string[]>(${match[1]},`) ||
                    dialog.includes(`this.preferenceSwitch(${match[1]},`), `${key} has a form`);
                assert.ok(dialog.includes(`this.savePreference(${match[1]},`) ||
                    dialog.includes(`this.preferenceSwitch(${match[1]},`), `${key} can be saved`);
            }
        }
    }
    assert.ok(schemaKeys.size >= 14, 'all three preference schemas must be read');
    assert.ok(dialog.includes('this.preferenceSwitch(AKARI_DEVELOPER_MODE,'),
        'akari.developerMode has a form and can be saved');
    assert.equal(sectionForPreferenceKey('akari.catalog.root'), 'tools');
    assert.ok(dialog.includes('normalizeOutputDirectory(this.preferences.get(AKARI_CATALOG_ROOT))'),
        'akari.catalog.root has a form');
    assert.ok(dialog.includes('this.savePreference(AKARI_CATALOG_ROOT,'),
        'akari.catalog.root can be saved');
});

test('All sections share headings and descriptions and scroll only within the visible page', () => {
    for (const { id } of SETTINGS_SECTIONS) {
        assert.equal(typeof SETTINGS_SECTION_DESCRIPTIONS[id], 'string');
        assert.ok(SETTINGS_SECTION_DESCRIPTIONS[id].trim().length > 0, id);
        assert.equal(SETTINGS_SECTION_DESCRIPTIONS[id].includes('\n'), false, id);
    }
    // 「値を読む機能が無い」注記は説明文から外し、プレビュー品質のカードの下に小さく出す。
    assert.equal(QUALITY_TIER_RESERVED_NOTE, 'No feature currently uses this value (reserved for AI generation quality tiers)');
    const dialog = source('../browser/akari-settings-dialog.ts');
    assert.match(dialog, /settingsNote\(QUALITY_TIER_RESERVED_NOTE\)/);
    assert.match(dialog, /element\('h2', SETTINGS_SECTIONS\.find\(item => item\.id === id\)!\.label\)/);
    assert.match(dialog, /description\(SETTINGS_SECTION_DESCRIPTIONS\[id\]\)/);
    assert.match(dialog, /section\.replaceChildren\(\.\.\.this\.sectionHeading\(id\)\)/);
    assert.match(dialog, /this\.transcribe\.replaceChildren\(\.\.\.this\.sectionHeading\('transcribe'\)\)/);
    assert.match(dialog, /this\.connections\.append\(\.\.\.this\.sectionHeading\('connections'\)/);
    assert.match(dialog, /node\.hidden = true/);
    assert.match(dialog, /node\.hidden = !isSettingsSectionVisible\(id, section\)/);
    assert.match(dialog, /if \(!node\.hidden\) \{ node\.scrollTop = 0; \}/);
    assert.match(dialog, /Object\.assign\(node\.style, \{[^}]*minHeight: '0', overflowY: 'auto'/);
    assert.doesNotMatch(dialog, /scrollIntoView|scheduleSectionScroll|settingsSectionScrollTop|ResizeObserver|releaseScroll/);
});

// カタログのフォルダ（手入力・選択・キャンセル）の DOM 検査は settings-dialog-refresh.test.mjs へ移した。

test('Navigation works without storage and passes explicit command sections', () => {
    const dialog = source('../browser/akari-settings-dialog.ts');
    assert.match(dialog, /try \{ stored = localStorage\.getItem\(SETTINGS_LAST_SECTION_KEY\); \} catch/);
    assert.match(dialog, /this\.showSection\(initialSettingsSection\(initialSection, stored\)\)/);
    assert.match(dialog, /try \{ localStorage\.setItem\(SETTINGS_LAST_SECTION_KEY, section\); \} catch/);
    assert.match(dialog, /button\.addEventListener\('click', \(\) => this\.showSection\(target\)\)/);
    assert.match(dialog, /const section = resolveSettingsSectionId\(arg\)/);
    assert.match(dialog, /this\.dialog\?\.showSection\(section\)/);
    assert.match(dialog, /new AkariSettingsDialog\([^;]*this\.requestedSection\)/);
});

test('Only AI models widen the dialog and place comparisons below radar', () => {
    const dialog = source('../browser/akari-settings-dialog.ts');
    const section = dialog.slice(dialog.indexOf('showSection(section: SettingsSectionId): void {'));
    assert.match(section, /block\.style\.width = `min\(\$\{section === 'ai-models' \? 1440 : 1040\}px, calc\(100vw - 48px\)\)`/);
    assert.match(section, /block\.style\.maxWidth = section === 'ai-models' \? '1440px' : '1040px'/);
    const models = source('../browser/ai-models/ai-models-view.ts');
    assert.match(models, /\.akari-ai-compare\{[^}]*display:flex;flex-direction:column/);
    assert.doesNotMatch(models, /\.akari-ai-compare\{[^}]*grid-template-columns/);
});

test('Valid format, FPS, and platform encoder values persist; invalid values reset', () => {
    for (const { value } of EXPORT_CODEC_CHOICES) { assert.equal(normalizeExportCodec(value), value); }
    for (const value of [24, 30, 60]) { assert.equal(normalizeExportFps(value), value); }
    for (const [platform, encoders] of [
        ['darwin', ['auto', 'videotoolbox', 'x264']],
        ['win32', ['auto', 'nvenc', 'qsv', 'amf', 'mf', 'x264']],
        ['linux', ['auto', 'x264']]
    ]) {
        for (const value of encoders) { assert.equal(normalizeExportEncoder(value, platform), value); }
        for (const value of [undefined, null, 1, false, {}, [], '', 'unknown']) {
            assert.equal(normalizeExportEncoder(value, platform), 'auto');
        }
    }
    assert.equal(normalizeExportEncoder('nvenc', 'darwin'), 'auto');
    assert.equal(normalizeExportEncoder('videotoolbox', 'win32'), 'auto');
    assert.equal(normalizeExportEncoder('mf', 'linux'), 'auto');
    for (const value of [undefined, null, 1, false, {}, [], '', 'unknown', '30', 25, 29.97]) {
        assert.equal(normalizeExportCodec(value), 'h264');
        assert.equal(normalizeExportFps(value), undefined);
    }
    assert.deepEqual(EXPORT_FPS_CHOICES.map(({ value }) => normalizeExportFps(Number(value))), [undefined, 24, 30, 60]);
    const dialog = source('../browser/akari-settings-dialog.ts');
    assert.match(dialog, /this\.savePreference\(AKARI_EXPORT_FPS, normalizeExportFps\(Number\(value\)\)\)/);
    assert.match(dialog, /this\.preferences\.set\(key, value, PreferenceScope\.User\)/);
});


test('Transcription mode appears first and defaults to simple', () => {
    assert.equal(SECTION_PREFERENCE_KEYS.transcribe[0], 'akari.transcribe.mode');
    assert.match(SETTINGS_SECTION_DESCRIPTIONS.transcribe, /mode.*engine/i);
    assert.match(source('../browser/akari-preferences.ts'),
        /\[AKARI_TRANSCRIBE_MODE\]:\s*\{\s*type: 'string', enum: \['simple', 'advanced'\], default: 'simple'/);
});

// 文字起こしのモード切替（カード）で比較・カットのフォームを置き換える DOM 検査は settings-dialog-refresh.test.mjs へ移した。
