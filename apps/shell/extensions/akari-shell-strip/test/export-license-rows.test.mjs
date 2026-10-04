import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLicenseRows } from '../lib/browser/export-dialog/export-license-rows.js';

const finding = (check, name, credit = '') => ({ check, details: { asset: name, name, credit } });

test('license rows show counts, first three names, overflow and copy text', () => {
  const rows = buildLicenseRows([
    ...['One', 'Two', 'Three', 'Four'].map(name => finding('license.non-commercial', name)),
    finding('license.unknown', 'Unknown'),
    finding('license.attribution', 'Display', 'Display text'),
  ]);
  assert.deepEqual(rows.map(row => [row.kind, row.label]), [
    ['non-commercial', 'Footage restricted from commercial use: 4'],
    ['unknown', 'Footage with unknown licenses: 1'],
    ['attribution', 'Footage requiring attribution: 1'],
  ]);
  assert.equal(rows[0].preview, 'One, Two, Three, plus 1 more');
  assert.deepEqual(rows[2].credits, ['Display text']);
  assert.deepEqual(buildLicenseRows([]), []);
});
