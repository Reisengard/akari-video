import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, matchesSettingsSearch, formatShortReleaseDate, STATUS_BAR_KEYS } from '../../lib/common/settings-sections.js';

test('Settings search matches section names, headings, and descriptions', () => {
    assert.equal(matchesSettingsSearch('zoom', 'Appearance', '色', ['UI size', 'Change zoom']), true);
    assert.equal(matchesSettingsSearch('diagnostics', 'Help', 'Export diagnostics', []), true);
    assert.equal(matchesSettingsSearch('extension', 'Partner', 'CLI and official extension', []), true);
    assert.equal(matchesSettingsSearch('存在しない語', 'Appearance', '色', ['zoom']), false);
});

test('Zoom clamps to 60–200% and rounds to 10% steps', () => {
    assert.equal(clampZoom(12), 60);
    assert.equal(clampZoom(124), 120);
    assert.equal(clampZoom(600), 200);
});

test('Status bar has the seven contracted preference keys', () => {
    assert.deepEqual(Object.values(STATUS_BAR_KEYS), ['akari.statusBar.cpu', 'akari.statusBar.gpu', 'akari.statusBar.memory',
        'akari.statusBar.disk', 'akari.statusBar.running', 'akari.statusBar.intervalSec', 'akari.statusBar.accountBalance']);
});

test('Release dates display M/D using the feed calendar date', () => {
    assert.equal(formatShortReleaseDate('2026-09-22T15:55:00+00:00'), '9/22');
    assert.equal(formatShortReleaseDate('2026-01-03'), '1/3');
    assert.equal(formatShortReleaseDate('invalid'), '');
});
