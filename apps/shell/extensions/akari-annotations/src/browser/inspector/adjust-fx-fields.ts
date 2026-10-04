export type InspectorAdjustFxId = 'vignette' | 'blur' | 'grain' | 'sharpen' | 'glow' | 'clarity' | 'dehaze' | 'denoise' | 'motion_blur';
export type InspectorAdjustFx =
    | { id: 'vignette'; amount?: number; midpoint?: number; roundness?: number; feather?: number }
    | { id: 'blur'; px?: number }
    | { id: 'grain'; amount?: number; size?: number }
    | { id: 'sharpen'; amount?: number }
    | { id: 'glow'; intensity?: number; radius?: number; threshold?: number; warmth?: number }
    | { id: 'clarity'; amount?: number; radius?: number }
    | { id: 'dehaze'; amount?: number }
    | { id: 'denoise'; amount?: number }
    | { id: 'motion_blur'; px?: number; angle?: number };

export interface InspectorAdjustFxParam {
    key: string;
    label: string;
    min: number;
    max: number;
    default: number;
    step: number;
    unit: string;
    displayScale: number;
}

export const INSPECTOR_ADJUST_FX_MAX_ITEMS = 8;
export const INSPECTOR_ADJUST_FX: readonly {
    id: InspectorAdjustFxId; label: string; params: readonly InspectorAdjustFxParam[];
}[] = [
    { id: 'vignette', label: 'Vignette', params: [
        { key: 'amount', label: 'Amount', min: -1, max: 1, default: 0.5, step: 0.05, unit: '%', displayScale: 100 },
        { key: 'midpoint', label: 'Midpoint', min: 0, max: 1, default: 0.5, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'roundness', label: 'Roundness', min: -1, max: 1, default: 0, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'feather', label: 'Feather', min: 0, max: 1, default: 0.5, step: 0.01, unit: '%', displayScale: 100 }
    ] },
    { id: 'blur', label: 'Blur', params: [
        { key: 'px', label: 'Radius', min: 0, max: 50, default: 8, step: 1, unit: 'px', displayScale: 1 }
    ] },
    { id: 'grain', label: 'Film grain', params: [
        { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0.3, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'size', label: 'Size', min: 0.5, max: 4, default: 1, step: 0.1, unit: 'x', displayScale: 1 }
    ] },
    { id: 'sharpen', label: 'Sharpen', params: [
        { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0.5, step: 0.01, unit: '%', displayScale: 100 }
    ] },
    { id: 'glow', label: 'Glow', params: [
        { key: 'intensity', label: 'Intensity', min: 0, max: 1, default: 0.5, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'radius', label: 'Radius', min: 0, max: 100, default: 20, step: 1, unit: 'px', displayScale: 1 },
        { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: 0.7, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'warmth', label: 'Warmth', min: -1, max: 1, default: 0, step: 0.01, unit: '%', displayScale: 100 }
    ] },
    { id: 'clarity', label: 'Clarity', params: [
        { key: 'amount', label: 'Amount', min: -1, max: 1, default: 0.3, step: 0.01, unit: '%', displayScale: 100 },
        { key: 'radius', label: 'Radius', min: 1, max: 50, default: 10, step: 1, unit: 'px', displayScale: 1 }
    ] },
    { id: 'dehaze', label: 'Dehaze', params: [
        { key: 'amount', label: 'Amount', min: -1, max: 1, default: 0.3, step: 0.01, unit: '%', displayScale: 100 }
    ] },
    { id: 'denoise', label: 'Denoise', params: [
        { key: 'amount', label: 'Amount', min: 0, max: 1, default: 0.3, step: 0.01, unit: '%', displayScale: 100 }
    ] },
    { id: 'motion_blur', label: 'Motion blur', params: [
        { key: 'px', label: 'Length', min: 0, max: 100, default: 10, step: 1, unit: 'px', displayScale: 1 },
        { key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, step: 1, unit: '°', displayScale: 1 }
    ] }
];

function validParam(value: unknown, param: InspectorAdjustFxParam): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= param.min && value <= param.max;
}

/** 不正な要素と重複を捨て、既定値を省略した新しい配列を返す。 */
export function normalizeInspectorAdjustFx(raw: unknown): InspectorAdjustFx[] {
    if (!Array.isArray(raw)) return [];
    const result: InspectorAdjustFx[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const definition = INSPECTOR_ADJUST_FX.find(effect => effect.id === entry.id);
        if (!definition || result.some(effect => effect.id === entry.id)) continue;
        if (Object.keys(entry).some(key => key !== 'id' && !definition.params.some(param => param.key === key))
            || definition.params.some(param => Object.prototype.hasOwnProperty.call(entry, param.key) && !validParam(entry[param.key], param))) continue;
        const normalized: Record<string, unknown> = { id: definition.id };
        for (const param of definition.params) {
            if (Object.prototype.hasOwnProperty.call(entry, param.key) && entry[param.key] !== param.default) normalized[param.key] = entry[param.key];
        }
        result.push(normalized as InspectorAdjustFx);
        if (result.length === INSPECTOR_ADJUST_FX_MAX_ITEMS) break;
    }
    return result;
}

export function addInspectorAdjustFx(list: readonly InspectorAdjustFx[], id: string): InspectorAdjustFx[] {
    if (list.length >= INSPECTOR_ADJUST_FX_MAX_ITEMS) throw new Error('Up to 8 effects are allowed.');
    const definition = INSPECTOR_ADJUST_FX.find(effect => effect.id === id);
    if (!definition) throw new Error('Select an effect from the list.');
    const next = normalizeInspectorAdjustFx(list);
    if (next.some(effect => effect.id === id)) throw new Error('Each effect can be added only once.');
    return [...next, { id: definition.id }];
}

function assertIndex(list: readonly InspectorAdjustFx[], index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error('Select an effect.');
}

export function removeInspectorAdjustFx(list: readonly InspectorAdjustFx[], index: number): InspectorAdjustFx[] {
    const next = normalizeInspectorAdjustFx(list);
    assertIndex(next, index);
    next.splice(index, 1);
    return next;
}

export function updateInspectorAdjustFxParam(
    list: readonly InspectorAdjustFx[], index: number, key: string, value: number | null
): InspectorAdjustFx[] {
    const next = normalizeInspectorAdjustFx(list);
    assertIndex(next, index);
    const entry = next[index];
    const param = INSPECTOR_ADJUST_FX.find(effect => effect.id === entry.id)!.params.find(candidate => candidate.key === key);
    if (!param) throw new Error('This parameter is not supported for this effect.');
    if (value !== null && !validParam(value, param)) {
        throw new Error(`${param.label} must be between ${param.min * param.displayScale} and ${param.max * param.displayScale} ${param.unit}.`);
    }
    const updated = { ...entry } as Record<string, unknown>;
    if (value === null || value === param.default) delete updated[key];
    else updated[key] = value;
    next[index] = updated as InspectorAdjustFx;
    return next;
}

export function moveInspectorAdjustFx(list: readonly InspectorAdjustFx[], index: number, delta: number): InspectorAdjustFx[] {
    const next = normalizeInspectorAdjustFx(list);
    assertIndex(next, index);
    if (delta !== -1 && delta !== 1) throw new Error('Move the effect up or down.');
    const destination = index + delta;
    if (destination >= 0 && destination < next.length) {
        [next[index], next[destination]] = [next[destination], next[index]];
    }
    return next;
}

export function isInspectorAdjustFxIdentity(list: readonly InspectorAdjustFx[]): boolean {
    return list.length === 0;
}
