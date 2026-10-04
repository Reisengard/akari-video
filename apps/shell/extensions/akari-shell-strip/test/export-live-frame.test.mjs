import assert from 'node:assert/strict';
import test from 'node:test';

import { AkariExportLiveFrameStore } from '../lib/browser/export-dialog/export-live-frame.js';

function deferred() {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
}

test('Live frame store reads B after A responds and keeps only the latest frame', async () => {
    const store = new AkariExportLiveFrameStore();
    const read = async path => `data:image/jpeg;base64,${path.at(-5)}`;
    store.update({
        phase: 'rendering',
        logTail: '',
        progressPreviewFrame: 30,
        progressPreviewPath: '/preview/a.jpg'
    }, read);
    await Promise.resolve();
    store.update({
        phase: 'rendering',
        logTail: '',
        progressPreviewFrame: 60,
        progressPreviewPath: '/preview/b.jpg'
    }, read);
    await Promise.resolve();
    assert.deepEqual(store.frame, {
        frameNumber: 60,
        path: '/preview/b.jpg',
        dataUrl: 'data:image/jpeg;base64,b'
    });
});

test('Live frame store discards stale responses and clears the last frame on completion', async () => {
    const store = new AkariExportLiveFrameStore();
    const responses = new Map([
        ['/preview/a.jpg', deferred()],
        ['/preview/b.jpg', deferred()]
    ]);
    const read = path => responses.get(path).promise;

    store.update({
        phase: 'rendering',
        logTail: '',
        progressPreviewFrame: 30,
        progressPreviewPath: '/preview/a.jpg'
    }, read);
    store.update({
        phase: 'rendering',
        logTail: '',
        progressPreviewFrame: 60,
        progressPreviewPath: '/preview/b.jpg'
    }, read);

    responses.get('/preview/b.jpg').resolve('data:image/jpeg;base64,b');
    await responses.get('/preview/b.jpg').promise;
    await Promise.resolve();
    assert.deepEqual(store.frame, {
        frameNumber: 60,
        path: '/preview/b.jpg',
        dataUrl: 'data:image/jpeg;base64,b'
    });

    responses.get('/preview/a.jpg').resolve('data:image/jpeg;base64,a');
    await responses.get('/preview/a.jpg').promise;
    await Promise.resolve();
    assert.equal(store.frame.path, '/preview/b.jpg');

    store.update({ phase: 'done', logTail: '' }, read);
    assert.equal(store.frame, undefined);
});
