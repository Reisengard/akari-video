import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerSettingsCliRows } from '../../lib/common/partner-settings-rows.js';
import { PARTNER_AGENT_LABELS, PARTNER_CATALOG } from '../../../akari-partner/lib/browser/partner-catalog.js';

test('Settings CLI rows match ten catalog entries in order and display name', () => {
    const rows = partnerSettingsCliRows();
    const catalog = PARTNER_CATALOG.filter(entry => entry.form === 'cli');
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.map(row => row.entry.agent), catalog.map(entry => entry.agent));
    assert.deepEqual(rows.map(row => row.name), catalog.map(entry => PARTNER_AGENT_LABELS[entry.agent]));
});
