import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EMPTY_LIBRARY_FILTER, filterLibraryItems, isLibraryFilterOptionOn, LIBRARY_FILTER_SECTIONS, libraryFilterCount,
    libraryItemPrice, matchesLibraryFilter, presetMatchesLibraryFilter, toggleLibraryFilterOption
} from '../lib/common/library-filter.js';
import { countLibraryCategory } from '../lib/common/library-source-view.js';
import { LIBRARY_GROUPS } from '../lib/common/library-home-view.js';

const item = (key, extra = {}) => ({ origin: 'resolver', key, id: key.split('/')[1], category: key.split('/')[0], title: key, tags: [], ...extra });
const items = [
    item('still/own-photo', { sourceKind: 'own', state: 'cached', licenseSpdx: 'LicenseRef-user-owned', licenseScope: 'private-owned' }),
    item('still/site-cc0', { sourceKind: 'site', state: 'cached', licenseSpdx: 'CC0-1.0', licenseScope: 'commercial-ok' }),
    item('audio/site-by', { sourceKind: 'site', state: 'cached', licenseSpdx: 'CC-BY-4.0', licenseScope: 'commercial-ok', licenseAttributionRequired: true, tags: ['bgm'] }),
    item('broll/site-nc', { sourceKind: 'site', state: 'cached', licenseSpdx: 'CC-BY-NC-4.0' }),
    item('still/lab-premium', { sourceKind: 'lab', state: 'locked', price: 2980, licenseSpdx: 'LicenseRef-AKARI-Assets-v0' }),
    item('still/lab-bought', { sourceKind: 'lab', state: 'available', price: 1480, licenseSpdx: 'LicenseRef-AKARI-Assets-v0' }),
    item('still/lab-free', { sourceKind: 'lab', state: 'available', price: 0, licenseSpdx: 'LicenseRef-AKARI-Sounds-Terms-v0', licenseScope: 'commercial-ok' }),
    { origin: 'local', key: 'font/paid-font', id: 'paid-font', category: 'font', title: 'Paid font', tags: [], installed: false, distribution: 'paid',
        licenseSpdx: 'LicenseRef-proprietary', licenseScope: 'paid-license-required' },
    { origin: 'local', key: 'font/bundled-font', id: 'bundled-font', category: 'font', title: 'Bundled font', tags: [], installed: true, distribution: 'bundled',
        licenseSpdx: 'OFL-1.1', licenseScope: 'commercial-ok' }
];
const keys = (filter, favorites = new Set()) => filterLibraryItems(items, { ...EMPTY_LIBRARY_FILTER, ...filter }, favorites).map(row => row.key);

test('headings and options for four sections (no kind)', () => {
    assert.deepEqual(LIBRARY_FILTER_SECTIONS.map(section => section.label), ['Source', 'Price', 'License', 'Status']);
    assert.deepEqual(LIBRARY_FILTER_SECTIONS[0].options.map(option => option.label), ['All', 'Mine', 'Asset website', 'Lab']);
    assert.deepEqual(LIBRARY_FILTER_SECTIONS[1].options.map(option => option.label), ['Free', 'Premium', 'Purchased']);
    assert.deepEqual(LIBRARY_FILTER_SECTIONS[2].options.map(option => option.label), ['Commercial use allowed', 'Attribution required', 'No commercial use']);
    assert.deepEqual(LIBRARY_FILTER_SECTIONS[3].options.map(option => option.label), ['Downloaded', 'Not downloaded', 'Favorites']);
    assert.equal(LIBRARY_FILTER_SECTIONS.flatMap(section => section.options).some(option => /Tags|Images|Video|AI/.test(option.label)), false);
});

test('no selection shows all; count badge shows selected condition count', () => {
    assert.equal(keys({}).length, items.length);
    assert.equal(libraryFilterCount(EMPTY_LIBRARY_FILTER), 0);
    assert.equal(libraryFilterCount({ source: 'own', price: ['free'], license: ['commercial', 'attribution'], status: ['favorite'] }), 5);
});

test('pricing: unpurchased = Premium / Purchased / Free; self-sourced assets are excluded from pricing filters', () => {
    assert.equal(libraryItemPrice(items[4]), 'premium');
    assert.equal(libraryItemPrice(items[5]), 'purchased');
    assert.equal(libraryItemPrice(items[6]), 'free');
    assert.equal(libraryItemPrice(items[7]), 'external');
    assert.equal(libraryItemPrice(items[8]), 'free');
    assert.deepEqual(keys({ price: ['premium'] }), ['still/lab-premium']);
    assert.deepEqual(keys({ price: ['purchased'] }), ['still/lab-bought']);
    assert.deepEqual(keys({ price: ['premium', 'purchased'] }), ['still/lab-premium', 'still/lab-bought']);
    assert.equal(keys({ price: ['free'] }).includes('font/paid-font'), false);
});

test('license: Commercial use OK / Attribution required / Non-commercial (OR within each section)', () => {
    assert.deepEqual(keys({ license: ['noncommercial'] }), ['broll/site-nc']);
    assert.deepEqual(keys({ license: ['attribution'] }), ['audio/site-by', 'broll/site-nc']);
    const commercial = keys({ license: ['commercial'] });
    assert.ok(commercial.includes('still/site-cc0') && commercial.includes('audio/site-by') && commercial.includes('font/bundled-font'));
    assert.equal(commercial.includes('broll/site-nc'), false);
    assert.equal(commercial.includes('still/own-photo'), false, 'app cannot determine commercial rights for user-imported assets');
    assert.equal(commercial.includes('font/paid-font'), false);
    assert.deepEqual(keys({ license: ['noncommercial', 'attribution'] }), ['audio/site-by', 'broll/site-nc']);
});

test('status: Downloaded / Not downloaded / ★ (OR within each section)', () => {
    const favorites = new Set(['still/lab-free', 'broll/site-nc']);
    assert.deepEqual(keys({ status: ['remote'] }), ['still/lab-premium', 'still/lab-bought', 'still/lab-free', 'font/paid-font']);
    assert.deepEqual(keys({ status: ['favorite'] }, favorites), ['broll/site-nc', 'still/lab-free']);
    assert.deepEqual(keys({ status: ['favorite', 'remote'] }, favorites).length, 5);
    assert.ok(keys({ status: ['cached'] }).includes('font/bundled-font'));
});

test('sections combine with AND (source × pricing × license × status)', () => {
    const favorites = new Set(['still/site-cc0', 'audio/site-by', 'still/lab-premium']);
    assert.deepEqual(keys({ source: 'site', license: ['commercial'], status: ['favorite'] }, favorites), ['still/site-cc0', 'audio/site-by']);
    assert.deepEqual(keys({ source: 'site', license: ['attribution'], status: ['favorite'] }, favorites), ['audio/site-by']);
    assert.deepEqual(keys({ source: 'lab', price: ['premium'], status: ['favorite'] }, favorites), ['still/lab-premium']);
    assert.deepEqual(keys({ source: 'lab', price: ['free'], status: ['cached'] }), []);
    assert.deepEqual(keys({ source: 'own', price: ['free'], license: ['noncommercial'] }), []);
    assert.deepEqual(keys({ source: 'site', price: ['free'], license: ['commercial'], status: ['cached'] }), ['still/site-cc0', 'audio/site-by', 'font/bundled-font']);
});

test('chip toggles: only one source (click again for all), any number of others', () => {
    let filter = EMPTY_LIBRARY_FILTER;
    filter = toggleLibraryFilterOption(filter, 'source', 'own');
    assert.equal(filter.source, 'own');
    assert.equal(isLibraryFilterOptionOn(filter, 'source', 'own'), true);
    filter = toggleLibraryFilterOption(filter, 'source', 'lab');
    assert.equal(filter.source, 'lab');
    filter = toggleLibraryFilterOption(filter, 'source', 'lab');
    assert.equal(filter.source, 'all');
    filter = toggleLibraryFilterOption(filter, 'price', 'free');
    filter = toggleLibraryFilterOption(filter, 'price', 'premium');
    assert.deepEqual(filter.price, ['free', 'premium']);
    filter = toggleLibraryFilterOption(filter, 'price', 'free');
    assert.deepEqual(filter.price, ['premium']);
    assert.equal(EMPTY_LIBRARY_FILTER.price.length, 0, 'does not mutate original state');
});

test('bundled presets and My styles filter as local free standard assets', () => {
    const filter = patch => ({ ...EMPTY_LIBRARY_FILTER, ...patch });
    const none = new Set();
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({}), none), true);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ source: 'lab' }), none), true);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ source: 'own' }), none), false);
    assert.equal(presetMatchesLibraryFilter('mystyle/a', filter({ source: 'own' }), none, 'own'), true);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ price: ['premium'] }), none), false);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ license: ['noncommercial'] }), none), false);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ status: ['remote'] }), none), false);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ status: ['favorite'] }), none), false);
    assert.equal(presetMatchesLibraryFilter('lut/warm', filter({ status: ['favorite'] }), new Set(['lut/warm'])), true);
});

test('category counts reflect filtered results', () => {
    const categories = LIBRARY_GROUPS.flatMap(group => group.categories);
    const lut = categories.find(row => row.key === 'lut'), transition = categories.find(row => row.key === 'transition');
    const presets = { lut: [{ id: 'warm' }, { id: 'cool' }], textanim: [], textstyle: [] };
    const favorites = new Set(['lut/cool', 'transition/fade']);
    const pass = key => presetMatchesLibraryFilter(key, { ...EMPTY_LIBRARY_FILTER, status: ['favorite'] }, favorites);
    assert.equal(countLibraryCategory(lut, 'all', [], presets, 3, []), 2);
    assert.equal(countLibraryCategory(lut, 'all', [], presets, 3, [], pass), 1);
    assert.equal(countLibraryCategory(transition, 'all', [], presets, 3, [], pass, ['fade', 'wipe', 'zoom']), 1);
    assert.equal(countLibraryCategory(transition, 'own', [], presets, 3, []), 0);
});

test('matchesLibraryFilter handles local index items without errors', () => {
    assert.equal(matchesLibraryFilter({ origin: 'local', key: 'x/y', id: 'y', category: 'x', title: 'y', tags: [] },
        { ...EMPTY_LIBRARY_FILTER, source: 'site', price: ['free'], status: ['remote'] }, new Set()), true);
});
