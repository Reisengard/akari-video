import { GENERATION_CAMERA_MOVES, type GenerationDraft } from './generation-fields';

export interface ProvenanceRow { key: string; label: string; value: string; referencePath?: string }
export interface GenerationProvenance {
    kind: 'video' | 'image' | 'audio';
    modelId?: string;
    rows: ProvenanceRow[];
}

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any> : {};
const filled = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
const amount = (value: unknown): string | undefined => typeof value === 'number' && Number.isFinite(value)
    ? String(value) : undefined;
const seconds = (value: unknown): string | undefined => amount(value) ? `${amount(value)} sec` : undefined;
const elapsedSeconds = (value: unknown): string | undefined => typeof value === 'number' && Number.isFinite(value)
    ? value < 1 ? 'under 1 sec' : `${Math.round(value)} sec` : undefined;
const localDateTime = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (part: number): string => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fileName = (path: string): string => path.replace(/\\/gu, '/').split('/').pop() || path;

/** A sidecar is historical evidence. Ignore next and every non-done record. */
export function generationProvenance(meta: unknown, modelName?: (id: string) => string,
    voiceName?: (id: string, engineId: string | undefined) => string | undefined): GenerationProvenance | undefined {
    const source = record(meta);
    if (source.status !== 'done' || !['video', 'image', 'still', 'audio'].includes(source.kind)) return undefined;
    const kind = source.kind === 'still' ? 'image' : source.kind as GenerationProvenance['kind'];
    const inputs = record(source.inputs);
    const output = record(source.output);
    const result = record(source.result);
    const cost = record(source.cost);
    const job = record(source.job);
    const model = record(source.model);
    const provenance = record(source.provenance);
    const rows: ProvenanceRow[] = [];
    const add = (key: string, label: string, value: string | undefined, referencePath?: string): void => {
        if (value !== undefined) rows.push({ key, label, value, ...(referencePath ? { referencePath } : {}) });
    };
    const modelId = filled(model.id);
    add('model', 'Model', modelId && (modelName?.(modelId) ?? modelId));
    add('prompt', kind === 'audio' ? 'Script' : 'Prompt', filled(inputs.prompt) ?? filled(inputs.script) ?? filled(inputs.text));
    add('negative-prompt', 'Negative prompt', filled(inputs.negative_prompt));
    const camera = filled(record(inputs.camera).value);
    add('camera', 'Camera move', camera && (GENERATION_CAMERA_MOVES.find(move =>
        move.bracket === camera || move.prose === camera)?.label ?? camera));
    for (const [key, label] of [['first_frame', 'First frame'], ['last_frame', 'Last frame'],
        ['source_video', 'Source video']] as const) {
        const path = filled(record(inputs[key]).path);
        add(key, label, path && fileName(path), path);
    }
    for (const [key, label] of [['reference_images', 'Reference images'], ['reference_videos', 'Reference videos'],
        ['reference_audios', 'Reference audio']] as const) {
        if (!Array.isArray(inputs[key])) continue;
        inputs[key].forEach((entry: unknown, index: number) => {
            const path = filled(record(entry).path);
            add(`${key}-${index}`, label, path && fileName(path), path);
        });
    }
    add('duration', 'Generated length', seconds(output.duration_s));
    add('actual-duration', 'Actual length', seconds(result.duration_s_actual));
    add('resolution', 'Resolution', filled(output.resolution)
        ?? (amount(result.width) && amount(result.height) ? `${result.width}×${result.height}` : undefined));
    add('audio-out', 'Audio', typeof result.has_audio === 'boolean' ? result.has_audio ? 'Yes' : 'No'
        : typeof output.audio_out === 'boolean' ? output.audio_out ? 'Yes' : 'No' : undefined);
    add('cost', 'Cost', amount(cost.estimate_usd) && `Estimate $${Number(cost.estimate_usd).toFixed(2)}${filled(model.as_of) ? ` · as_of ${model.as_of}` : ''}`);
    add('created', 'Created', localDateTime(filled(provenance.created_at) ?? filled(job.started_at)));
    add('elapsed', 'Elapsed', elapsedSeconds(result.elapsed_s ?? job.elapsed_s));
    const voiceId = filled(source.voice) ?? filled(inputs.voice) ?? filled(inputs.voice_id) ?? filled(inputs.voiceId);
    const engineId = filled(source.route) ?? modelId?.replace(/:tts$/u, '');
    add('voice', 'Voice', voiceId && (kind === 'audio' ? voiceName?.(voiceId, engineId) ?? voiceId : voiceId));
    return { kind, modelId, rows };
}

export function generationDraftFromDone(meta: unknown): GenerationDraft | undefined {
    const source = record(meta);
    const modelId = filled(record(source.model).id);
    return source.kind === 'video' && source.status === 'done' && modelId
        ? { modelId, inputs: { ...record(source.inputs) }, output: { ...record(source.output) } } : undefined;
}
