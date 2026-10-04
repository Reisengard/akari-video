import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { introVisual, PREPARING_COPY, inviteMarkup } = require('../../lib/onboarding/intro-model.js');
const { ONBOARDING_CSS } = require('../../lib/onboarding/style.js');

test('Welcome hero and branding do not carry into subsequent screens', () => {
    assert.deepEqual(introVisual('welcome'), { hero: 'welcome', brand: true });
    assert.deepEqual(introVisual('first'), { hero: 'none', brand: false });
    assert.deepEqual(introVisual('invite'), { hero: 'before-after', brand: false });
    assert.deepEqual(introVisual('invite', true), { hero: 'none', brand: false });
});

test('Preparing displays just one sentence', () => {
    assert.equal(PREPARING_COPY, 'Preparing…');
    assert.equal(inviteMarkup(true, ''), '<p>Preparing…</p>');
});

test('Invitation omits sample chips and preserves secondary link wording', () => {
    const markup = inviteMarkup(false, '');
    assert.ok(!markup.includes('ao-chip'));
    assert.ok(!markup.includes('0:37'));
    assert.match(markup, /data-ao="later">Start on my own later<\/button>/);
});

test('Before-after image padding is transparent and labels are centered', () => {
    assert.match(ONBOARDING_CSS, /\.ao-hero\.before-after\s*\{[^}]*background:transparent/);
    assert.match(ONBOARDING_CSS, /\.ao-before-after-labels\s*\{[^}]*grid-template-columns:1fr 1fr;\s*text-align:center/);
});
