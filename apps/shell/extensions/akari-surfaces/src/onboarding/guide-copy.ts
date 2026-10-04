import { OnboardingState } from './model';

export const HELP_DELAY = { hint: 4000, next: 1500 } as const;

export interface GuideCopy { title: string; body: string }

export const MATERIAL_PREVIEW_SELECT_COPY: GuideCopy = {
    title: 'Click footage to preview it',
    body: '<p>Click the imported video.</p>'
};

export const CAPTION_GUIDE_COPY: readonly GuideCopy[] = [
    { title: 'Click captions to edit them in place', body: '<p>Select the captions below the video.</p>' },
    { title: 'Try changing the appearance', body: '<p>Try colors and other styles in the top menu. Continue when ready.</p>' },
    { title: 'You can move them too', body: '<p>Drag captions to move them up or down. Double-click to edit text.</p>' }
];

export const DAIHON_GUIDE_COPY: readonly GuideCopy[] = [
    { title: 'Read all captions in Script', body: '<p>Click the paper icon on the right rail to read all captions.</p>' },
    { title: 'Click this line', body: '<p>Click the first line in the script on the right to jump to that scene.</p>' },
    { title: 'Preview jumped to this scene',
        body: '<p>Double-click to edit text. Return to the AI partner using the top icon on the right rail.</p>' }
];

/** A hint is useful only when it adds a clue absent from the coach copy. */
export function guideWaitingHint(state: OnboardingState): string | undefined {
    if (state.step === 'matpreview' && state.sub === 0) return 'Click the sample video card on the left.';
    return undefined;
}

/** The escape button remains available even when repeating a hint would add nothing. */
export function guideOffersHelpNext(state: OnboardingState): boolean {
    if (guideWaitingHint(state)) return true;
    if (state.step === 'drag') return !state.imported;
    if (state.step === 'ask') return state.sub === 0;
    if (state.step === 'prompt') return !state.workCompleted && state.sub <= 1;
    if (state.step === 'export') return state.sub <= 2;
    if (state.step === 'play' || state.step === 'caption') return state.sub === 0;
    return state.step === 'daihon' && state.sub <= 1;
}
