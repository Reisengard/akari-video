import test from 'node:test';
import assert from 'node:assert/strict';
import {
    deriveLibraryLicenseAxes, libraryCreditLine, libraryLicenseDisplayName, libraryLicenseKind, libraryLicenseMoreUrl, libraryLicenseSheet
} from '../lib/common/library-license.js';

const axes = (spdx, scope, attributionRequired) => deriveLibraryLicenseAxes({ spdx, scope, attributionRequired });

test('maps existing meta.json SPDX × scope combinations to two axes', () => {
    // catalog/ と置き場の meta.json に実在する license の全パターン（2026-09-25 時点）。
    const rows = [
        ['OFL-1.1', 'commercial-ok', false, 'allowed', false],
        ['CC0-1.0', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-proprietary', 'paid-license-required', false, 'unknown', false],
        ['LicenseRef-proprietary-free', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-MaouDamashii-Free', 'commercial-ok', true, 'allowed', true],
        ['MIT', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-SoundEffectLab-Free', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-MusMus-Free', 'commercial-ok', true, 'allowed', true],
        ['LicenseRef-DOVA-SYNDROME-Free', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-AKARI-Sounds-Terms-v0', 'commercial-ok', false, 'allowed', false],
        ['CC-BY-4.0', 'commercial-ok', true, 'allowed', true],
        ['LicenseRef-Pixabay-Content-License', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-PocketSound-Free', 'commercial-ok', true, 'allowed', true],
        ['LicenseRef-Mixkit-Free-License', 'commercial-ok', false, 'allowed', false],
        ['LicenseRef-AKARI-Assets-v0', 'test-only', false, 'unknown', false],
        ['LicenseRef-user-owned', 'private-owned', false, 'unknown', false],
        ['LicenseRef-user-owned', 'private-owned', true, 'unknown', true]
    ];
    for (const [spdx, scope, attribution, commercial, attributionRequired] of rows) {
        assert.deepEqual(axes(spdx, scope, attribution), { commercial, attributionRequired }, `${spdx} / ${scope}`);
    }
});

test('reads normalized scope values (commercial-ok / non-commercial / attribution / unknown)', () => {
    assert.deepEqual(axes(undefined, 'commercial-ok'), { commercial: 'allowed', attributionRequired: null });
    assert.deepEqual(axes(undefined, 'non-commercial'), { commercial: 'prohibited', attributionRequired: null });
    assert.deepEqual(axes(undefined, 'attribution'), { commercial: 'allowed', attributionRequired: true });
    assert.deepEqual(axes(undefined, 'unknown'), { commercial: 'unknown', attributionRequired: null });
    assert.deepEqual(axes(undefined, 'attribution', false), { commercial: 'allowed', attributionRequired: true });
});

test('missing or unknown scope falls back to SPDX; non-commercial SPDX overrides scope', () => {
    assert.deepEqual(axes('CC0-1.0'), { commercial: 'allowed', attributionRequired: false });
    assert.deepEqual(axes('CC-BY-4.0'), { commercial: 'allowed', attributionRequired: true });
    assert.deepEqual(axes('CC-BY-SA-4.0'), { commercial: 'allowed', attributionRequired: true });
    assert.deepEqual(axes('CC-BY-NC-4.0'), { commercial: 'prohibited', attributionRequired: true });
    assert.deepEqual(axes('CC-BY-NC-SA-4.0', 'commercial-ok', false), { commercial: 'prohibited', attributionRequired: true });
    assert.deepEqual(axes('LicenseRef-AKARI-Assets-v0'), { commercial: 'allowed', attributionRequired: false });
    assert.deepEqual(axes('LicenseRef-Someone'), { commercial: 'unknown', attributionRequired: null });
    assert.deepEqual(axes('LicenseRef-Someone', 'something-new', false), { commercial: 'unknown', attributionRequired: false });
    assert.deepEqual(axes(undefined, undefined), { commercial: 'unknown', attributionRequired: null });
    assert.deepEqual(axes('  ', ' '), { commercial: 'unknown', attributionRequired: null });
});

test('five license dialog types (Standard / CC0 / Lab premium / CC BY / CC BY-NC) plus Own and Other', () => {
    const base = { origin: 'resolver', price: 0 };
    assert.equal(libraryLicenseKind({ ...base, licenseSpdx: 'LicenseRef-AKARI-Assets-v0' }), 'premium');
    assert.equal(libraryLicenseKind({ ...base, price: 2980, licenseSpdx: 'CC0-1.0' }), 'premium');
    assert.equal(libraryLicenseKind({ ...base, licenseSpdx: 'CC-BY-NC-4.0' }), 'nc');
    assert.equal(libraryLicenseKind({ ...base, licenseSpdx: 'CC-BY-4.0' }), 'by');
    assert.equal(libraryLicenseKind({ ...base, licenseSpdx: 'CC0-1.0' }), 'cc0');
    assert.equal(libraryLicenseKind({ ...base, licenseSpdx: 'LicenseRef-user-owned', licenseScope: 'private-owned' }), 'own');
    assert.equal(libraryLicenseKind({ ...base, sourceKind: 'lab', licenseSpdx: 'LicenseRef-AKARI-Sounds-Terms-v0', licenseScope: 'commercial-ok' }), 'builtin');
    assert.equal(libraryLicenseKind({ origin: 'local', distribution: 'bundled', licenseSpdx: 'OFL-1.1', licenseScope: 'commercial-ok' }), 'builtin');
    assert.equal(libraryLicenseKind({ ...base, sourceKind: 'site', licenseSpdx: 'LicenseRef-MusMus-Free', licenseScope: 'commercial-ok', licenseAttributionRequired: true }), 'other');
    assert.equal(libraryLicenseKind({ origin: 'local', distribution: 'paid', licenseSpdx: 'LicenseRef-proprietary', licenseScope: 'paid-license-required' }), 'other');
});

test('dialog contents: Allowed / Not allowed / Notes bullets, attribution credit copy, and Learn more destination', () => {
    const by = libraryLicenseSheet({ origin: 'resolver', licenseSpdx: 'CC-BY-4.0', licenseScope: 'commercial-ok', licenseAttributionRequired: true });
    assert.equal(by.kind, 'by');
    assert.equal(by.credit, true);
    assert.ok(by.items.some(item => item.mark === 'warn'));
    assert.equal(by.moreUrl, 'https://creativecommons.org/licenses/by/4.0/deed.ja');
    const nc = libraryLicenseSheet({ origin: 'resolver', licenseSpdx: 'CC-BY-NC-4.0' });
    assert.equal(nc.title, 'Commercial use is not allowed');
    assert.ok(nc.items.some(item => item.mark === 'ng'));
    assert.equal(nc.moreUrl, 'https://creativecommons.org/licenses/by-nc/4.0/deed.ja');
    const premium = libraryLicenseSheet({ origin: 'resolver', price: 2980, licenseSpdx: 'LicenseRef-AKARI-Assets-v0' });
    assert.equal(premium.kind, 'premium');
    assert.equal(premium.credit, false);
    assert.equal(premium.moreUrl, undefined);
    assert.match(premium.name, /LicenseRef-AKARI-Assets-v0/);
    const cc0 = libraryLicenseSheet({ origin: 'resolver', licenseSpdx: 'CC0-1.0' });
    assert.equal(cc0.moreUrl, 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja');
    const other = libraryLicenseSheet({ origin: 'resolver', sourceKind: 'site', licenseSpdx: 'LicenseRef-MusMus-Free', licenseScope: 'commercial-ok', licenseAttributionRequired: true });
    assert.equal(other.kind, 'other');
    assert.equal(other.credit, true);
    assert.equal(other.title, 'Available with credit');
    const unknown = libraryLicenseSheet({ origin: 'local', licenseSpdx: 'LicenseRef-proprietary', licenseScope: 'paid-license-required' });
    assert.equal(unknown.title, 'Check the terms of use');
    for (const sheet of [by, nc, premium, cc0, other, unknown]) {
        for (const item of sheet.items) assert.doesNotMatch(item.text, /AI|group/);
    }
});

test('license name and one-line credit', () => {
    assert.equal(libraryLicenseDisplayName('CC-BY-4.0'), 'CC BY 4.0(Attribution)');
    assert.equal(libraryLicenseDisplayName('CC-BY-NC-SA-4.0'), 'CC BY-NC-SA 4.0(Noncommercial)');
    assert.equal(libraryLicenseDisplayName('CC0-1.0'), 'CC0 (public domain)');
    assert.equal(libraryLicenseDisplayName(undefined), 'No license specified');
    assert.equal(libraryLicenseMoreUrl('MIT'), 'https://spdx.org/licenses/MIT.html');
    assert.equal(libraryLicenseMoreUrl('LicenseRef-x'), undefined);
    assert.equal(libraryCreditLine({ title: 'Track', creditText: 'Music: A (CC BY 4.0)' }), 'Music: A (CC BY 4.0)');
    assert.equal(libraryCreditLine({ title: 'Track', author: 'A', licenseSpdx: 'CC-BY-4.0' }), 'Track / A (CC-BY-4.0)');
});
