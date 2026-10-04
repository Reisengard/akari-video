import test from 'node:test';
import assert from 'node:assert/strict';
import { describeThisVideo } from '../lib/common/export-this-video.js';

const cuts = [{ src: 'a.mp4', in: 0, out: 3 }, { src: 'b.mp4', in: 1, out: 5 }];

test('describeThisVideo reads landscape dimensions, duration, and composition', () => {
    assert.deepEqual(describeThisVideo(
        { output: { width: 1920, height: 1080, fps: 30 }, cuts },
        { captions: [{ id: 'c1' }] }
    ), {
        orientation: 'landscape', width: 1920, height: 1080, fps: 30,
        durationSeconds: 7, cutCount: 2, captionCount: 1
    });
});

test('describeThisVideo distinguishes portrait from square', () => {
    assert.equal(describeThisVideo({ output: { width: 1080, height: 1920 } }).orientation, 'portrait');
    assert.equal(describeThisVideo({ output: { width: 1080, height: 1080 } }).orientation, 'square');
});

test('describeThisVideo reads duration and media cut count from v2 tracks/items', () => {
    const edit = {
        version: 2,
        output: { width: 1920, height: 1080, fps: 30 },
        sources: [
            { id: 'srcA', path: 'media/srcA.mp4', proxy: null },
            { id: 'srcB', path: 'media/srcB.mp4', proxy: null }
        ],
        tracks: [
            {
                id: 'main-video', lane: 'visual', items: [
                    { id: 'cut-1', at: 0, duration: 450, source: { kind: 'media', src: 'srcA', in: 0, out: 15 } },
                    { id: 'cut-2', at: 450, duration: 300, source: { kind: 'media', src: 'srcB', in: 0, out: 10 } },
                    { id: 'cut-3', at: 750, duration: 450, source: { kind: 'media', src: 'srcA', in: 17, out: 32 } }
                ]
            },
            {
                id: 'caption-track', lane: 'visual', items: [
                    {
                        id: 'captions', name: 'Captions', at: 0, duration: 1200,
                        source: { kind: 'captions', path: 'captions.json' }, items: []
                    }
                ]
            }
        ]
    };
    assert.deepEqual(describeThisVideo(edit), {
        orientation: 'landscape', width: 1920, height: 1080, fps: 30,
        durationSeconds: 40, cutCount: 3
    });
});

test('describeThisVideo returns undefined for missing JSON without throwing', () => {
    assert.deepEqual(describeThisVideo(undefined), {
        orientation: 'landscape', width: undefined, height: undefined, fps: undefined
    });
});
