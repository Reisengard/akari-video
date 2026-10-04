import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPluginEditorTitleItems, isAkariPreviewWebview } from '../lib/browser/tab-bar-toolbar-filter.js';

const output = { id: 'plugin-webview:akari-output-preview-abc123' };
const pluginItems = [
    { id: 'probe-as-tabbar-toolbar-item', effectiveMenuPath: ['plugin_editor/title', 'probe'] },
    { id: 'nested-as-tabbar-toolbar-item', effectiveMenuPath: ['plugin_editor/title', 'navigation', 'nested'] }
];

test('Output Preview filters direct and grouped menu delegate items', () => {
    assert.deepEqual(filterPluginEditorTitleItems(pluginItems, output), { kept: [], hidden: pluginItems });
});

test('Monaco editor items pass through', () => {
    assert.deepEqual(filterPluginEditorTitleItems(pluginItems, { id: 'code-editor:file:///edit.json' }), {
        kept: pluginItems, hidden: []
    });
});

test('Non-AKARI webviews pass through', () => {
    const widget = { id: 'plugin-webview:partner', identifier: { id: 'partner' }, viewType: 'partner.chat' };
    assert.deepEqual(filterPluginEditorTitleItems(pluginItems, widget), { kept: pluginItems, hidden: [] });
});

test('Preserve order and references of AKARI and other menu items', () => {
    const own = { id: 'akari.project.showChanges.toolbar' };
    const other = { id: 'other-as-tabbar-toolbar-item', effectiveMenuPath: ['plugin_view/title', 'other'] };
    const items = Object.freeze([own, ...pluginItems, other]);
    const result = filterPluginEditorTitleItems(items, output);
    assert.deepEqual(result, { kept: [own, other], hidden: pluginItems });
    assert.equal(result.kept[0], own);
    assert.equal(result.hidden[0], pluginItems[0]);
});

test('Filter using RUN and editor/title ID fallbacks', () => {
    const items = [{ id: 'plugin_editor/title/run' }, { id: 'plugin_editor/title' }];
    assert.deepEqual(filterPluginEditorTitleItems(items, output), { kept: [], hidden: items });
});

test('Keep unknown menuPath and ID items', () => {
    const items = [{}, null, undefined, { id: 3 }, { menuPath: 'plugin_editor/title' }, { menuPath: [] }];
    assert.deepEqual(filterPluginEditorTitleItems(items, output), { kept: items, hidden: [] });
});

test('Filter Footage Preview too', () => {
    assert.deepEqual(filterPluginEditorTitleItems(pluginItems, { id: 'plugin-webview:akari-preview-123' }), {
        kept: [], hidden: pluginItems
    });
});

test('Recognize retry suffixes on Footage and Output Preview', () => {
    for (const id of ['akari-preview-123-retry-1', 'akari-output-preview-456-retry-2']) {
        assert.deepEqual(filterPluginEditorTitleItems(pluginItems, { id: `plugin-webview:${id}` }), {
            kept: [], hidden: pluginItems
        });
        assert.equal(isAkariPreviewWebview({ identifier: { id } }), true);
    }
});

test('Recognize Preview using viewType and identifier.id alone', () => {
    for (const widget of [{ viewType: 'akari.preview' }, { identifier: { id: 'akari-preview-123' } },
        { identifier: { id: 'akari-output-preview-456' } }]) {
        assert.deepEqual(filterPluginEditorTitleItems(pluginItems, widget), { kept: [], hidden: pluginItems });
    }
});

test('Support menuPath and toolbarItem.menuPath', () => {
    const items = [
        { menuPath: ['plugin_editor/title', 'probe'] },
        { menuPath: ['plugin_editor/title/run'] },
        { effectiveMenuPath: ['plugin_editor/title/run'] },
        { toolbarItem: { menuPath: ['plugin_editor/title/run'] } },
        { menuPath: null, effectiveMenuPath: null, toolbarItem: { menuPath: ['plugin_editor/title', 'probe'] } }
    ];
    assert.deepEqual(filterPluginEditorTitleItems(items, output), { kept: [], hidden: items });
});

test('Do not misclassify missing widgets, similar IDs, or other menu prefixes', () => {
    for (const widget of [null, undefined, {}, { id: 'akari-preview-123' },
        { id: 'code-editor:akari-preview-123' }, { id: 'plugin-webview:other-akari-preview-123' }]) {
        assert.equal(isAkariPreviewWebview(widget), false);
        assert.deepEqual(filterPluginEditorTitleItems(pluginItems, widget), { kept: pluginItems, hidden: [] });
    }
    const items = [{ id: 'plugin_editor/title/other' }, { menuPath: ['plugin_editor/title-other'] }];
    assert.deepEqual(filterPluginEditorTitleItems(items, output), { kept: items, hidden: [] });
});
