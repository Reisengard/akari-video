import { describeNextDraft, type GenerationMetaV1 } from '@akari-video/edit-store';
import type { GenerationDraft, GenerationValidation } from './generation-fields';

export interface GenerationBatchItem {
    itemId: string;
    name: string;
    duration: number;
    start: number;
    track?: number;
    visual: boolean;
    sourcePath?: string;
    meta?: GenerationMetaV1;
    /** Effective video job state; a completed still is not a completed video. */
    state?: string;
    draft?: GenerationDraft;
    validation?: GenerationValidation;
}

export interface GenerationBatchRow extends GenerationBatchItem {
    eligible: boolean;
    badge: string;
    estimate: number | null;
}

export function buildGenerationBatch(items: readonly GenerationBatchItem[]): {
    rows: GenerationBatchRow[]; count: number; total: number; unknown: boolean; asOf: string; summary: string;
} {
    const rows = [...items].sort((a, b) => a.start - b.start || (a.track ?? 0) - (b.track ?? 0)).map(item => {
        let eligible = false;
        let badge: string;
        if (!item.visual) badge = 'Not eligible';
        else if (item.state === 'generating') badge = 'Generating';
        else if (item.state === 'stale') badge = 'No response (not eligible)';
        else if (item.state === 'done') badge = 'Generated';
        else if (item.state === 'orphan') badge = 'Input error (footage does not match)';
        else if (item.meta?.status === 'planned' && !describeNextDraft(item.meta)?.prompt.trim()) badge = 'Empty slot (no prompt)';
        else if (!describeNextDraft(item.meta)) {
            badge = item.meta?.status === 'planned' ? 'Empty slot (no prompt)' : 'Kept as image (not eligible)';
        } else if (!item.validation) badge = 'Checking estimate…';
        else if (!item.draft || !item.validation.ok) {
            const reason = item.validation.messages?.find(message => message.level === 'error')?.text
                ?? 'Check the video generation inputs';
            badge = `Input error (${reason.replace(/\s+/gu, ' ')})`;
        } else {
            eligible = true;
            badge = item.state === 'failed' ? 'Retry' : 'Generate video';
        }
        const value = item.validation?.cost?.estimate_usd;
        const estimate = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
        if (eligible) badge += ` · ${estimate === null ? 'Estimate unavailable' : `$${estimate.toFixed(2)}`}`;
        return { ...item, eligible, badge, estimate };
    });
    const targets = rows.filter(row => row.eligible);
    const total = targets.reduce((sum, row) => sum + (row.estimate ?? 0), 0);
    const unknown = targets.some(row => row.estimate === null);
    const asOf = [...new Set(targets.map(row => row.validation?.cost?.as_of ?? 'unknown'))].join(' / ') || 'unknown';
    return { rows, count: targets.length, total, unknown, asOf,
        summary: `Videos to generate: ${targets.length} · ${unknown ? `some estimates unavailable (estimable part $${total.toFixed(2)})` : `total $${total.toFixed(2)}`}` };
}

export type GenerationBatchProgress = 'Waiting' | 'Generating' | 'Done' | 'Failed' | 'Stopped';

/** Start may return a job handle immediately; wait must settle only once that job has ended. */
export async function executeGenerationBatch<T>(options: {
    rows: readonly GenerationBatchRow[];
    projectRootUri: string;
    approved: boolean;
    start: (request: { projectRootUri: string; itemId: string; approved: true }) => T | Promise<T>;
    wait: (handle: T) => Promise<{ ok: boolean; reason?: string }>;
    stopped: () => boolean;
    progress: (itemId: string, state: GenerationBatchProgress, reason?: string) => void;
}): Promise<void> {
    if (options.approved !== true) return;
    // Copy the approved queue: selection changes cannot mutate it.
    const targets = [...options.rows].filter(row => row.eligible)
        .sort((a, b) => a.start - b.start || (a.track ?? 0) - (b.track ?? 0));
    for (const row of targets) options.progress(row.itemId, 'Waiting');
    for (const row of targets) {
        if (options.stopped()) {
            options.progress(row.itemId, 'Stopped');
            continue;
        }
        options.progress(row.itemId, 'Generating');
        try {
            const handle = await options.start({ projectRootUri: options.projectRootUri, itemId: row.itemId, approved: true });
            const result = await options.wait(handle);
            options.progress(row.itemId, result.ok ? 'Done' : 'Failed', result.reason);
        } catch (error) {
            options.progress(row.itemId, 'Failed', error instanceof Error ? error.message : String(error));
        }
    }
}
