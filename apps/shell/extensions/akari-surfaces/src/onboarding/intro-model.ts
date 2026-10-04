import { OnboardingStep } from './model';

export function introVisual(step: OnboardingStep, busy = false): { hero: 'welcome' | 'before-after' | 'none'; brand: boolean } {
    if (busy) return { hero: 'none', brand: false };
    if (step === 'welcome') return { hero: 'welcome', brand: true };
    if (step === 'invite') return { hero: 'before-after', brand: false };
    return { hero: 'none', brand: false };
}

export const PREPARING_COPY = 'Preparing…';

export function inviteMarkup(busy: boolean, escapedError: string): string {
    if (busy) return `<p>${PREPARING_COPY}</p>`;
    return `<h2>Shall we make a video together?</h2><p>Add a title and captions to a sample video, then export it. About five minutes. You can stop at any time.</p>${escapedError ? `<p role="alert">${escapedError}</p>` : ''}<div class="ao-actions"><button class="primary" data-ao="start">${escapedError ? 'Try again' : 'Try it'}</button></div><div class="ao-secondary"><button data-ao="later">Start on my own later</button></div>`;
}
