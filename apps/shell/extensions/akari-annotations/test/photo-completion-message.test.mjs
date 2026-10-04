import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('photo completion notice conjugates the action and keeps other labels intact', () => {
    const source = readFileSync(new URL('../src/browser/akari-annotations-widget.ts', import.meta.url), 'utf8');
    const expression = source.match(/this\.footer\.textContent = (label === 'Remove background'[^;]+);/u)?.[1];
    assert.ok(expression);
    const message = new Function('label', `return ${expression};`);
    assert.equal(message('Remove background'), 'Background removed.');
    assert.equal(message('Add area'), 'Done: Add area.');
    assert.equal(message('Change clip transform'), 'Done: Change clip transform.');
});
