import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { capabilityState, capabilityText, comparisonKeys, filterAiModels, groupRepresentative,
    otherVariantCount, applyAiModelSet, radarAxes, aiModelPriceValue, formatAiModelPrice,
    formatAiModelOtherPrices, aiModelResolutionText } from '../../lib/common/ai-models-model.js';
const model = (id, overrides = {}) => ({ id, kind: 'image', name: id, family: id, maker: 'openai', group: 'g', main: false,
    callable: true, via: 'api', inputs: { reference_images: { max: 2 }, first_frame: 'none' }, outputs: { aspects: ['16:9'], resolutions: null }, price: null, ...overrides });
const rows = [model('main', { main: true, name: 'GPT Image' }), model('variant', { name: 'GPT Image Sunburst' }),
    model('google', { maker: 'google', group: 'other', main: true, name: 'Nano Banana', via: 'subscription', inputs: { reference_images: { max: 0 } } }),
    model('unavailable', { group: 'new', main: true, callable: false })];
test('Representatives, type expansion, search, and company filters', () => {
    assert.deepEqual(filterAiModels(rows, { kind: 'image' }).map(row => row.id), ['main', 'google']);
    assert.equal(otherVariantCount(rows, rows[0]), 1);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', expanded: ['g'] }).map(row => row.id), ['main', 'variant', 'google']);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', query: 'sunburst' }).map(row => row.id), ['variant']);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', maker: 'google' }).map(row => row.id), ['google']);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', query: 'Google' }, { google: { name: 'Google' } }).map(row => row.id), ['google']);
});
test('Filter by method, inputs, and unavailable models', () => {
    assert.deepEqual(filterAiModels(rows, { kind: 'image', via: 'included' }).map(row => row.id), ['google']);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', via: 'api' }).map(row => row.id), ['main', 'variant']);
    assert.deepEqual(filterAiModels(rows, { kind: 'image', need: 'reference_images' }).map(row => row.id), ['main', 'variant']);
    assert.equal(filterAiModels(rows, { kind: 'image', showUnavailable: true }).some(row => row.id === 'unavailable'), true);
});
test('Unavailable main families use the first available type as representative', () => {
    const family = [
        model('fal:nano-banana', { group: 'nano-banana', main: true, callable: false }),
        model('fal:nano-banana-pro-edit', { group: 'nano-banana', main: false, callable: true }),
        model('fal:nano-banana-edit', { group: 'nano-banana', main: false, callable: true })
    ];
    const callable = family.filter(row => row.callable);
    assert.equal(groupRepresentative(callable, 'nano-banana').id, 'fal:nano-banana-pro-edit');
    assert.deepEqual(filterAiModels(family, { kind: 'image' }).map(row => row.id), ['fal:nano-banana-pro-edit']);
    assert.equal(otherVariantCount(family, callable[0]), 1);
    assert.deepEqual(filterAiModels(family, { kind: 'image', expanded: ['nano-banana'] }).map(row => row.id), ['fal:nano-banana-pro-edit', 'fal:nano-banana-edit']);
});
test('Sets exclude unavailable candidates and fill every type', () => {
    const all = [model('image'), model('image-later', { callable: false }), model('video', { kind: 'video' }), model('voice', { kind: 'voice' }), model('transcribe', { kind: 'transcribe' })];
    const result = applyAiModelSet({ label: 'セット', defaults: { image: 'image-later', video: 'video', voice: 'voice', transcribe: 'transcribe' },
        favorites: { image: ['image-later', 'image'] } }, all);
    assert.deepEqual(Object.keys(result.defaults).sort(), ['image', 'transcribe', 'video', 'voice']);
    assert.equal(result.defaults.image, 'image');
    assert.deepEqual(result.favorites.image, ['image']);
});
test('Unverified radar values are null and table values are marked; numbers come from measurements', () => {
    const axes = radarAxes(model('test', { speed_s: null, outputs: { aspects: null, resolutions: null } }));
    assert.equal(axes.find(axis => axis.key === 'speed').value, null);
    assert.equal(axes.find(axis => axis.key === 'speed').display, 'Not checked');
    assert.equal(axes.find(axis => axis.key === 'aspects').value, null);
    assert.equal(axes.find(axis => axis.key === 'references').value, 2 / 16);
    const voice = radarAxes(model('v', { kind: 'voice', via: 'local' }));
    assert.equal(voice.find(axis => axis.key === 'local').value, 1);
});
test('Cards, tables, and radar share three price formats and four units', () => {
    const cases = [
        [{ unit: 'usd_per_image', value: 0.2 }, '$0.2 / image', 0.2],
        [{ unit: 'usd_per_second', by_resolution: { '720P': 0.1, '1080P': 0.2 } }, '$0.1 / second', 0.1],
        [{ unit: 'usd_per_1000_chars', by_quality_1024: { low: 0.03, high: 0.08 } }, '$0.03 / 1,000 characters', 0.03],
        [{ unit: 'usd_per_hour', value: 0.4 }, '$0.4 / hour', 0.4]
    ];
    for (const [price, label, value] of cases) {
        const current = model('priced', { price });
        assert.equal(aiModelPriceValue(current), value);
        assert.equal(formatAiModelPrice(current), label);
        assert.equal(radarAxes(current)[0].display, label);
        assert.equal(radarAxes(current)[0].value, 1 / (1 + value * 10));
    }
    assert.equal(aiModelPriceValue(model('unknown')), null);
    assert.equal(formatAiModelPrice(model('unknown')), 'Price not verified');
    assert.equal(formatAiModelPrice(model('local', { via: 'local' })), 'No extra cost');
});
test('GPT Image 2.5 shares default high quality and AKARI aspect dimensions across views', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../../../../../packages/schemas/ai-models.json', import.meta.url)));
    for (const id of ['fal:gpt-image-2.5-flare', 'fal:gpt-image-2.5-sunburst']) {
        const current = catalog.models.find(row => row.id === id);
        assert.equal(aiModelPriceValue(current), 0.0528);
        assert.equal(formatAiModelPrice(current), '$0.053 / image(Quality: High · Based on 1024²)');
        assert.equal(formatAiModelOtherPrices(current), 'Low $0.006 · Medium $0.013');
        assert.equal(aiModelResolutionText(current), '16:9 with 1088×608 (Model limit: 3840×2160)');
        assert.equal(capabilityText('resolutions', current.outputs.resolutions, current), aiModelResolutionText(current));
        const axes = radarAxes(current);
        assert.equal(axes.find(axis => axis.key === 'cost').value, 1 / (1 + 0.0528 * 10));
        assert.equal(axes.find(axis => axis.key === 'cost').display, formatAiModelPrice(current));
        assert.equal(axes.find(axis => axis.key === 'resolution').value, 2016 / 3840);
        assert.equal(axes.find(axis => axis.key === 'resolution').display, 'AKARI maximum: 2016 px');
    }
});
test('Nano Banana 2 by_resolution retains its price and limit display', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../../../../../packages/schemas/ai-models.json', import.meta.url)));
    const current = catalog.models.find(row => row.id === 'fal:nano-banana-2');
    assert.equal(aiModelPriceValue(current), 0.06);
    assert.equal(formatAiModelPrice(current), '$0.06 / image');
    assert.equal(formatAiModelOtherPrices(current), '');
    assert.equal(capabilityText('resolutions', current.outputs.resolutions, current), '〜4K');
    assert.equal(radarAxes(current).find(axis => axis.key === 'resolution').value, 1);
});
test('Comparison inputs and outputs show only properties populated for that type', () => {
    const mixed = [
        model('image', { inputs: { reference_images: { max: 2 }, source_video: [], first_frame: 'none' }, outputs: { aspects: ['16:9'], voices: null, audio_out: false } }),
        model('voice', { kind: 'voice', inputs: { text: true }, outputs: { voices: ['a'], aspects: null } })
    ];
    assert.deepEqual(comparisonKeys(mixed, 'image', 'inputs', { reference_images: 'Reference image', source_video: 'Source video', first_frame: 'First frame', text: 'Text' }), ['reference_images']);
    assert.deepEqual(comparisonKeys(mixed, 'image', 'outputs', { aspects: 'Aspect ratio', voices: 'Voice options', audio_out: 'Audio' }), ['aspects']);
});

test('Null means unverified; only explicit denial receives strikethrough', () => {
    assert.equal(capabilityState(null), 'unknown');
    assert.equal(capabilityText('prompt', null), 'Not checked');
    for (const value of [false, 'none', [], { max: 0 }]) {
        assert.equal(capabilityState(value), 'unavailable');
        assert.equal(capabilityText('reference_images', value), 'Not allowed');
    }
    assert.equal(capabilityState({ max: 16 }), 'available');
    assert.equal(capabilityText('reference_images', { max: 16 }), '16  images maximum');
    assert.equal(capabilityText('reference_images', { max: null }), 'Allowed');
    assert.equal(capabilityText('aspects', ['16:9', '4:3']), '2 types');
    assert.equal(capabilityText('resolutions', ['720P', '4K']), '〜4K');
    assert.equal(capabilityText('duration', { min: 4, max: 15 }), '4〜15 seconds');
});

test('Comparison prompts are supported for image, video, and voice but not transcription', () => {
    for (const kind of ['image', 'video', 'voice']) {
        const item = model(kind, { kind, inputs: { prompt: true } });
        assert.deepEqual(comparisonKeys([item], kind, 'inputs', { prompt: 'Prompt' }), ['prompt']);
        assert.equal(capabilityText('prompt', item.inputs.prompt), 'Allowed');
    }
    const view = readFileSync(new URL('../browser/ai-models/ai-models-view.ts', import.meta.url), 'utf8');
    assert.match(view, /if \(this\.kind === 'transcribe'\) row\('Input: Prompt', \(\) => '—'\)/u);
});
