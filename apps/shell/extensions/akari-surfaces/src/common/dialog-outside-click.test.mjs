import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogOutsideClick } from '../../lib/common/dialog-outside-click.js';
import { AKARI_SETTINGS_DIALOG_CSS } from '../../lib/browser/style/akari-settings-dialog-style.js';

const overlay = {};
const block = {};

for (const [name, down, click, button, expected] of [
    ['Primary-button clicks outside close the dialog', overlay, overlay, 0, true],
    ['Dragging from the dialog to outside does not close it', block, overlay, 0, false],
    ['Clicks from outside to inside do not close it', overlay, block, 0, false],
    ['Clicks inside do not close it', block, block, 0, false],
    ['Secondary-button presses do not arm dismissal', overlay, overlay, 2, false],
    ['Middle-button presses do not arm dismissal', overlay, overlay, 1, false]
]) {
    test(name, () => {
        const pressed = dialogOutsideClick(false, 'mousedown', down, overlay, button);
        assert.deepEqual(pressed, { armed: down === overlay && button === 0, close: false });
        const clicked = dialogOutsideClick(pressed.armed, 'click', click, overlay, 0);
        assert.deepEqual(clicked, { armed: false, close: expected });
        assert.deepEqual(dialogOutsideClick(clicked.armed, 'click', overlay, overlay, 0), { armed: false, close: false });
    });
}

test('An isolated click without mousedown does not close', () => {
    assert.deepEqual(dialogOutsideClick(false, 'click', overlay, overlay, 0), { armed: false, close: false });
});

test('A subsequent mousedown rearms; any click clears the armed state', () => {
    assert.deepEqual(dialogOutsideClick(true, 'mousedown', block, overlay, 0), { armed: false, close: false });
    assert.deepEqual(dialogOutsideClick(true, 'mousedown', overlay, overlay, 2), { armed: false, close: false });
    assert.deepEqual(dialogOutsideClick(true, 'click', overlay, overlay, 2), { armed: false, close: false });
});

test('Blur and dimming apply only within the settings overlay', () => {
    const css = AKARI_SETTINGS_DIALOG_CSS;
    assert.match(css, /backdrop-filter:\s*blur\(6px\)/);
    assert.match(css, /-webkit-backdrop-filter:\s*blur\(6px\)/);
    assert.match(css, /background:\s*rgba\(0, 0, 0, \.45\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition: none;/);
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(match => match[1]);
    assert.deepEqual(transitions, ['opacity 120ms ease', 'none']);
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).filter(selector => !selector.startsWith('@media'));
    assert.deepEqual(selectors, [
        '[data-akari-settings-dialog] [data-akari-settings-section][hidden]',
        '.lm-Widget.dialogOverlay[data-akari-settings-dialog]',
        '.lm-Widget.dialogOverlay[data-akari-settings-dialog]'
    ]);
    for (const selector of selectors) {
        assert.ok(selector.includes('[data-akari-settings-dialog]'), selector);
    }
});
