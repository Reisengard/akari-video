import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateExport, formatEstimate } from '../lib/common/export-estimate.js';

const BASE = {
    frames: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    quality: 'standard',
    encoder: 'videotoolbox',
    engine: 'gpu'
};

test('estimateExport includes the GPU table and audio bitrate', () => {
    const estimate = estimateExport(BASE);
    assert.equal(estimate.seconds, 11.4);
    assert.equal(estimate.bytes, 10_240_000);
});

test('estimateExport uses previous measurements with a matching engine as cost per frame', () => {
    const estimate = estimateExport({
        ...BASE,
        lastRun: { frames: 100, width: 1920, height: 1080, elapsedMs: 5000, engine: 'gpu' }
    });
    assert.equal(estimate.seconds, 24);
});

test('estimateExport scales previous measurements and table values by pixel count', () => {
    const fixed = estimateExport({ ...BASE, width: 3840, height: 2160 });
    assert.equal(fixed.seconds, 18.6);
    const measured = estimateExport({
        ...BASE,
        width: 3840,
        height: 2160,
        lastRun: { frames: 100, width: 1920, height: 1080, elapsedMs: 5000, engine: 'gpu' }
    });
    assert.equal(measured.seconds, 69);
});

test('formatEstimate rounds time to 10 seconds and size to MB / GB', () => {
    assert.deepEqual(formatEstimate(4, 18_400_000), { time: 'About 10 s', size: 'About 18 MB' });
    assert.deepEqual(formatEstimate(78, 1_240_000_000), { time: 'About 1 min 20 s', size: 'About 1.2 GB' });
});

test('estimateExport estimates HEVC size at 0.6 times H.264 with matching settings', () => {
    const h264 = estimateExport({ ...BASE, codec: 'h264' });
    const hevc = estimateExport({ ...BASE, codec: 'hevc' });
    assert.equal(hevc.seconds, h264.seconds);
    assert.equal(hevc.bytes, h264.bytes * 0.6);
});

test('estimateExport estimates ProRes 422 HQ at about 220 Mbps for 1080p30', () => {
    const estimate = estimateExport({ ...BASE, codec: 'prores422' });
    assert.equal(estimate.bytes, (220 + 1.536) * 1_000_000 * 10 / 8);
});

test('estimateExport scales PNG size from 1.2 MB per 1080p frame', () => {
    const full = estimateExport({ ...BASE, codec: 'png' });
    const halfPixels = estimateExport({ ...BASE, width: 960, height: 1080, codec: 'png' });
    const audioBytes = 1.536 * 1_000_000 * 10 / 8;
    assert.equal(full.bytes, 1_200_000 * 300 + audioBytes);
    assert.equal(halfPixels.bytes, 1_200_000 * 300 * 0.5 + audioBytes);
});
