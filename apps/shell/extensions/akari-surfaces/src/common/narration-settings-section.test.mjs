import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SETTINGS_SECTIONS, SECTION_PREFERENCE_KEYS, sectionForPreferenceKey, isValidIrodoriUrl } from '../../lib/common/settings-sections.js';

test('Narration follows transcription and owns narration preference keys', () => {
    const ids = SETTINGS_SECTIONS.map(section => section.id);
    assert.equal(ids[ids.indexOf('transcribe') + 1], 'narration');
    assert.deepEqual(SECTION_PREFERENCE_KEYS.narration, ['akari.narration.engine', 'akari.narration.voice', 'akari.narration.irodoriUrl']);
    assert.equal(sectionForPreferenceKey('akari.narration.engine'), 'narration');
    assert.equal(sectionForPreferenceKey('akari.narration.voice'), 'narration');
    assert.equal(sectionForPreferenceKey('akari.narration.irodoriUrl'), 'narration');
    assert.equal(sectionForPreferenceKey('akari.narration.future'), 'narration');
});

test('Irodori server URLs accept only HTTP and HTTPS', () => {
    for (const value of ['http://127.0.0.1:8088', 'https://example.invalid/tts/']) assert.equal(isValidIrodoriUrl(value), true);
    for (const value of ['broken', 'file:///tmp/model', 'http://', 'http://user:pass@example.invalid',
        'https://example.invalid/?token=secret']) assert.equal(isValidIrodoriUrl(value), false);
});

test('Irodori URL preferences are strings defaulting to loopback port 8088', () => {
    const schema = readFileSync(new URL('../browser/akari-preferences.ts', import.meta.url), 'utf8');
    assert.match(schema, /export const AKARI_NARRATION_IRODORI_URL = 'akari\.narration\.irodoriUrl';/);
    const property = schema.match(/\[AKARI_NARRATION_IRODORI_URL\]:\s*\{([^}]+)\}/);
    assert.ok(property, 'irodoriUrl must exist in the preference schema');
    assert.match(property[1], /\btype:\s*'string'/);
    assert.match(property[1], /\bdefault:\s*'http:\/\/127\.0\.0\.1:8088'/);
});
