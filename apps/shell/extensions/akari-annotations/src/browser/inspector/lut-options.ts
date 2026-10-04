import { INSPECTOR_LUT_PRESET_IDS } from './adjust-fields';

// Display names from the bundled LUT catalog (presets/luts/index.jsonl); ids stay on disk.
const BUNDLED_LUT_NAMES: Readonly<Record<string, string>> = {
    natural: 'Natural', cinematic: 'Cinematic', 'film-warm': 'Warm film',
    mono: 'Monochrome', 'silver-retain': 'Silver retention', 'vintage-fade': 'Vintage fade',
    'cool-clear': 'Cool clear', 'night-neon': 'Night neon',
    'forest-soft': 'Forest soft', 'sunset-gold': 'Sunset gold'
};

export function lutOptionLabel(value: string | undefined): string {
    return value?.startsWith('assets/luts/') ? `${value.slice('assets/luts/'.length)} (project)`
        : value ? BUNDLED_LUT_NAMES[value] ?? value : 'None';
}

export function buildLutOptions(projectRefs: readonly string[]): { label: string; value: string | null }[] {
    return [{ label: 'None', value: null }, ...[...INSPECTOR_LUT_PRESET_IDS, ...projectRefs]
        .map(value => ({ label: lutOptionLabel(value), value }))];
}
