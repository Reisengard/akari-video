import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { akariMenuRows } = require('../lib/common/menu-rows.js');

test('Open menu heading and every row are English, with Map opt-in', () => {
    const path = new URL('../src/browser/akari-menu-widget.tsx', import.meta.url);
    const source = ts.createSourceFile('menu.tsx', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let heading;
    function visit(node) {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'section'
            && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
                && attribute.name.getText(source) === 'data-akari-menu-section'
                && attribute.initializer?.text === 'open')) {
            heading = node.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === 'h3');
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(heading, 'Open section heading');
    assert.equal(heading.children.filter(ts.isJsxText).map(node => node.text.trim()).join(''), 'Open');
    const rows = akariMenuRows({ worldMap: true });
    assert.equal(rows.find(row => row.id === 'akari.world.openMap')?.label, 'Map');
    for (const row of rows) assert.doesNotMatch(row.label, /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d]/u);
});
