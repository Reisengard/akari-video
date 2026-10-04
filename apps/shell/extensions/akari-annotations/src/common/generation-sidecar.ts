import {
    describeNextDraft,
    GenerationMetaV1,
    GenerationState as GenerationStateV1,
    resolveGenerationState as resolveGenerationStateV1,
    sidecarPathFor
} from '@akari-video/edit-store';

export { sidecarPathFor };
export type GenerationState = GenerationStateV1 | 'planned-video';
export type GenerationSidecarMeta = GenerationMetaV1;

export interface GenerationBindingView {
    expected: string;
    actual: string | null;
    matches: boolean;
    source: 'result' | 'first_frame' | 'placeholder';
}

export interface GenerationChipDescription {
    badge: string;
    progress?: number;
    className: string;
    title: string;
}

/** 札の文字幅を保守的に見積もり、枠内に残せる表記を選ぶ。 */
export function generationChipLabel(badge: string, widthPx: number): string {
    const count = /^Candidates: (\d+)$/u.exec(badge)?.[1];
    const short = /^\d+ options · (\d+\/\d+)$/u.exec(badge)?.[1]
        ?? (count ? `${count}` : undefined)
        ?? /^Generating · (\d+s)$/u.exec(badge)?.[1]
        ?? /^Generating (\d+%)$/u.exec(badge)?.[1];
    const shortLabel = short ? `✦ ${short}` : '✦';
    const textWidth = (value: string): number => Array.from(value).reduce((width, char) =>
        width + (char === ' ' ? 2 : char.codePointAt(0)! < 0x80 ? 5 : char === '·' ? 5 : 9), 0);
    // ヘッダ余白・札の padding と、状態アイコンの幅を確保する。
    const available = Math.max(0, widthPx - 26);
    // 64px 未満では既存の container rule が文字を隠すため記号だけにする。
    if (widthPx >= 64 && textWidth(badge) <= available) return badge;
    if (widthPx >= 64 && textWidth(shortLabel) <= available) return shortLabel;
    return '✦';
}

/** 生成中の表示用に、元の枠の記録を保ったまま状態を一時的に進める。 */
export function markPlaceholderGenerating(meta: GenerationSidecarMeta, provider: string, at: string): GenerationSidecarMeta {
    return {
        ...meta,
        status: 'generating',
        job: { ...meta.job, provider, started_at: at, stale_after_s: 600 },
        history: [...(Array.isArray(meta.history) ? meta.history : []), { at, status: 'generating', reason: null }]
    };
}

/** 成功時は元の状態に戻し、処理した履歴を枠に残す。 */
export function finishPlaceholderGenerating(original: GenerationSidecarMeta,
    generating: GenerationSidecarMeta, at: string): GenerationSidecarMeta {
    return { ...original, history: [...(Array.isArray(generating.history) ? generating.history : []),
        { at, status: original.status, reason: null }] };
}

const TIMELINE_STATES = ['planned', 'generating', 'stale', 'done', 'failed'] as const;
export function resolveGenerationState(
    meta: GenerationSidecarMeta | undefined, nowMs: number, binding?: GenerationBindingView | null
): GenerationState {
    if (binding && binding.matches === false) return 'orphan';
    const state = resolveGenerationStateV1(meta, nowMs);
    if (!['generating', 'stale', 'failed'].includes(state) && describeNextDraft(meta)) return 'planned-video';
    // 契約外の status は 'none' に潰す＝従来の最小読み手と同じ見え方にする。
    return (TIMELINE_STATES as readonly string[]).includes(state) ? state : 'none';
}

function generationProgress(meta: GenerationSidecarMeta | undefined): number | undefined {
    const value = typeof meta?.progress === 'number' ? meta.progress
        : typeof meta?.job?.progress === 'number' ? meta.job.progress : undefined;
    return value !== undefined && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

export function describeGenerationChip(
    state: GenerationState, meta?: GenerationSidecarMeta, nowMs = Date.now()
): GenerationChipDescription {
    const progress = state === 'generating' ? generationProgress(meta) : undefined;
    const routes = Array.isArray(meta?.job?.routes) ? meta.job.routes.filter((route): route is string => typeof route === 'string') : [];
    const completed = typeof meta?.job?.completed === 'number' ? meta.job.completed : 0;
    const candidates = typeof meta?.job?.candidates === 'number' ? meta.job.candidates : 0;
    if (state === 'generating' && meta?.job?.provider === 'compare' && routes.length) {
        const badge = `${routes.length} options · ${completed}/${routes.length}`;
        return { badge, progress, className: 'akari-generation-generating', title: badge };
    }
    if (state !== 'generating' && candidates > 0) {
        const badge = `Candidates: ${candidates}`;
        return { badge, className: 'akari-generation-planned', title: badge };
    }
    if (state === 'planned-video') {
        const draft = describeNextDraft(meta);
        const variety = { prompt: 'prompt only', first: 'from image', 'first-last': 'first to last', references: 'from references' };
        return { badge: '▶ Planned video', className: 'akari-generation-planned-video',
            title: `Planned video (${variety[draft?.variety ?? 'prompt']})` };
    }
    if (state === 'planned') {
        if (meta?.kind === 'audio') {
            return { badge: 'Empty slot (audio)', className: 'akari-generation-planned-audio', title: 'Empty audio slot' };
        }
        const prompt = meta?.inputs?.prompt;
        return { badge: typeof prompt === 'string' && prompt.trim() ? 'Planned' : 'Empty slot',
            className: 'akari-generation-planned', title: 'Planned generation (no picture)' };
    }
    if (state === 'generating') {
        const startedMs = Date.parse(String(meta?.job?.started_at ?? ''));
        const elapsed = Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 1000)) : undefined;
        const badge = progress === undefined ? elapsed === undefined ? 'Generating' : `Generating · ${elapsed}s`
            : `Generating ${Math.round(progress)}%`;
        return { badge, progress, className: 'akari-generation-generating', title: badge };
    }
    if (state === 'stale') {
        return { badge: 'No response · retry', className: 'akari-generation-stale', title: 'The generation process is not responding' };
    }
    if (state === 'failed') {
        return { badge: 'Failed', className: 'akari-generation-failed', title: 'Generation failed · try again (cost approval in the right panel)' };
    }
    if (state === 'orphan') {
        return {
            badge: 'Orphaned', className: 'akari-generation-orphan',
            title: 'The footage changed (does not match the sha256 in meta)'
        };
    }
    if (state === 'done' && meta?.kind === 'video') {
        return { badge: 'Generated', className: 'akari-generation-done', title: 'Generated video' };
    }
    // none と done の still は完成品の静止画として見せる。
    return { badge: 'Still', className: 'akari-generation-none', title: 'Still' };
}
