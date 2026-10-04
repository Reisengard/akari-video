import { TRANSITION_VOCABULARY, isTransitionType, type TransitionType } from '@akari-video/edit-store';
import type { InspectorWriteRequest, TimelineCutSelection } from '../timeline-selection-model';

const TRANSITION_UI_LABEL: Readonly<Record<string, string>> = Object.freeze({
    dissolve: 'Dissolve',
    fade: 'Crossfade',
    'fade-black': 'Fade through black',
    'fade-white': 'Fade through white',
    'fade-grays': 'Fade through gray',
    'wipe-left': 'Wipe left',
    'wipe-right': 'Wipe right',
    'wipe-up': 'Wipe up',
    'wipe-down': 'Wipe down',
    radial: 'Clock wipe',
    'slide-left': 'Slide left',
    'slide-right': 'Slide right',
    'slide-up': 'Slide up',
    'slide-down': 'Slide down',
    'cover-left': 'Cover left',
    'cover-right': 'Cover right',
    'cover-up': 'Cover up',
    'cover-down': 'Cover down',
    'reveal-left': 'Reveal left',
    'reveal-right': 'Reveal right',
    'reveal-down': 'Reveal from above',
    'reveal-up': 'Reveal from below',
    'circle-open': 'Circle open',
    'circle-close': 'Circle close',
    'zoom-in': 'Zoom in',
    'squeeze-h': 'Squeeze vertical',
    'squeeze-v': 'Squeeze horizontal',
    blur: 'Blur',
    pixelize: 'Pixelate'
});

const TRANSITION_UI_CATEGORY: Readonly<Record<string, string>> = Object.freeze({
    dissolve: 'Fade',
    fade: 'Fade',
    'fade-black': 'Fade',
    'fade-white': 'Fade',
    'fade-grays': 'Fade',
    'wipe-left': 'Wipe',
    'wipe-right': 'Wipe',
    'wipe-up': 'Wipe',
    'wipe-down': 'Wipe',
    radial: 'Wipe',
    'slide-left': 'Slide',
    'slide-right': 'Slide',
    'slide-up': 'Slide',
    'slide-down': 'Slide',
    'cover-left': 'Cover',
    'cover-right': 'Cover',
    'cover-up': 'Cover',
    'cover-down': 'Cover',
    'reveal-left': 'Reveal',
    'reveal-right': 'Reveal',
    'reveal-down': 'Reveal',
    'reveal-up': 'Reveal',
    'circle-open': 'Shape',
    'circle-close': 'Shape',
    'zoom-in': 'Transform',
    'squeeze-h': 'Transform',
    'squeeze-v': 'Transform',
    blur: 'Texture',
    pixelize: 'Texture'
});

export function transitionOptionLabel(id: string | undefined): string {
    return id === undefined ? 'None' : TRANSITION_UI_LABEL[id] ?? id;
}

export function transitionCategoryLabel(category: string): string {
    const member = TRANSITION_VOCABULARY.find(entry => entry.category === category);
    return member ? TRANSITION_UI_CATEGORY[member.id] ?? member.id : category;
}

export function transitionTypeForLabel(label: string): TransitionType | null | undefined {
    if (label === 'None') return null;
    const found = Object.entries(TRANSITION_UI_LABEL).find(([, text]) => text === label);
    return found ? found[0] as TransitionType : undefined;
}

export function createCutTransitionWriteRequest(
    snapshot: Pick<TimelineCutSelection, 'index' | 'transitionOut' | 'transitionOutBlocked'>,
    row: 'transition-type' | 'transition-duration',
    input: string | number | null
): Extract<InspectorWriteRequest, { kind: 'cut-transition-out' }> {
    if (snapshot.transitionOutBlocked !== undefined) throw new Error(snapshot.transitionOutBlocked);
    const type = row === 'transition-type' ? transitionTypeForLabel(String(input)) : snapshot.transitionOut?.type;
    if (type === null) return { kind: 'cut-transition-out', index: snapshot.index, value: null };
    if (!isTransitionType(type)) {
        throw new Error('Choose a supported transition.');
    }
    const duration = row === 'transition-type'
        ? snapshot.transitionOut?.duration ?? 0.5 : input === null ? 0.5 : Number(input);
    if (!Number.isFinite(duration) || duration < 0.1 || duration > 3) {
        throw new Error('Enter a transition duration from 0.1 to 3 seconds.');
    }
    return { kind: 'cut-transition-out', index: snapshot.index, value: { type, duration } };
}
