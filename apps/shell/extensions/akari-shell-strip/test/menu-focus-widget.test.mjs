import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/browser/akari-menu-widget.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('widget.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AkariMenuWidget');
const method = name => {
    const member = declaration?.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === name);
    assert.ok(member?.body, name);
    return member;
};

for (const name of ['focusSection', 'listSkills']) {
    test(`${name} is public`, () => {
        const modifiers = method(name).modifiers ?? [];
        assert.ok(!modifiers.some(node => node.kind === ts.SyntaxKind.ProtectedKeyword || node.kind === ts.SyntaxKind.PrivateKeyword));
    });
}

test('render marks the sections, headings and skill rows', () => {
    const render = method('render').getText(ast);
    assert.match(render, /<section data-akari-menu-section='open'[^>]*>\s*<h3 data-akari-menu-section-heading[^>]*>Open<\/h3>/);
    assert.match(render, /<section data-akari-menu-section='skills'>\s*<h3 data-akari-menu-section-heading[^>]*>Run skills<\/h3>/);
    assert.match(render, /<li key=\{skill.name\} data-akari-menu-skill=\{skill.name\}/);
});

test('widget keeps external focus separate from partner actions', () => {
    const forbidden = new RegExp(['inject', 'Prompt'].join(''));
    assert.doesNotMatch(source, forbidden);
    assert.doesNotMatch(source, /from\s+['"][^'"]*akari-partner/);
    assert.ok(!declaration.members.some(node => node.name?.getText(ast) === 'requestSkill'));
});

test('stylesheet loading is guarded for node tests', () => {
    assert.match(source, /try\s*\{\s*require\('\.\.\/\.\.\/src\/browser\/style\/menu-focus-pulse\.css'\);\s*\}\s*catch\s*\{/);
});

// Full expected method, including the variant target notice and its declaration.
const baselineExportSection = `protected renderExportSection(): React.ReactNode {
        const status = this.exportSession.snapshot.status;
        const running = status.phase === 'linting' || status.phase === 'rendering';
        const visible = running || status.phase === 'done' || status.phase === 'failed' || status.phase === 'lint-failed';
        const percent = status.progressPercent ?? 0;
        const stage = quickExportStageLabel(status.progressStage);
        const label = running
            ? \`\${stage ?? (status.phase === 'linting' ? 'Checking lint' : 'Preparing')} · \${percent}%\`
            : status.phase === 'done'
                ? 'Export complete'
                : status.phase === 'lint-failed' ? 'Lint failed' : 'Export failed';
        return (
            <section style={{ marginBottom: '22px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '0.85em', opacity: 0.6, letterSpacing: '0.05em' }}>Export</h3>
                <button
                    className='theia-button secondary'
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-start', padding: '8px 10px', width: '100%' }}
                    disabled={!this.editJsonExists}
                    title={!this.editJsonExists ? EDIT_JSON_MISSING_TOOLTIP : undefined}
                    onClick={() => void this.openExportDialog()}
                >
                    <span className='codicon codicon-desktop-download' aria-hidden='true' />
                    <span>Export…</span>
                </button>
                {this.selectedEditName !== 'edit.json' && (
                    <p style={{ opacity: 0.75, fontSize: '0.85em', margin: '6px 0 0' }}>
                        Export target: {this.selectedEditName}. Exporting another timeline is currently unsupported. Return to the edit.json tab to export.
                    </p>
                )}
                {!this.editJsonExists && (
                    <p style={{ opacity: 0.6, fontSize: '0.85em', margin: '6px 0 0' }}>{EDIT_JSON_MISSING_TOOLTIP}</p>
                )}
                {visible && (
                    <div data-akari-export-mini-status={status.phase} style={{ marginTop: '8px', border: '1px solid var(--theia-widget-border)', borderRadius: '6px', padding: '7px 9px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82em' }}>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                            <button className='theia-button secondary' style={{ marginLeft: 'auto', padding: '2px 7px', fontSize: '0.82em' }} onClick={() => void this.openExportDialog()}>Open</button>
                        </div>
                        {running && (
                            <div style={{ height: '4px', borderRadius: '2px', background: 'var(--akari-elevated, rgba(128,128,128,0.25))', overflow: 'hidden', marginTop: '5px' }}>
                                <div style={{ height: '100%', width: \`\${percent}%\`, background: 'var(--akari-accent, #f97316)', transition: 'width .2s linear' }} />
                            </div>
                        )}
                    </div>
                )}
                <button
                    className='theia-button secondary'
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-start', padding: '8px 10px', width: '100%', marginTop: '8px' }}
                    disabled={!this.workspaceOpened || this.cleaningProject}
                    title='Review and delete export temporary files and regenerable caches'
                    onClick={() => void this.cleanProjectData()}
                >
                    <span className={\`codicon \${this.cleaningProject ? 'codicon-loading codicon-modifier-spin' : 'codicon-trash'}\`} aria-hidden='true' />
                    <span>{this.cleaningProject ? 'Inspecting…' : 'Clean up unused data…'}</span>
                </button>
            </section>
        );
    }`;

test('renderExportSection exactly matches the variant target UI', () => {
    const current = method('renderExportSection').getText(ast).replace(/\r\n/g, '\n');
    assert.match(current, /data-akari-onboarding-target='export-button'/);
    assert.equal(current.replace("                    data-akari-onboarding-target='export-button'\n", ''), baselineExportSection);
});
