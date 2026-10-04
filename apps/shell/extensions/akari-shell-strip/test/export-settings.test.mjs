import test from 'node:test';
import assert from 'node:assert/strict';
import {
    containerForCodec,
    describeOutput,
    EXPORT_FORMAT_SEATS,
    EXPORT_QUALITY_CHOICES,
    EXPORT_SETTING_SEATS,
    isMasterSelectable,
    isFormatSelectable,
    qualityChoiceForCli,
    resolveOutputResolution
} from '../lib/common/export-settings.js';

test('containerForCodec derives MP4, MOV, or directory from codec', () => {
    assert.deepEqual(containerForCodec('h264'), { ext: 'mp4', kind: 'file' });
    assert.deepEqual(containerForCodec('hevc'), { ext: 'mp4', kind: 'file' });
    assert.deepEqual(containerForCodec('prores422'), { ext: 'mov', kind: 'file' });
    assert.deepEqual(containerForCodec('png'), { ext: null, kind: 'directory' });
});

test('ProRes 422 HQ and PNG sequence descriptions follow the selected format', () => {
    assert.equal(isFormatSelectable('prores422'), true);
    assert.equal(isFormatSelectable('png'), true);
    const base = {
        quality: 'standard', engine: 'auto', encoder: 'auto', fps: undefined,
        resolution: 'native', customWidth: undefined, outputDirectoryUri: undefined,
        rerunLint: true, saveAsDefault: false
    };
    const prores = describeOutput({ ...base, codec: 'prores422' }, { output: { width: 1920, height: 1080, fps: 30 } });
    assert.equal(prores[0].value, 'MOV · ProRes 422 HQ / PCM 48 kHz');
    assert.equal(prores[3].value, '10-bit · Rec.709');
    const png = describeOutput({ ...base, codec: 'png' }, { output: { width: 1920, height: 1080, fps: 30 } });
    assert.equal(png[0].value, 'PNG sequence / WAV 48 kHz');
});

test('Map Standard, High quality, and Lightweight to CLI values', () => {
    assert.deepEqual(EXPORT_QUALITY_CHOICES.map(choice => [choice.label, choice.id]), [
        ['Standard', 'standard'], ['High quality', 'high'], ['Lightweight', 'light']
    ]);
    assert.equal(qualityChoiceForCli('high')?.label, 'High quality');
    assert.equal(qualityChoiceForCli('master'), undefined);
});

test('Master is selectable only with x264', () => {
    assert.equal(isMasterSelectable('x264'), true);
    assert.equal(isMasterSelectable('auto'), false);
    assert.equal(isMasterSelectable('videotoolbox'), false);
});

test('Keep at least 12 upcoming options with tooltips', () => {
    const unavailable = EXPORT_SETTING_SEATS.filter(seat => !seat.available);
    assert.ok(unavailable.length >= 12);
    assert.ok(unavailable.every(seat => seat.tooltip));
});

test('describeOutput returns four rows for current fixed output', () => {
    const lines = describeOutput({
        quality: 'standard', engine: 'auto', encoder: 'auto', fps: undefined,
        resolution: 'native', customWidth: undefined,
        outputDirectoryUri: undefined, rerunLint: true, saveAsDefault: false
    }, { output: { width: 1920, height: 1080, fps: 30 } });
    assert.equal(lines.length, 4);
    assert.deepEqual(lines.map(line => line.label), ['Format', 'Resolution', 'Audio', 'Color']);
    assert.match(lines[1].value, /1920 × 1080/);
});

test('resolveOutputResolution native keeps edit.json resolution', () => {
    assert.deepEqual(
        resolveOutputResolution({ width: 1920, height: 1080 }, { resolution: 'native' }),
        { width: 1920, height: 1080, mode: 'none' }
    );
});

test('resolveOutputResolution 720p and 4K preserve aspect ratio while resizing', () => {
    assert.deepEqual(
        resolveOutputResolution({ width: 1920, height: 1080 }, { resolution: '720p' }),
        { width: 1280, height: 720, mode: 'down' }
    );
    assert.deepEqual(
        resolveOutputResolution({ width: 1920, height: 1080 }, { resolution: '4k' }),
        { width: 3840, height: 2160, mode: 'up' }
    );
});

test('resolveOutputResolution rounds odd custom width and height to even values', () => {
    assert.deepEqual(
        resolveOutputResolution({ width: 1920, height: 1080 }, { resolution: 'custom', customWidth: 959 }),
        { width: 960, height: 540, mode: 'down' }
    );
});

test('resolveOutputResolution portrait 720p is 720×1280', () => {
    assert.deepEqual(
        resolveOutputResolution({ width: 1080, height: 1920 }, { resolution: '720p' }),
        { width: 720, height: 1280, mode: 'down' }
    );
});

test('resolveOutputResolution clamps custom width to 320–7680', () => {
    assert.equal(resolveOutputResolution(
        { width: 1920, height: 1080 }, { resolution: 'custom', customWidth: 1 }
    ).width, 320);
    assert.equal(resolveOutputResolution(
        { width: 1920, height: 1080 }, { resolution: 'custom', customWidth: 9999 }
    ).width, 7680);
});

test('describeOutput includes preset and resize mode in the resolution row', () => {
    const lines = describeOutput({
        quality: 'standard', engine: 'auto', encoder: 'auto', fps: undefined,
        resolution: '720p', customWidth: undefined,
        outputDirectoryUri: undefined, rerunLint: true, saveAsDefault: false
    }, { output: { width: 1920, height: 1080, fps: 30 } });
    assert.match(lines[1].value, /1280 × 720\(720p · Downscale/u);
});

test('H.265 (HEVC) is selectable and its description follows codec', () => {
    const hevc = EXPORT_FORMAT_SEATS.find(seat => seat.id === 'hevc');
    assert.equal(hevc?.available, true);
    assert.match(hevc?.tooltip ?? '', /Unsupported by X/u);
    assert.equal(isFormatSelectable('h264'), true);
    assert.equal(isFormatSelectable('hevc'), true);
    assert.equal(isFormatSelectable('prores422'), true);
    const lines = describeOutput({
        quality: 'standard', engine: 'auto', encoder: 'auto', codec: 'hevc', fps: undefined,
        resolution: 'native', customWidth: undefined,
        outputDirectoryUri: undefined, rerunLint: true, saveAsDefault: false
    }, { output: { width: 1920, height: 1080, fps: 30 } });
    assert.equal(lines[0].value, 'MP4 · H.265(HEVC) / AAC 48 kHz');
});
