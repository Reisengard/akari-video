/**
 * edit.json の transition_out.type に使える正準語彙。
 * JSON Schema はリテラル enum を保つため別置きだが、drift test でこの表と一致させる。
 */
export declare const TRANSITION_VOCABULARY: readonly [{
    readonly id: "dissolve";
    readonly xfadeName: "dissolve";
    readonly labelJa: "Dissolve";
    readonly category: "Fade";
    readonly previewKind: "dissolve";
    readonly glyph: "D";
}, {
    readonly id: "fade";
    readonly xfadeName: "fade";
    readonly labelJa: "Crossfade";
    readonly category: "Fade";
    readonly previewKind: "fade";
    readonly glyph: "F";
}, {
    readonly id: "fade-black";
    readonly xfadeName: "fadeblack";
    readonly labelJa: "Fade to black";
    readonly category: "Fade";
    readonly previewKind: "fade-black";
    readonly glyph: "B";
}, {
    readonly id: "fade-white";
    readonly xfadeName: "fadewhite";
    readonly labelJa: "Fade to white";
    readonly category: "Fade";
    readonly previewKind: "fade-white";
    readonly glyph: "W";
}, {
    readonly id: "fade-grays";
    readonly xfadeName: "fadegrays";
    readonly labelJa: "Fade to gray";
    readonly category: "Fade";
    readonly previewKind: "fade-grays";
    readonly glyph: "G";
}, {
    readonly id: "wipe-left";
    readonly xfadeName: "wipeleft";
    readonly labelJa: "Wipe left";
    readonly category: "Wipe";
    readonly previewKind: "wipe-left";
    readonly glyph: "←";
}, {
    readonly id: "wipe-right";
    readonly xfadeName: "wiperight";
    readonly labelJa: "Wipe right";
    readonly category: "Wipe";
    readonly previewKind: "wipe-right";
    readonly glyph: "→";
}, {
    readonly id: "wipe-up";
    readonly xfadeName: "wipeup";
    readonly labelJa: "Wipe up";
    readonly category: "Wipe";
    readonly previewKind: "wipe-up";
    readonly glyph: "↑";
}, {
    readonly id: "wipe-down";
    readonly xfadeName: "wipedown";
    readonly labelJa: "Wipe down";
    readonly category: "Wipe";
    readonly previewKind: "wipe-down";
    readonly glyph: "↓";
}, {
    readonly id: "radial";
    readonly xfadeName: "radial";
    readonly labelJa: "Clock wipe";
    readonly category: "Wipe";
    readonly previewKind: "radial";
    readonly glyph: "◷";
}, {
    readonly id: "slide-left";
    readonly xfadeName: "slideleft";
    readonly labelJa: "Slide left";
    readonly category: "Slide";
    readonly previewKind: "slide-left";
    readonly glyph: "←";
}, {
    readonly id: "slide-right";
    readonly xfadeName: "slideright";
    readonly labelJa: "Slide right";
    readonly category: "Slide";
    readonly previewKind: "slide-right";
    readonly glyph: "→";
}, {
    readonly id: "slide-up";
    readonly xfadeName: "slideup";
    readonly labelJa: "Slide up";
    readonly category: "Slide";
    readonly previewKind: "slide-up";
    readonly glyph: "↑";
}, {
    readonly id: "slide-down";
    readonly xfadeName: "slidedown";
    readonly labelJa: "Slide down";
    readonly category: "Slide";
    readonly previewKind: "slide-down";
    readonly glyph: "↓";
}, {
    readonly id: "cover-left";
    readonly xfadeName: "coverleft";
    readonly labelJa: "Cover left";
    readonly category: "Cover";
    readonly previewKind: "cover-left";
    readonly glyph: "←";
}, {
    readonly id: "cover-right";
    readonly xfadeName: "coverright";
    readonly labelJa: "Cover right";
    readonly category: "Cover";
    readonly previewKind: "cover-right";
    readonly glyph: "→";
}, {
    readonly id: "cover-up";
    readonly xfadeName: "coverup";
    readonly labelJa: "Cover up";
    readonly category: "Cover";
    readonly previewKind: "cover-up";
    readonly glyph: "↑";
}, {
    readonly id: "cover-down";
    readonly xfadeName: "coverdown";
    readonly labelJa: "Cover down";
    readonly category: "Cover";
    readonly previewKind: "cover-down";
    readonly glyph: "↓";
}, {
    readonly id: "reveal-left";
    readonly xfadeName: "revealleft";
    readonly labelJa: "Reveal left";
    readonly category: "Reveal";
    readonly previewKind: "reveal-left";
    readonly glyph: "←";
}, {
    readonly id: "reveal-right";
    readonly xfadeName: "revealright";
    readonly labelJa: "Reveal right";
    readonly category: "Reveal";
    readonly previewKind: "reveal-right";
    readonly glyph: "→";
}, {
    readonly id: "reveal-down";
    readonly xfadeName: "revealdown";
    readonly labelJa: "Reveal from top";
    readonly category: "Reveal";
    readonly previewKind: "reveal-down";
    readonly glyph: "↓";
}, {
    readonly id: "reveal-up";
    readonly xfadeName: "revealup";
    readonly labelJa: "Reveal from bottom";
    readonly category: "Reveal";
    readonly previewKind: "reveal-up";
    readonly glyph: "↑";
}, {
    readonly id: "circle-open";
    readonly xfadeName: "circleopen";
    readonly labelJa: "Circle open";
    readonly category: "Shape";
    readonly previewKind: "circle-open";
    readonly glyph: "○";
}, {
    readonly id: "circle-close";
    readonly xfadeName: "circleclose";
    readonly labelJa: "Circle close";
    readonly category: "Shape";
    readonly previewKind: "circle-close";
    readonly glyph: "●";
}, {
    readonly id: "zoom-in";
    readonly xfadeName: "zoomin";
    readonly labelJa: "Zoom in";
    readonly category: "Transform";
    readonly previewKind: "zoom-in";
    readonly glyph: "＋";
}, {
    readonly id: "squeeze-h";
    readonly xfadeName: "squeezeh";
    readonly labelJa: "Squeeze vertical";
    readonly category: "Transform";
    readonly previewKind: "squeeze-h";
    readonly glyph: "↕";
}, {
    readonly id: "squeeze-v";
    readonly xfadeName: "squeezev";
    readonly labelJa: "Squeeze horizontal";
    readonly category: "Transform";
    readonly previewKind: "squeeze-v";
    readonly glyph: "↔";
}, {
    readonly id: "blur";
    readonly xfadeName: "hblur";
    readonly labelJa: "Blur";
    readonly category: "Texture";
    readonly previewKind: "blur";
    readonly glyph: "B";
}, {
    readonly id: "pixelize";
    readonly xfadeName: "pixelize";
    readonly labelJa: "Pixelate";
    readonly category: "Texture";
    readonly previewKind: "pixelize";
    readonly glyph: "P";
}];
export type TransitionDefinition = typeof TRANSITION_VOCABULARY[number];
export type TransitionType = TransitionDefinition['id'];
export type TransitionCategory = TransitionDefinition['category'];
export type TransitionPreviewKind = TransitionDefinition['previewKind'];
declare const unknownTransitionTypeBrand: unique symbol;
/** 読み取り側だけが保持する、schema より先行した未知種別。書き込み API には使わない。 */
export type UnknownTransitionType = string & {
    readonly [unknownTransitionTypeBrand]: true;
};
export type ReadableTransitionType = TransitionType | UnknownTransitionType;
export declare const TRANSITION_TYPE_IDS: readonly TransitionType[];
export declare const TRANSITION_CATEGORIES: readonly TransitionCategory[];
export declare const TRANSITION_BY_ID: Readonly<Record<TransitionType, TransitionDefinition>>;
export declare function isTransitionType(value: unknown): value is TransitionType;
export {};
