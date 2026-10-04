import {
    GenerationCatalogModel, GenerationCatalogPrice, GenerationDefaultsSource, GenerationKind
} from 'akari-shell-strip/lib/common/akari-connections-protocol';

export function formatGenerationPrice(price: GenerationCatalogPrice | null): string {
    if (!price) { return 'Cannot estimate'; }
    const values = Object.values(price.by_resolution);
    if (values.length === 0) { return 'Cannot estimate'; }
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const amount = minimum === maximum ? `$${minimum}/second` : `$${minimum}〜${maximum}/second`;
    return price.audio_multiplier === null ? amount : `${amount} (With audio ×${price.audio_multiplier})`;
}

export function formatGenerationAudio(audioOut: boolean | 'always'): string {
    return audioOut === 'always' ? 'Audio included (fixed)' : audioOut ? 'Audio included (optional)' : 'No audio';
}

export function generationOptionLabel(model: GenerationCatalogModel): string {
    const name = model.id === 'codex:image' ? 'ChatGPT' : model.family;
    return [name, model.id, formatGenerationPrice(model.price), formatGenerationAudio(model.audio_out), `as of ${model.as_of}`].join(' · ');
}

export interface GenerationOption { value: string; label: string; missing: boolean }

export function generationOptions(
    models: readonly GenerationCatalogModel[], kind: GenerationKind, current: string | null
): GenerationOption[] {
    // This default is not consumed by the still panel or the still CLI yet.
    const options = models.filter(model => model.kind === kind && !(kind === 'image' && model.id === 'fal:gpt-image-2.5-flare')).map(model => ({
        value: model.id, label: generationOptionLabel(model), missing: false
    }));
    if (typeof current === 'string' && current.trim() && !options.some(option => option.value === current)) {
        options.unshift({ value: current, label: `${current} · ${current === 'fal:gpt-image-2.5-flare' ? 'Not available in this view' : 'Not in the catalog'}`, missing: true });
    }
    return options;
}

export function generationSourceLabel(source: GenerationDefaultsSource): string {
    return source === 'project' ? 'Project' : source === 'workspace' ? 'Workspace' : 'Default';
}
