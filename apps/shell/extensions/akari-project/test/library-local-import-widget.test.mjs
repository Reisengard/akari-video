import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const URI = require('@theia/core/lib/common/uri').default;
const source = ts.createSourceFile('widget.tsx', readFileSync(new URL('../src/browser/akari-role-buckets-widget.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const widget = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AkariRoleBucketsWidget');
const methods = ['handleDrop', 'pickLibraryImport', 'storeMaterialInLibrary', 'finishLibraryImport', 'reportLibraryImportResult',
    // 検索欄は非制御なので、絞り込みを触る処理は必ず入力欄へ書き戻す（IME のため）。
    'syncSearchInput'];
const code = ts.transpileModule(`class Handler { ${methods.map(name => widget.members.find(member => member.name?.getText(source) === name).getText(source)).join('\n')} }`, { compilerOptions: { target: ts.ScriptTarget.ES2021 } }).outputText;
const Handler = new Function('URI', 'isOsFileDropInput', 'requestAnimationFrame', `${code}; return Handler;`)(URI, types => types.includes('Files') || types.includes('text/uri-list'), fn => fn());
const sheetSource = ts.createSourceFile('sheet.tsx', readFileSync(new URL('../src/browser/library-import-sheet.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sheetHelpers = ['libraryImportReadinessText', 'focusLibraryImportSheet'].map(name => sheetSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(sheetSource)).join('\n');
const { libraryImportReadinessText, focusLibraryImportSheet } = new Function(`${ts.transpileModule(sheetHelpers.replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2021 } }).outputText}; return { libraryImportReadinessText, focusLibraryImportSheet };`)();
function fixture() {
    const calls = [];
    const handler = new Handler();
    Object.assign(handler, { topView: 'catalog', update() { calls.push('update'); }, setDragActive() {},
        resolveDroppedFilePath: file => file.path, classifyDropped() { calls.push('classify-project'); return { accepted: [{ name: 'one.wav' }], rejectedCount: 0 }; },
        importDropped: value => calls.push(value), messages: { warn: value => calls.push(value), error: value => calls.push(value) } });
    return { handler, calls };
}
const event = (files, uriList = '') => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { files, types: ['Files'], getData: () => uriList } });
test('catalog drops send folders, cube, and docx to plan without format detection; project uses existing processing', () => {
    const { handler, calls } = fixture();
    const paths = ['/input/folder', '/input/look.cube', '/input/doc.docx'];
    handler.handleDrop(event(paths.map(path => ({ path }))));
    assert.deepEqual(handler.libraryImportRequest.paths, paths);
    assert.deepEqual(calls, ['update']);
    handler.topView = 'materials'; calls.length = 0;
    handler.handleDrop(event(paths.map(path => ({ path }))));
    assert.deepEqual(calls, ['classify-project', [{ name: 'one.wav' }]]);
});
test('URI drops, internal drag exclusion, and missing source path display', () => {
    const { handler, calls } = fixture();
    handler.handleDrop(event([], '# comment\nfile:///input/space%20name\nhttps://example.com'));
    assert.deepEqual(handler.libraryImportRequest.paths, ['/input/space name']);
    handler.libraryImportRequest = undefined; calls.length = 0;
    const internal = event([]); internal.dataTransfer.types = ['application/x-akari-material'];
    handler.handleDrop(internal); assert.deepEqual(calls, []);
    handler.handleDrop(event([{ name: 'no-path' }]));
    assert.equal(handler.libraryImportRequest, undefined); assert.match(calls[0], /Could not read the file location/);
});
test('dialog supports both macOS options and two buttons on other OSes, multiple selection, and cancellation', async () => {
    const { handler } = fixture(); let options;
    handler.dialogs = { showOpenDialog: async value => { options = value; return [URI.fromFilePath('/one'), URI.fromFilePath('/two')]; } };
    for (const [mode, files, folders] of [['both', true, true], ['files', true, false], ['folders', false, true]]) {
        assert.deepEqual(await handler.pickLibraryImport(mode), ['/one', '/two']);
        assert.deepEqual([options.canSelectFiles, options.canSelectFolders, options.canSelectMany], [files, folders, true]);
    }
    handler.dialogs.showOpenDialog = async () => undefined;
    assert.deepEqual(await handler.pickLibraryImport('both'), []);
});
test('Save to Library uses only single-file plan/apply without project operations', async () => {
    const { handler, calls } = fixture();
    const plan = { items: [{ path: '/project/assets/one.wav' }] };
    const result = { added: [], duplicates: [], rejected: [], failures: [] };
    handler.projectService = { planLibraryImport: async paths => { calls.push(paths); return plan; }, applyLibraryImport: async value => { assert.equal(value, plan); return result; } };
    handler.reportLibraryImportResult = value => assert.equal(value, result);
    handler.loadAssetCatalogView = async () => calls.push('reload-library');
    await handler.storeMaterialInLibrary({ uri: URI.fromFilePath('/project/assets/one.wav') });
    assert.deepEqual(calls, [['/project/assets/one.wav'], 'reload-library']);
    calls.length = 0;
    await handler.storeMaterialInLibrary({ reference: { id: 'one' } }); assert.deepEqual(calls, []);
});
test('importing clears filters, reloads home, and shows the strip', async () => {
    const { handler, calls } = fixture();
    Object.assign(handler, { libraryCategory: 'sfx', librarySourceFilter: 'lab', libraryFolderFilter: 'old', catalogQuery: 'old',
        reportLibraryImportResult() {}, loadAssetCatalogView: async () => calls.push('reload'),
        node: { querySelector: () => ({ scrollIntoView: () => calls.push('scroll') }) } });
    await handler.finishLibraryImport({});
    assert.deepEqual([handler.topView, handler.libraryCategory, handler.librarySourceFilter, handler.libraryFolderFilter, handler.catalogQuery, handler.catalogCategory], ['catalog', undefined, 'all', undefined, '', 'all']);
    assert.deepEqual(calls, ['reload', 'update', 'scroll']);
});
test('focus opening the sheet does not change scroll container scrollTop', () => {
    const container = { clientHeight: 190, scrollHeight: 720, scrollTop: 137 };
    const dialog = { focus(options) { if (!options?.preventScroll) container.scrollTop = 561; } };
    focusLibraryImportSheet(dialog);
    assert.equal(container.scrollTop, 137);
    const sheet = readFileSync(new URL('../src/browser/library-import-sheet.tsx', import.meta.url), 'utf8');
    assert.match(sheet, /return createPortal\(<div className='akari-library-import'/);
    assert.match(sheet, /focusLibraryImportSheet\(dialog\.current\)/);
    assert.match(sheet, /<\/div>, props\.overlayHost\);/);
});
test('sheet first row shows verification for both 0 and 2 rejected items', () => {
    assert.equal(libraryImportReadinessText(0), '✓ Confirmed that all files can be loaded');
    assert.equal(libraryImportReadinessText(2), '✓ Confirmed that all files can be loaded(Skipped: 2 items)');
});
test('completion toast shows only count; does not repeat rejected or placeholder warnings; only reports failures', () => {
    const { handler } = fixture();
    const info = [], warn = [];
    handler.messages = { info: value => info.push(value), warn: value => warn.push(value) };
    handler.reportLibraryImportResult({ added: [{ warnings: ['Thumbnail is a placeholder'] }],
        duplicates: [{ title: 'Existing' }], rejected: [{ path: '/bad.docx', reason: 'Unsupported' }],
        failures: [{ path: '/broken.wav', reason: 'Cannot read' }] });
    assert.deepEqual(info, ['Imported: 1']);
    assert.deepEqual(warn, ['/broken.wav: Cannot read']);
});
