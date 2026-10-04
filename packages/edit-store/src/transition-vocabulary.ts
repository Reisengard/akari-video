/**
 * edit.json の transition_out.type に使える正準語彙。
 * JSON Schema はリテラル enum を保つため別置きだが、drift test でこの表と一致させる。
 */
export const TRANSITION_VOCABULARY = [
    { id: 'dissolve', xfadeName: 'dissolve', labelJa: 'Dissolve', category: 'Fade', previewKind: 'dissolve', glyph: 'D' },
    { id: 'fade', xfadeName: 'fade', labelJa: 'Crossfade', category: 'Fade', previewKind: 'fade', glyph: 'F' },
    { id: 'fade-black', xfadeName: 'fadeblack', labelJa: 'Fade to black', category: 'Fade', previewKind: 'fade-black', glyph: 'B' },
    { id: 'fade-white', xfadeName: 'fadewhite', labelJa: 'Fade to white', category: 'Fade', previewKind: 'fade-white', glyph: 'W' },
    { id: 'fade-grays', xfadeName: 'fadegrays', labelJa: 'Fade to gray', category: 'Fade', previewKind: 'fade-grays', glyph: 'G' },
    { id: 'wipe-left', xfadeName: 'wipeleft', labelJa: 'Wipe left', category: 'Wipe', previewKind: 'wipe-left', glyph: '←' },
    { id: 'wipe-right', xfadeName: 'wiperight', labelJa: 'Wipe right', category: 'Wipe', previewKind: 'wipe-right', glyph: '→' },
    { id: 'wipe-up', xfadeName: 'wipeup', labelJa: 'Wipe up', category: 'Wipe', previewKind: 'wipe-up', glyph: '↑' },
    { id: 'wipe-down', xfadeName: 'wipedown', labelJa: 'Wipe down', category: 'Wipe', previewKind: 'wipe-down', glyph: '↓' },
    { id: 'radial', xfadeName: 'radial', labelJa: 'Clock wipe', category: 'Wipe', previewKind: 'radial', glyph: '◷' },
    { id: 'slide-left', xfadeName: 'slideleft', labelJa: 'Slide left', category: 'Slide', previewKind: 'slide-left', glyph: '←' },
    { id: 'slide-right', xfadeName: 'slideright', labelJa: 'Slide right', category: 'Slide', previewKind: 'slide-right', glyph: '→' },
    { id: 'slide-up', xfadeName: 'slideup', labelJa: 'Slide up', category: 'Slide', previewKind: 'slide-up', glyph: '↑' },
    { id: 'slide-down', xfadeName: 'slidedown', labelJa: 'Slide down', category: 'Slide', previewKind: 'slide-down', glyph: '↓' },
    { id: 'cover-left', xfadeName: 'coverleft', labelJa: 'Cover left', category: 'Cover', previewKind: 'cover-left', glyph: '←' },
    { id: 'cover-right', xfadeName: 'coverright', labelJa: 'Cover right', category: 'Cover', previewKind: 'cover-right', glyph: '→' },
    { id: 'cover-up', xfadeName: 'coverup', labelJa: 'Cover up', category: 'Cover', previewKind: 'cover-up', glyph: '↑' },
    { id: 'cover-down', xfadeName: 'coverdown', labelJa: 'Cover down', category: 'Cover', previewKind: 'cover-down', glyph: '↓' },
    { id: 'reveal-left', xfadeName: 'revealleft', labelJa: 'Reveal left', category: 'Reveal', previewKind: 'reveal-left', glyph: '←' },
    { id: 'reveal-right', xfadeName: 'revealright', labelJa: 'Reveal right', category: 'Reveal', previewKind: 'reveal-right', glyph: '→' },
    { id: 'reveal-down', xfadeName: 'revealdown', labelJa: 'Reveal from top', category: 'Reveal', previewKind: 'reveal-down', glyph: '↓' },
    { id: 'reveal-up', xfadeName: 'revealup', labelJa: 'Reveal from bottom', category: 'Reveal', previewKind: 'reveal-up', glyph: '↑' },
    { id: 'circle-open', xfadeName: 'circleopen', labelJa: 'Circle open', category: 'Shape', previewKind: 'circle-open', glyph: '○' },
    { id: 'circle-close', xfadeName: 'circleclose', labelJa: 'Circle close', category: 'Shape', previewKind: 'circle-close', glyph: '●' },
    { id: 'zoom-in', xfadeName: 'zoomin', labelJa: 'Zoom in', category: 'Transform', previewKind: 'zoom-in', glyph: '＋' },
    { id: 'squeeze-h', xfadeName: 'squeezeh', labelJa: 'Squeeze vertical', category: 'Transform', previewKind: 'squeeze-h', glyph: '↕' },
    { id: 'squeeze-v', xfadeName: 'squeezev', labelJa: 'Squeeze horizontal', category: 'Transform', previewKind: 'squeeze-v', glyph: '↔' },
    { id: 'blur', xfadeName: 'hblur', labelJa: 'Blur', category: 'Texture', previewKind: 'blur', glyph: 'B' },
    { id: 'pixelize', xfadeName: 'pixelize', labelJa: 'Pixelate', category: 'Texture', previewKind: 'pixelize', glyph: 'P' }
] as const;

export type TransitionDefinition = typeof TRANSITION_VOCABULARY[number];
export type TransitionType = TransitionDefinition['id'];
export type TransitionCategory = TransitionDefinition['category'];
export type TransitionPreviewKind = TransitionDefinition['previewKind'];
declare const unknownTransitionTypeBrand: unique symbol;
/** 読み取り側だけが保持する、schema より先行した未知種別。書き込み API には使わない。 */
export type UnknownTransitionType = string & { readonly [unknownTransitionTypeBrand]: true };
export type ReadableTransitionType = TransitionType | UnknownTransitionType;

export const TRANSITION_TYPE_IDS: readonly TransitionType[] =
    TRANSITION_VOCABULARY.map(entry => entry.id);

export const TRANSITION_CATEGORIES: readonly TransitionCategory[] =
    [...new Set(TRANSITION_VOCABULARY.map(entry => entry.category))];

export const TRANSITION_BY_ID: Readonly<Record<TransitionType, TransitionDefinition>> =
    Object.fromEntries(TRANSITION_VOCABULARY.map(entry => [entry.id, entry])) as
        unknown as Readonly<Record<TransitionType, TransitionDefinition>>;

export function isTransitionType(value: unknown): value is TransitionType {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TRANSITION_BY_ID, value);
}
