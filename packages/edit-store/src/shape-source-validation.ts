import { parseShapePath } from './shape-geometry';

type RecordValue = Record<string, unknown>;
const oldKinds = new Set(['rect', 'rounded-rect', 'ellipse', 'line', 'arrow', 'speech-bubble']);
const kinds = new Set([...oldKinds, 'path', 'bubble']);
const capKinds = new Set(['none', 'triangle', 'chevron', 'bar', 'square', 'circle', 'diamond']);
const bubbleStyles = new Set(['ellipse', 'rounded', 'rect', 'jagged', 'burst', 'cloud', 'wobble']);
const paramsKeys = new Set([
    'width',
    'height',
    'fill',
    'stroke',
    'strokeWidth',
    'cornerRadius',
    'path',
    'preset',
    'dash',
    'startCap',
    'endCap',
    'startCapFilled',
    'endCapFilled',
    'lineCap',
    'style',
    'count',
    'depth',
    'jitter',
    'seed',
    'tail',
    'tailAngle',
    'tailLength',
    'tailWidth',
    'tailCurve',
]);
const hex = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/u;
const record = (v: unknown): v is RecordValue => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (path: string, message: string): never => {
    throw new Error(`edit.json v2 is invalid (${path}): ${message}`);
};
function requireRecord(value: unknown, path: string): asserts value is RecordValue {
    if (!record(value)) fail(path, 'Must be an object.');
}
const number = (v: unknown, min: number, max: number, integer = false): boolean =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
function assertKeys(value: RecordValue, allowed: Set<string>, path: string): void {
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, 'Unsupported key.');
}
function paint(value: unknown, path: string, v1: boolean): void {
    if (typeof value === 'string') {
        if (v1 && value !== 'none' && !hex.test(value)) fail(path, 'Must be #RRGGBB(AA) or none.');
        return;
    }
    requireRecord(value, path);
    assertKeys(value, new Set(['type', 'angle', 'stops']), path);
    if (value.type !== 'linear' && value.type !== 'radial') {
        fail(`${path}.type`, 'Must be linear or radial.');
    }
    if (value.type === 'linear' ? !number(value.angle, 0, 360) : 'angle' in value) {
        fail(`${path}.angle`, 'The angle is invalid.');
    }
    if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 5) {
        fail(`${path}.stops`, 'Must have 2 to 5 colors.');
    }
    const stops = value.stops as unknown[];
    let last = -1;
    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        requireRecord(stop, `${path}.stops[${i}]`);
        assertKeys(stop, new Set(['color', 'offset']), `${path}.stops[${i}]`);
        if (typeof stop.color !== 'string' || !hex.test(stop.color)) {
            fail(`${path}.stops[${i}].color`, 'The color is invalid.');
        }
        if (!number(stop.offset, 0, 1) || (stop.offset as number) < last) {
            fail(`${path}.stops[${i}].offset`, 'Positions must increase from 0 to 1.');
        }
        last = stop.offset as number;
    }
}

export function validateShapeSource(value: RecordValue, path: string): void {
    assertKeys(value, new Set(['kind', 'shape', 'params']), path);
    if (!kinds.has(value.shape as string)) fail(`${path}.shape`, 'Unsupported shape.');
    if (value.params === undefined) {
        if (value.shape === 'path') fail(`${path}.params.path`, 'A path is required.');
        return;
    }
    requireRecord(value.params, `${path}.params`);
    const p = value.params;
    assertKeys(p, paramsKeys, `${path}.params`);
    const v1 = value.shape === 'path' || value.shape === 'bubble' ||
        [
            'preset',
            'dash',
            'startCap',
            'endCap',
            'startCapFilled',
            'endCapFilled',
            'lineCap',
            'style',
            'count',
            'depth',
            'jitter',
            'seed',
            'tail',
            'tailAngle',
            'tailLength',
            'tailWidth',
            'tailCurve',
        ].some((k) => k in p) ||
        record(p.fill) || record(p.stroke);
    for (const key of ['width', 'height']) {
        if (key in p && !number(p[key], Number.MIN_VALUE, Infinity)) {
            fail(`${path}.params.${key}`, 'Must be a positive finite number.');
        }
    }
    if ('strokeWidth' in p && !number(p.strokeWidth, 0, v1 ? 100 : Infinity)) {
        fail(`${path}.params.strokeWidth`, 'Out of range.');
    }
    if ('cornerRadius' in p && !number(p.cornerRadius, 0, value.shape === 'path' ? 100 : Infinity)) {
        fail(`${path}.params.cornerRadius`, 'Out of range.');
    }
    for (const key of ['fill', 'stroke']) if (key in p) paint(p[key], `${path}.params.${key}`, v1);
    if ('preset' in p && (typeof p.preset !== 'string' || !p.preset.trim())) {
        fail(`${path}.params.preset`, 'An id is required.');
    }
    if ('path' in p || value.shape === 'path') {
        if (value.shape !== 'path') fail(`${path}.params.path`, 'Only a path type can hold this.');
        requireRecord(p.path, `${path}.params.path`);
        const pathValue = p.path;
        assertKeys(pathValue, new Set(['d', 'vb', 'rule']), `${path}.params.path`);
        if (
            typeof pathValue.d !== 'string' || !Array.isArray(pathValue.vb) || pathValue.vb.length !== 2 ||
            !pathValue.vb.every((n) => number(n, Number.MIN_VALUE, Infinity)) ||
            (pathValue.rule !== undefined && !['nonzero', 'evenodd'].includes(pathValue.rule as string))
        ) fail(`${path}.params.path`, 'The path is invalid.');
        try {
            parseShapePath(pathValue.d as string);
        } catch {
            fail(`${path}.params.path.d`, 'Absolute M/L/C/Z coordinates are required.');
        }
    }
    if (
        ['startCap', 'endCap', 'startCapFilled', 'endCapFilled', 'lineCap'].some((k) => k in p) &&
        !['line', 'arrow'].includes(value.shape as string)
    ) fail(`${path}.params`, 'Only a line or arrow can hold an end value.');
    if ('dash' in p && !['solid', 'dash', 'dot'].includes(p.dash as string)) {
        fail(`${path}.params.dash`, 'The line style is invalid.');
    }
    for (const key of ['startCap', 'endCap']) {
        if (key in p && !capKinds.has(p[key] as string)) {
            fail(`${path}.params.${key}`, 'The edge kind is invalid.');
        }
    }
    for (const key of ['startCapFilled', 'endCapFilled']) {
        if (key in p && typeof p[key] !== 'boolean') fail(`${path}.params.${key}`, 'Must be a boolean.');
    }
    if ('lineCap' in p && !['butt', 'round'].includes(p.lineCap as string)) {
        fail(`${path}.params.lineCap`, 'The edge shape is invalid.');
    }
    if (
        [
            'style',
            'count',
            'depth',
            'jitter',
            'seed',
            'tail',
            'tailAngle',
            'tailLength',
            'tailWidth',
            'tailCurve',
        ].some((k) => k in p) && value.shape !== 'bubble'
    ) fail(`${path}.params`, 'Only a bubble can hold a speech-bubble value.');
    if ('style' in p && !bubbleStyles.has(p.style as string)) {
        fail(`${path}.params.style`, 'The speech-bubble shape is invalid.');
    }
    if ('tail' in p && !['point', 'dots', 'none'].includes(p.tail as string)) {
        fail(`${path}.params.tail`, 'The tail is invalid.');
    }
    for (
        const key of ['count', 'depth', 'jitter', 'tailAngle', 'tailLength', 'tailWidth', 'tailCurve', 'seed']
    ) {
        if (key in p) {
            const range: [number, number, boolean] = key === 'count'
                ? [4, 48, true]
                : key === 'seed'
                ? [-2147483648, 2147483647, true]
                : key === 'tailCurve'
                ? [-100, 100, false]
                : key === 'tailAngle'
                ? [0, 360, false]
                : [0, 100, false];
            const [min, max, integer] = range;
            if (!number(p[key], min, max, integer)) fail(`${path}.params.${key}`, 'Out of range.');
        }
    }
}
