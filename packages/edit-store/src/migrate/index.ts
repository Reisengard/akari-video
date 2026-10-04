/**
 * v0/v1 -> v2 凍結変換ユニット。
 *
 * 変換器は機能追加禁止・バグ修正のみ。未知ケースは「このプロジェクトは
 * 変換できません」と正直に止まる。将来 `akari-migrate` へそのまま切り出すため、
 * ファイル変換の意味論はこの 1 ファイルに閉じる。
 */

import { promises as fs } from 'fs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'path';
import { serializeCaptions, serializeEdit, serializeMotion } from '../canonical';
import { writeAtomic } from '../write-gate';
import { readEditV2 } from '../edit-v2';
import type { AudioMediaItemV2, EditV2, FilterV2, ItemV2, TrackV2 } from '../edit-v2';
import { GEOMETRY_SOURCE, normalizeGeometry, type DimensionsOf, type GeometryChange } from './geometry';
export { LegacyEditVersionError } from './error';
export { parseEdit } from './legacy-parse';
export type { EditParseOrigins } from './legacy-parse';
export {
    collectFitBasisCandidates,
    GEOMETRY_SOURCE,
    hasCutLayerStyleVisual,
    normalizeGeometry,
    round6
} from './geometry';
export type {
    DimensionsOf,
    FitBasisCandidate,
    GeometryChange,
    GeometryNormalizationResult,
    MediaDimensions
} from './geometry';

export type LegacyVersion = 0 | 1;

export interface MigrateChange {
    path: string;
    note: string;
}

export type MigrateResult =
    | { ok: true; version: LegacyVersion; doc: EditV2; changes: MigrateChange[]; warnings: string[] }
    | { ok: false; version: number; blockers: string[] };

export interface MigrationProposal {
    filePath: string;
    version: LegacyVersion;
    changes: MigrateChange[];
    warnings: string[];
    nextText: string;
    previousText: string;
    backupPath: string;
    captions?: {
        filePath: string;
        nextText: string;
        previousText: string;
        backupPath: string;
    };
}

export interface V2NormalizationProposal {
    filePath: string;
    version: 2;
    changes: MigrateChange[];
    warnings: string[];
    nextText: string;
    previousText: string;
    backupPath: string;
    captions?: {
        filePath: string;
        nextText: string;
        previousText: string;
        backupPath: string;
    };
    motion?: Array<{
        filePath: string;
        nextText: string;
        previousText: string;
        backupPath: string;
    }>;
}

export interface MigrationNoop extends V2NormalizationProposal {
    ok: true;
    noop: true;
    version: 2;
}

/** 幾何の統一 G1 の提案。`changes` は表示用の要約、`geometry` は焼き込みの実測値。 */
export interface GeometryNormalizationProposal extends V2NormalizationProposal {
    geometry: GeometryChange[];
}

export interface GeometryNormalizationNoop extends MigrationNoop {
    geometry: GeometryChange[];
}

export interface MigrationBlocked {
    ok: false;
    version: number;
    blockers: string[];
}

type RecordValue = Record<string, unknown>;

interface LegacyTrackDef {
    id: string;
    kind: 'cuts' | 'layers' | 'overlays' | 'captions' | 'audio';
    ref?: number;
    label?: string;
}

interface PendingItem {
    kind: LegacyTrackDef['kind'];
    ref: number;
    item: ItemV2 | AudioMediaItemV2;
}

interface LegacyAudioTrackRefs {
    sfx: number[];
    narration?: number;
    bgm?: number;
    all: number[];
}

const TOP_KEYS = new Set([
    'version', 'output', 'source', 'sources', 'cuts', 'overlays', 'layers', 'audio', 'captions', 'timeline',
    'thumbnail', 'emphasis_words'
]);
const CUT_KEYS = new Set([
    'id', 'src', 'in', 'out', 'at', 'track', 'crop', 'transform', 'opacity', 'framing',
    'transition_out', 'freeze', 'fx', 'speed', 'chroma_key'
]);
const OVERLAY_KEYS = new Set(['id', 'html', 'start', 'duration', 'vars', 'transform', 'track']);
const LAYER_KEYS = new Set([
    'id', 't', 'duration', 'kind', 'src', 'in', 'speed', 'transform', 'crop', 'perspective', 'opacity',
    'keyframes', 'preset', 'params', 'track', 'blend', 'chroma_key', 'filter', 'mask'
]);
const AUDIO_ENVELOPE_KEYS = ['keyframes', 'ducking', 'duck_db', 'duck_attack', 'duck_release'];
const AUDIO_CLIP_FX_KEYS = ['speed', 'pitch_semitones', 'formant', 'denoise', 'lowcut_hz'];
const SFX_KEYS = new Set(['id', 't', 'path', 'track', 'gain_db', 'in', 'out', 'fade_in', 'fade_out', ...AUDIO_ENVELOPE_KEYS, ...AUDIO_CLIP_FX_KEYS]);
const NARRATION_KEYS = new Set(['id', 't', 'path', 'track', 'gain_db', 'in', 'out', 'script', 'reading', 'provenance', ...AUDIO_ENVELOPE_KEYS, ...AUDIO_CLIP_FX_KEYS]);
const BGM_KEYS = new Set(['id', 'path', 'in', 'fadeIn', 'fadeOut', 'gain_db', ...AUDIO_ENVELOPE_KEYS, ...AUDIO_CLIP_FX_KEYS]);

export function detectEditVersion(raw: unknown): number | undefined {
    return isRecord(raw) && typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? raw.version : undefined;
}

/** captions.json / legacy captions[] に描画対象の cue が 1 件以上あるかを判定する。 */
export function captionsHaveRenderableCues(root: unknown): boolean {
    const cues = Array.isArray(root)
        ? root
        : isRecord(root) && Array.isArray(root.captions) ? root.captions : [];
    return cues.some(cue => isRecord(cue) && (nonEmpty(cue.text) || nonEmpty(cue.display_text)));
}

export function migrateEditToV2(raw: unknown, options: { hasCaptions?: boolean } = {}): MigrateResult {
    const version = detectEditVersion(raw);
    if (version === 2) {
        return { ok: false, version, blockers: ['edit.json is already version 2. It will not be converted again.'] };
    }
    if (version !== 0 && version !== 1) {
        return { ok: false, version: version ?? -1, blockers: ['edit.json.version is not 0 or 1.'] };
    }
    if (!isRecord(raw)) {
        return { ok: false, version, blockers: ['The edit.json root is not an object.'] };
    }

    const blockers: string[] = [];
    rejectUnknownKeys(raw, TOP_KEYS, 'edit.json', blockers);
    if (hasOwn(raw, 'tracks')) {
        blockers.push('edit.json.tracks (legacy trackState) cannot be converted to v2 uniquely.');
    }
    const output = isRecord(raw.output) ? raw.output : undefined;
    const fps = output?.fps;
    if (!output || !positive(output.width) || !positive(output.height)) {
        blockers.push('edit.json.output.width and height must be numbers greater than 0.');
    }
    if (!Number.isInteger(fps) || (fps as number) <= 0) {
        blockers.push('edit.json.output.fps must be an integer of 1 or greater before conversion to v2.');
    }
    if (blockers.length > 0) return { ok: false, version, blockers };

    const frameRate = fps as number;
    const sources: Array<Record<string, unknown>> = [];
    if (version === 0) {
        if (!isRecord(raw.source) || !nonEmpty(raw.source.path)) {
            blockers.push('version 0 edit.json.source.path is missing.');
        } else {
            sources.push({
                id: 'main', path: raw.source.path,
                ...(hasOwn(raw.source, 'proxy') ? { proxy: raw.source.proxy } : {}),
                ...(hasOwn(raw.source, 'chroma_key') ? { chroma_key: clone(raw.source.chroma_key) } : {})
            });
        }
    } else if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
        blockers.push('version 1 edit.json.sources[] is missing.');
    } else {
        const ids = new Set<string>();
        raw.sources.forEach((source, index) => {
            if (!isRecord(source) || !nonEmpty(source.id) || !nonEmpty(source.path)) {
                blockers.push(`edit.json.sources[${index}] id / path is invalid.`);
                return;
            }
            if (ids.has(source.id)) blockers.push(`Duplicate edit.json.sources[].id: ${source.id}`);
            ids.add(source.id);
            sources.push({
                id: source.id, path: source.path,
                ...(hasOwn(source, 'proxy') ? { proxy: source.proxy } : {}),
                ...(hasOwn(source, 'chroma_key') ? { chroma_key: clone(source.chroma_key) } : {})
            });
        });
    }
    if (blockers.length > 0) return { ok: false, version, blockers };

    const sourceIds = new Set(sources.map(source => String(source.id)));
    const sourceIdByPath = new Map(sources.map(source => [String(source.path), String(source.id)]));
    const pending: PendingItem[] = [];
    const usedItemIds = new Set<string>();
    const cuts = arrayOrEmpty(raw.cuts, 'edit.json.cuts', blockers);
    const cursorByTrack = new Map<number, number>();
    const previousCutByTrack = new Map<number, RecordValue>();
    cuts.forEach((value, index) => {
        if (!isRecord(value)) {
            blockers.push(`edit.json.cuts[${index}] is not an object.`);
            return;
        }
        rejectUnknownKeys(value, CUT_KEYS, `edit.json.cuts[${index}]`, blockers);
        const src = version === 0 ? 'main' : value.src;
        if (!nonEmpty(src) || !sourceIds.has(src)) {
            blockers.push(`edit.json.cuts[${index}].src does not reference sources[].`);
            return;
        }
        if (!nonNegative(value.in) || !positive(value.out) || (value.out as number) <= (value.in as number)) {
            blockers.push(`edit.json.cuts[${index}] does not satisfy 0 <= in < out.`);
            return;
        }
        const track = trackOf(value.track);
        const speed = positive(value.speed) ? value.speed as number : 1;
        const baseDuration = ((value.out as number) - (value.in as number)) / speed;
        const freezeDuration = isRecord(value.freeze) && positive(value.freeze.duration_sec)
            ? value.freeze.duration_sec as number : 0;
        const previous = previousCutByTrack.get(track);
        const transitionOverlap = value.at === undefined && previous && isRecord(previous.transition_out)
            && positive(previous.transition_out.duration) ? previous.transition_out.duration as number : 0;
        const atSeconds = nonNegative(value.at)
            ? value.at as number : (cursorByTrack.get(track) ?? 0) - transitionOverlap;
        const durationSeconds = baseDuration + freezeDuration;
        cursorByTrack.set(track, atSeconds + durationSeconds);
        previousCutByTrack.set(track, value);
        const source: RecordValue = {
            kind: 'media', src, in: value.in, out: value.out,
            ...copyPresent(value, ['framing', 'transition_out', 'freeze', 'fx', 'speed', 'chroma_key'])
        };
        pending.push({
            kind: 'cuts', ref: track,
            item: {
                id: uniqueId(nonEmpty(value.id) ? value.id : `cut-${index + 1}`, usedItemIds),
                ...frameRange(atSeconds, durationSeconds, frameRate),
                ...copyPresent(value, ['transform', 'opacity', 'crop']),
                source
            } as unknown as ItemV2
        });
    });

    const overlays = arrayOrEmpty(raw.overlays, 'edit.json.overlays', blockers);
    overlays.forEach((value, index) => {
        if (!isRecord(value)) {
            blockers.push(`edit.json.overlays[${index}] is not an object.`);
            return;
        }
        rejectUnknownKeys(value, OVERLAY_KEYS, `edit.json.overlays[${index}]`, blockers);
        if (!nonEmpty(value.html) || !nonNegative(value.start) || !positive(value.duration)) {
            blockers.push(`edit.json.overlays[${index}] html / start / duration is invalid.`);
            return;
        }
        pending.push({
            kind: 'overlays', ref: trackOf(value.track),
            item: {
                id: uniqueId(nonEmpty(value.id) ? value.id : `overlay-${index + 1}`, usedItemIds),
                ...frameRange(value.start, value.duration, frameRate),
                ...copyPresent(value, ['transform']),
                source: { kind: 'html', path: value.html, ...copyPresent(value, ['vars']) }
            } as unknown as ItemV2
        });
    });

    const layers = arrayOrEmpty(raw.layers, 'edit.json.layers', blockers);
    let layerSourceSerial = 1;
    layers.forEach((value, index) => {
        if (!isRecord(value)) {
            blockers.push(`edit.json.layers[${index}] is not an object.`);
            return;
        }
        rejectUnknownKeys(value, LAYER_KEYS, `edit.json.layers[${index}]`, blockers);
        if (!['video', 'image', 'baked', 'filter'].includes(String(value.kind))) {
            blockers.push(`edit.json.layers[${index}].kind must be video, image, baked, or filter.`);
            return;
        }
        if (value.kind !== 'filter' && hasOwn(value, 'filter')) {
            blockers.push(`edit.json.layers[${index}].filter, a filter attached directly to a picture layer, has no v2 equivalent and cannot be converted.`);
            return;
        }
        if (!nonNegative(value.t) || !positive(value.duration)) {
            blockers.push(`edit.json.layers[${index}] t / duration is invalid.`);
            return;
        }
        let source: RecordValue;
        let mask: string | undefined;
        if (value.kind === 'filter') {
            const forbidden = ['src', 'in', 'speed', 'chroma_key', 'blend', 'crop', 'transform', 'mask'].filter(key => hasOwn(value, key));
            if (forbidden.length > 0) {
                blockers.push(`edit.json.layers[${index}]: kind filter cannot have ${forbidden.join(' / ')}.`);
                return;
            }
            source = { kind: 'filter', filter: clone(value.filter) as FilterV2 };
        } else if (!nonEmpty(value.src)) {
            blockers.push(`edit.json.layers[${index}].src is invalid.`);
            return;
        } else if (value.kind === 'baked' && nonEmpty(value.preset)) {
            if (hasOwn(value, 'in') || hasOwn(value, 'speed')) {
                blockers.push(`edit.json.layers[${index}] in / speed cannot be converted to a baked telop.`);
                return;
            }
            if (hasOwn(value, 'mask')) {
                blockers.push(`edit.json.layers[${index}].mask cannot be converted to a baked telop.`);
                return;
            }
            source = {
                kind: 'telop', preset: value.preset,
                ...copyPresent(value, ['params']), baked: value.src
            };
        } else {
            if ((hasOwn(value, 'in') && !nonNegative(value.in))
                || (hasOwn(value, 'speed') && !positive(value.speed))) {
                blockers.push(`edit.json.layers[${index}] in / speed is invalid.`);
                return;
            }
            const sourceIn = hasOwn(value, 'in') ? value.in as number : 0;
            const speed = hasOwn(value, 'speed') ? value.speed as number : 1;
            let src = sourceIdByPath.get(value.src);
            if (!src) {
                do src = `l-${layerSourceSerial++}`; while (sourceIds.has(src));
                sourceIds.add(src);
                sourceIdByPath.set(value.src, src);
                sources.push({ id: src, path: value.src, proxy: null });
            }
            source = {
                kind: 'media', src, in: sourceIn, out: sourceIn + (value.duration as number) * speed,
                ...copyPresent(value, ['speed', 'chroma_key'])
            };
            if (hasOwn(value, 'mask')) {
                if (!nonEmpty(value.mask)) {
                    blockers.push(`edit.json.layers[${index}].mask is invalid.`);
                    return;
                }
                mask = sourceIdByPath.get(value.mask);
                if (!mask) {
                    blockers.push(`edit.json.layers[${index}].mask does not reference sources[].path: ${value.mask}`);
                    return;
                }
            }
        }
        const keyframes = Array.isArray(value.keyframes)
            ? value.keyframes.map((entry, keyframeIndex) => {
                if (!isRecord(entry) || !nonNegative(entry.t)) {
                    blockers.push(`edit.json.layers[${index}].keyframes[${keyframeIndex}].t is invalid.`);
                    return { t: 0 };
                }
                return { ...clone(entry), t: Math.round((entry.t as number) * frameRate) };
            }) : undefined;
        pending.push({
            kind: 'layers', ref: trackOf(value.track),
            item: {
                id: uniqueId(nonEmpty(value.id) ? value.id : `layer-${index + 1}`, usedItemIds),
                ...frameRange(value.t, value.duration, frameRate),
                ...copyPresent(value, ['transform', 'crop', 'perspective', 'opacity', 'blend']),
                ...(keyframes ? { keyframes } : {}),
                ...(mask ? { mask } : {}), source
            } as unknown as ItemV2
        });
    });

    const audio = isRecord(raw.audio) ? raw.audio : undefined;
    if (raw.audio !== undefined && !audio) {
        blockers.push('edit.json.audio is not an object.');
    }
    if (audio?.duck_keys !== undefined && (!Array.isArray(audio.duck_keys)
        || audio.duck_keys.some(key => key !== 'narration' && key !== 'speech')
        || new Set(audio.duck_keys).size !== audio.duck_keys.length)) {
        blockers.push('edit.json.audio.duck_keys must be an array of distinct narration or speech ids.');
    }
    const audioTrackRefs = legacyAudioTrackRefs(audio);
    let audioSourceSerial = 1;
    const audioSourceId = (path: string): string => {
        const existing = sourceIdByPath.get(path);
        if (existing) return existing;
        let id: string;
        do id = `a-${audioSourceSerial++}`; while (sourceIds.has(id));
        sourceIds.add(id);
        sourceIdByPath.set(path, id);
        sources.push({ id, path, proxy: null });
        return id;
    };
    const sfx = arrayOrEmpty(audio?.sfx ?? undefined, 'edit.json.audio.sfx', blockers);
    sfx.forEach((value, index) => {
        const itemPath = `edit.json.audio.sfx[${index}]`;
        if (!isRecord(value)) {
            blockers.push(`${itemPath} is not an object.`);
            return;
        }
        rejectUnknownKeys(value, SFX_KEYS, itemPath, blockers);
        const inSeconds = value.in === undefined ? 0 : value.in;
        if (!nonEmpty(value.path) || !nonNegative(value.t) || !nonNegative(inSeconds)
            || (value.out !== undefined && (!positive(value.out) || value.out <= (inSeconds as number)))
            || (value.gain_db !== undefined && !gainDb(value.gain_db))
            || (value.fade_in !== undefined && !nonNegative(value.fade_in))
            || (value.fade_out !== undefined && !nonNegative(value.fade_out))
            || !validAudioClipFxDeclaration(value)
            || !validAudioEnvelopeDeclaration(value)) {
            blockers.push(`${itemPath} path / t / in / out / gain_db / fade_in / fade_out is invalid.`);
            return;
        }
        const source: AudioMediaItemV2['source'] = {
            kind: 'media', src: audioSourceId(value.path), in: inSeconds,
            ...(value.out !== undefined ? { out: value.out as number } : {}),
            ...migrateAudioClipSource(value)
        };
        const item: AudioMediaItemV2 = {
            id: uniqueId(nonEmpty(value.id) ? value.id : `sfx-${index}`, usedItemIds),
            at: Math.round(value.t * frameRate),
            duration: value.out !== undefined
                ? Math.round((((value.out as number) - (inSeconds as number))
                    / (typeof value.speed === 'number' ? value.speed : 1)) * frameRate)
                : 0,
            source,
            ...(value.gain_db !== undefined ? { gain_db: value.gain_db as number } : {}),
            ...(value.fade_in !== undefined ? { fade_in: value.fade_in as number } : {}),
            ...(value.fade_out !== undefined ? { fade_out: value.fade_out as number } : {}),
            ...migrateAudioClipItem(value),
            ...migrateAudioEnvelopeDeclaration(value, frameRate)
        };
        pending.push({ kind: 'audio', ref: trackOf(value.track), item });
    });

    const narration = arrayOrEmpty(audio?.narration, 'edit.json.audio.narration', blockers);
    narration.forEach((value, index) => {
        const itemPath = `edit.json.audio.narration[${index}]`;
        if (!isRecord(value)) {
            blockers.push(`${itemPath} is not an object.`);
            return;
        }
        rejectUnknownKeys(value, NARRATION_KEYS, itemPath, blockers);
        const inSeconds = value.in === undefined ? 0 : value.in;
        if (!nonEmpty(value.path) || !nonNegative(value.t) || !nonNegative(inSeconds)
            || (value.out !== undefined && (!positive(value.out) || value.out <= (inSeconds as number)))
            || (value.gain_db !== undefined && !gainDb(value.gain_db))
            || (value.script !== undefined && typeof value.script !== 'string')
            || (value.reading !== undefined && typeof value.reading !== 'string')
            || !validAudioClipFxDeclaration(value)
            || !validAudioEnvelopeDeclaration(value)
            || !validNarrationProvenance(value.provenance)) {
            blockers.push(`${itemPath} path / t / in / out / gain_db / script / reading / provenance is invalid.`);
            return;
        }
        const item: AudioMediaItemV2 = {
            id: uniqueId(nonEmpty(value.id) ? value.id : `narration-${index + 1}`, usedItemIds),
            at: Math.round(value.t * frameRate),
            duration: value.out !== undefined
                ? Math.round(((value.out as number) - (inSeconds as number)) * frameRate)
                : 0,
            role: 'narration',
            source: {
                kind: 'media', src: audioSourceId(value.path), in: inSeconds as number,
                ...(value.out !== undefined ? { out: value.out as number } : {}),
                ...migrateAudioClipSource(value)
            },
            ...(value.gain_db !== undefined ? { gain_db: value.gain_db as number } : {}),
            ...(value.script !== undefined ? { script: value.script as string } : {}),
            ...(value.reading !== undefined ? { reading: value.reading as string } : {}),
            ...migrateAudioClipItem(value),
            ...migrateAudioEnvelopeDeclaration(value, frameRate),
            provenance: clone(value.provenance) as AudioMediaItemV2['provenance']
        };
        pending.push({
            kind: 'audio',
            ref: value.track !== undefined ? trackOf(value.track) : audioTrackRefs.narration as number,
            item
        });
    });

    if (audio?.bgm !== undefined && audio.bgm !== null) {
        const value = audio.bgm;
        if (!isRecord(value)) {
            blockers.push('edit.json.audio.bgm is not an object.');
        } else {
            rejectUnknownKeys(value, BGM_KEYS, 'edit.json.audio.bgm', blockers);
            if (!nonEmpty(value.path)
                || (value.in !== undefined && !nonNegative(value.in))
                || (value.fadeIn !== undefined && !nonNegative(value.fadeIn))
                || (value.fadeOut !== undefined && !nonNegative(value.fadeOut))
                || (value.gain_db !== undefined && !gainDb(value.gain_db))
                || !validAudioClipFxDeclaration(value)
                || !validAudioEnvelopeDeclaration(value)) {
                blockers.push('edit.json.audio.bgm path / in / fadeIn / fadeOut / gain_db / ducking is invalid.');
            } else if (usedItemIds.has('bgm')) {
                blockers.push('The fixed audio.bgm item id "bgm" duplicates another item id.');
            } else {
                usedItemIds.add('bgm');
                pending.push({
                    kind: 'audio', ref: audioTrackRefs.bgm as number,
                    item: {
                        id: 'bgm', at: 0, duration: 0, role: 'bgm',
                        source: { kind: 'media', src: audioSourceId(value.path), in: value.in ?? 0, ...migrateAudioClipSource(value) },
                        ...(value.fadeIn !== undefined ? { fade_in: value.fadeIn as number } : {}),
                        ...(value.fadeOut !== undefined ? { fade_out: value.fadeOut as number } : {}),
                        ...(value.gain_db !== undefined ? { gain_db: value.gain_db as number } : {}),
                        ...migrateAudioClipItem(value),
                        ...migrateAudioEnvelopeDeclaration(value, frameRate)
                    } as AudioMediaItemV2
                });
            }
        }
    }

    if (blockers.length > 0) return { ok: false, version, blockers };
    const hasCaptions = options.hasCaptions === true || captionsHaveRenderableCues(raw.captions);
    const trackDefs = readTrackDefs(raw.timeline, pending, audioTrackRefs.all, hasCaptions, blockers);
    if (blockers.length > 0) return { ok: false, version, blockers };
    const tracks = trackDefs.map(def => {
        if (def.kind === 'captions') {
            return { id: def.id, lane: 'visual', ...(def.label !== undefined ? { name: def.label } : {}), content: { from: 'captions.json' } } as TrackV2;
        }
        const lane = def.kind === 'audio' ? 'audio' : 'visual';
        return {
            id: def.id, lane, ...(def.label !== undefined ? { name: def.label } : {}),
            items: pending.filter(entry => entry.kind === def.kind && entry.ref === (def.ref ?? 0))
                .map(entry => entry.item)
        } as TrackV2;
    });
    // timeline が壊れていてアイテムに対応する行が無い場合は黙って落とさない。
    for (const entry of pending) {
        if (!trackDefs.some(def => def.kind === entry.kind && (def.ref ?? 0) === entry.ref)) {
            blockers.push(`timeline.tracks has no row for ${entry.kind} ref=${entry.ref}.`);
        }
    }
    if (blockers.length > 0) return { ok: false, version, blockers };

    const doc: EditV2 = {
        version: 2,
        output: clone(output) as EditV2['output'],
        sources: sources as unknown as EditV2['sources'],
        tracks,
        ...(audio?.master !== undefined || audio?.duck_keys !== undefined ? { audio: {
            ...(audio.master !== undefined ? { master: clone(audio.master) } : {}),
            ...(audio.duck_keys !== undefined ? { duck_keys: clone(audio.duck_keys) } : {})
        } } : {}),
        ...(raw.captions !== undefined ? { captions: clone(raw.captions) as unknown[] } : {}),
        ...(raw.thumbnail !== undefined ? { thumbnail: clone(raw.thumbnail) as RecordValue } : {})
    };
    const changes: MigrateChange[] = [
        { path: 'version', note: 'Update edit.json version 0/1 to version 2' },
        { path: 'cuts/overlays/layers', note: 'Move onto tracks[].items[] and source.kind, and lock output time to integer frames.' },
        { path: 'timeline.tracks', note: 'Keep the relative order of visual rows by (kind, ref), and move audio rows to purpose-specific refs at the front.' }
    ];
    if (raw.audio !== undefined) changes.push({
        path: 'audio',
        note: 'Move BGM, narration, and sound effects onto tracks[].items[]. Keep output at/duration as integer frames, and keep footage in/out/fade/bgm.in in seconds.'
    });
    if (raw.emphasis_words !== undefined) changes.push({
        path: 'emphasis_words',
        note: 'Drop it from edit.json v2 and move it to top-level emphasis_words[] in captions.json.'
    });
    if (raw.thumbnail !== undefined) changes.push({ path: 'thumbnail', note: 'Keep the thumbnail reference unchanged' });
    if (hasCaptions && !timelineDeclaresCaptions(raw.timeline)) changes.push({
        path: 'tracks[]',
        note: 'Compose the caption track declaration (captions.json) at the end of tracks[], the top layer.'
    });

    if (pending.reduce((sum, entry) => sum + tracks.filter(track => 'items' in track
        && track.items.some(item => item === entry.item)).length, 0) !== pending.length) {
        return { ok: false, version, blockers: ['The converted tracks[] do not hold each pending item exactly once.'] };
    }

    try {
        readEditV2(doc);
    } catch (error) {
        return {
            ok: false,
            version,
            blockers: [`The converted v2 failed its own check. This may be a converter bug. Invalid v2 is not written: ${messageOf(error)}`]
        };
    }

    return { ok: true, version, doc, changes, warnings: [] };
}

export function planMigration(
    projectRoot: string,
    editPath: string,
    text: string,
    options: { hasCaptions?: boolean; now?: Date } = {}
): MigrationProposal | MigrationBlocked {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        return { ok: false, version: -1, blockers: [`edit.json is not valid JSON: ${messageOf(error)}`] };
    }
    // annotations の書き込み経路も projectRoot 付きで planMigration を呼ぶため、ここでの解決だけで
    // CLI と同じ cue 判定が適用され、呼び出し元への追加配線は要らない。
    const resolvedProjectRoot = resolve(projectRoot);
    const captionsPath = join(resolvedProjectRoot, 'captions.json');
    const hasCaptions = options.hasCaptions ?? readCaptionsHaveRenderableCues(captionsPath);
    const migrated = migrateEditToV2(raw, { hasCaptions });
    if ('blockers' in migrated) {
        return { ok: false, version: migrated.version, blockers: migrated.blockers };
    }
    const iso = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
    let captions: MigrationProposal['captions'];
    if (isRecord(raw) && hasOwn(raw, 'emphasis_words')) {
        if (!Array.isArray(raw.emphasis_words)) {
            return {
                ok: false, version: migrated.version,
                blockers: ['edit.json.emphasis_words is not an array, so it cannot move into captions.json.']
            };
        }
        if (!existsSync(captionsPath)) {
            return {
                ok: false, version: migrated.version,
                blockers: ['The captions.json that emphasis_words moves into does not exist. Add a captions.json rooted at an object, then run this again.']
            };
        }
        let captionsPreviousText: string;
        let captionsRoot: unknown;
        try {
            captionsPreviousText = readFileSync(captionsPath, 'utf8');
            captionsRoot = JSON.parse(captionsPreviousText);
        } catch (error) {
            return {
                ok: false, version: migrated.version,
                blockers: [`Cannot read the captions.json that emphasis_words moves into: ${messageOf(error)}`]
            };
        }
        if (Array.isArray(captionsRoot)) {
            return {
                ok: false, version: migrated.version,
                blockers: ['The captions.json that emphasis_words moves into is rooted at an array. Change it to an object that can hold top-level emphasis_words[], then run this again.']
            };
        }
        if (!isRecord(captionsRoot)) {
            return {
                ok: false, version: migrated.version,
                blockers: ['The captions.json that emphasis_words moves into is not rooted at an object.']
            };
        }
        if (hasOwn(captionsRoot, 'emphasis_words')) {
            return {
                ok: false, version: migrated.version,
                blockers: ['captions.json already has emphasis_words, so conversion stops to avoid moving them twice.']
            };
        }
        captions = {
            filePath: captionsPath,
            nextText: `${JSON.stringify({ ...captionsRoot, emphasis_words: clone(raw.emphasis_words) }, null, 2)}\n`,
            previousText: captionsPreviousText,
            backupPath: join(resolvedProjectRoot, '.akari', 'backup', `captions-${iso}.json`)
        };
    }
    return {
        filePath: resolve(editPath), version: migrated.version, changes: migrated.changes,
        warnings: migrated.warnings, nextText: `${JSON.stringify(migrated.doc, null, 2)}\n`, previousText: text,
        backupPath: join(resolvedProjectRoot, '.akari', 'backup', `edit-${iso}.json`),
        ...(captions ? { captions } : {})
    };
}

/** 承認後のみ実行する。先に全原文を .akari/backup/ へ退避し、次に atomic rename する。 */
export async function applyMigration(proposal: MigrationProposal | V2NormalizationProposal): Promise<void> {
    if (proposal.nextText !== proposal.previousText) {
        await writeAtomic(proposal.backupPath, proposal.previousText);
    }
    if (proposal.captions && proposal.captions.nextText !== proposal.captions.previousText) {
        await writeAtomic(proposal.captions.backupPath, proposal.captions.previousText);
    }
    const motionFiles = 'motion' in proposal ? proposal.motion ?? [] : [];
    for (const motion of motionFiles) {
        await writeAtomic(motion.backupPath, motion.previousText);
    }
    if (proposal.nextText !== proposal.previousText) await writeAtomic(proposal.filePath, proposal.nextText);
    if (proposal.captions && proposal.captions.nextText !== proposal.captions.previousText) {
        await writeAtomic(proposal.captions.filePath, proposal.captions.nextText);
    }
    for (const motion of motionFiles) await writeAtomic(motion.filePath, motion.nextText);
}

/** 退避した原文を 1 手で edit.json / captions.json へ戻す。backup 自体は監査記録として残す。 */
export async function revertMigration(proposal: MigrationProposal | V2NormalizationProposal): Promise<void> {
    const original = proposal.nextText !== proposal.previousText
        ? await fs.readFile(proposal.backupPath, 'utf8') : undefined;
    const captionsOriginal = proposal.captions
        && proposal.captions.nextText !== proposal.captions.previousText
        ? await fs.readFile(proposal.captions.backupPath, 'utf8') : undefined;
    const motionFiles = 'motion' in proposal ? proposal.motion ?? [] : [];
    const motionOriginals = await Promise.all(motionFiles.map(async motion => ({
        filePath: motion.filePath,
        text: await fs.readFile(motion.backupPath, 'utf8')
    })));
    if (original !== undefined) await writeAtomic(proposal.filePath, original);
    if (proposal.captions && captionsOriginal !== undefined) {
        await writeAtomic(proposal.captions.filePath, captionsOriginal);
    }
    for (const motion of motionOriginals) await writeAtomic(motion.filePath, motion.text);
}

export function planV2Normalization(
    projectRoot: string,
    editPath: string,
    previousText: string,
    options: { now?: Date } = {}
): V2NormalizationProposal | MigrationBlocked | MigrationNoop {
    let raw: unknown;
    try {
        raw = JSON.parse(previousText);
    } catch (error) {
        return { ok: false, version: -1, blockers: [`edit.json is not valid JSON: ${messageOf(error)}`] };
    }
    if (detectEditVersion(raw) !== 2) {
        return { ok: false, version: detectEditVersion(raw) ?? -1, blockers: ['edit.json.version is not 2.'] };
    }
    const resolvedProjectRoot = resolve(projectRoot);
    const resolvedEditPath = resolve(editPath);
    if (!isRecord(raw) || !Array.isArray(raw.tracks)) {
        return { ok: false, version: 2, blockers: ['version 2 edit.json.tracks[] is missing.'] };
    }
    const normalized = clone(raw) as RecordValue;
    const tracks = normalized.tracks as unknown[];
    const usedIds = new Set<string>();
    for (const track of tracks) {
        if (!isRecord(track) || !Array.isArray(track.items)) continue;
        collectItemIds(track.items, usedIds);
    }
    const duration = tracks.reduce((maximum, track) => {
        if (!isRecord(track) || track.lane !== 'visual' || !Array.isArray(track.items)) return maximum;
        return track.items.reduce((trackMaximum, item) => isRecord(item)
            && typeof item.at === 'number' && typeof item.duration === 'number'
            ? Math.max(trackMaximum, item.at + item.duration) : trackMaximum, maximum);
    }, 0);
    let convertedContent = false;
    normalized.tracks = tracks.map(track => {
        if (!isRecord(track) || !isRecord(track.content) || track.content.from !== 'captions.json') return track;
        convertedContent = true;
        const { content: _content, ...rest } = track;
        const preferredId = typeof track.id === 'string' && track.id.length > 0 ? track.id : 'captions';
        const id = uniqueId(preferredId, usedIds);
        return {
            ...rest,
            items: [{
                id,
                name: '字幕',
                at: 0,
                duration,
                source: { kind: 'captions', path: 'captions.json', exclude: [] },
                items: []
            }]
        };
    }).filter(track => !isRecord(track) || !Array.isArray(track.items) || track.items.length > 0);
    try {
        readEditV2(normalized as unknown as EditV2);
    } catch (error) {
        return {
            ok: false,
            version: 2,
            blockers: [`The normalized v2 failed its own check: ${messageOf(error)}`]
        };
    }

    const nextText = serializeEdit(normalized);
    const iso = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
    const captionsPath = join(resolvedProjectRoot, 'captions.json');
    let captions: V2NormalizationProposal['captions'];
    if (existsSync(captionsPath)) {
        try {
            const captionsPreviousText = readFileSync(captionsPath, 'utf8');
            const captionsNextText = serializeCaptions(JSON.parse(captionsPreviousText));
            if (captionsNextText !== captionsPreviousText) {
                captions = {
                    filePath: captionsPath,
                    previousText: captionsPreviousText,
                    nextText: captionsNextText,
                    backupPath: join(resolvedProjectRoot, '.akari', 'backup', `captions-${iso}.json`)
                };
            }
        } catch (error) {
            return { ok: false, version: 2, blockers: [`Cannot normalize captions.json: ${messageOf(error)}`] };
        }
    }

    const motion: NonNullable<V2NormalizationProposal['motion']> = [];
    const motionDirectory = join(resolvedProjectRoot, 'motion');
    if (existsSync(motionDirectory)) {
        try {
            for (const name of readdirSync(motionDirectory).filter(name => name.endsWith('.json')).sort()) {
                const filePath = join(motionDirectory, name);
                const motionPreviousText = readFileSync(filePath, 'utf8');
                const motionNextText = serializeMotion(JSON.parse(motionPreviousText));
                if (motionNextText === motionPreviousText) continue;
                motion.push({
                    filePath,
                    previousText: motionPreviousText,
                    nextText: motionNextText,
                    backupPath: join(resolvedProjectRoot, '.akari', 'backup', `motion-${basename(name, '.json')}-${iso}.json`)
                });
            }
        } catch (error) {
            return { ok: false, version: 2, blockers: [`Cannot normalize motion/*.json: ${messageOf(error)}`] };
        }
    }
    if (!convertedContent && nextText === previousText && captions === undefined && motion.length === 0) {
        return {
            ok: true,
            noop: true,
            version: 2,
            filePath: resolvedEditPath,
            changes: [],
            warnings: [],
            nextText,
            previousText,
            backupPath: join(resolvedProjectRoot, '.akari', 'backup', `edit-${iso}.json`)
        };
    }
    return {
        filePath: resolvedEditPath,
        version: 2,
        changes: [
            ...(convertedContent ? [{ path: 'tracks[].content', note: 'content → captions container group' }] : []),
            { path: 'edit.json / captions.json / motion/*.json', note: 'Canonical serialization (formatting only)' }
        ],
        warnings: [],
        nextText,
        previousText,
        backupPath: join(resolvedProjectRoot, '.akari', 'backup', `edit-${iso}.json`),
        ...(captions ? { captions } : {}),
        ...(motion.length > 0 ? { motion } : {})
    };
}

/**
 * 幾何の統一 G1: `scale × fit` の一度きりの焼き込みと `output.geometry: "source"` の付与を
 * `planV2Normalization` と同じ形（backup パス付き提案・`applyMigration` / `revertMigration` で扱える）
 * で提案する。素材の寸法は呼び出し側が `dimensionsOf` で渡す（I/O はこの層に持ち込まない）。
 */
export function planGeometryNormalization(
    projectRoot: string,
    editPath: string,
    previousText: string,
    options: { dimensionsOf: DimensionsOf; now?: Date }
): GeometryNormalizationProposal | MigrationBlocked | GeometryNormalizationNoop {
    let raw: unknown;
    try {
        raw = JSON.parse(previousText);
    } catch (error) {
        return { ok: false, version: -1, blockers: [`edit.json is not valid JSON: ${messageOf(error)}`] };
    }
    const version = detectEditVersion(raw);
    if (version !== 2) {
        return {
            ok: false, version: version ?? -1,
            blockers: ['edit.json.version is not 2. Convert to version 2 with `akari migrate` first.']
        };
    }
    const resolvedProjectRoot = resolve(projectRoot);
    const resolvedEditPath = resolve(editPath);
    const iso = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
    const backupPath = join(resolvedProjectRoot, '.akari', 'backup', `edit-${iso}.json`);
    const alreadyMigrated = isRecord(raw) && isRecord(raw.output) && raw.output.geometry === GEOMETRY_SOURCE;
    const result = normalizeGeometry(raw, options.dimensionsOf);
    if ('blockers' in result) {
        return { ok: false, version: 2, blockers: result.blockers };
    }
    if (alreadyMigrated) {
        return {
            ok: true, noop: true, version: 2, filePath: resolvedEditPath,
            changes: [], geometry: [], warnings: [], nextText: previousText, previousText, backupPath
        };
    }
    try {
        readEditV2(result.edit as unknown as EditV2);
    } catch (error) {
        return {
            ok: false, version: 2,
            blockers: [`The migrated v2 failed its own check: ${messageOf(error)}`]
        };
    }
    return {
        filePath: resolvedEditPath,
        version: 2,
        changes: [
            ...result.changes.map(change => ({
                path: `tracks[].items[id=${change.itemId}].transform.scale`,
                note: `${change.before} → ${change.after} (footage ${change.sourceId} · fit ${change.fit})`
            })),
            { path: 'output.geometry', note: 'Set the source-sized marker "source"' }
        ],
        geometry: result.changes,
        warnings: [],
        nextText: serializeEdit(result.edit),
        previousText,
        backupPath
    };
}

function collectItemIds(items: unknown[], usedIds: Set<string>): void {
    for (const item of items) {
        if (!isRecord(item)) continue;
        if (typeof item.id === 'string') usedIds.add(item.id);
        if (Array.isArray(item.items)) collectItemIds(item.items, usedIds);
    }
}

function readTrackDefs(
    timeline: unknown,
    pending: readonly PendingItem[],
    audioRefs: readonly number[],
    hasCaptions: boolean,
    blockers: string[]
): LegacyTrackDef[] {
    if (timeline !== undefined) {
        if (!isRecord(timeline) || !Array.isArray(timeline.tracks)) {
            blockers.push('edit.json.timeline.tracks is not an array.');
            return [];
        }
        const ids = new Set<string>();
        const declared = timeline.tracks.flatMap((value, index) => {
            if (!isRecord(value) || !nonEmpty(value.id)
                || !['cuts', 'layers', 'overlays', 'captions', 'audio'].includes(String(value.kind))) {
                blockers.push(`edit.json.timeline.tracks[${index}] id / kind is invalid.`);
                return [];
            }
            if (ids.has(value.id)) blockers.push(`Duplicate timeline.tracks[].id: ${value.id}`);
            ids.add(value.id);
            return [{
                id: value.id,
                kind: value.kind as LegacyTrackDef['kind'],
                ...(value.kind === 'captions' ? {} : { ref: trackOf(value.ref) }),
                ...(typeof value.label === 'string' ? { label: value.label } : {})
            }];
        });
        if (hasCaptions && !declared.some(def => def.kind === 'captions')) {
            declared.push({ id: uniqueId('captions', ids), kind: 'captions' });
        }
        return orderedTrackDefs(declared, audioRefs, hasCaptions, blockers);
    }
    const defs: LegacyTrackDef[] = [];
    const append = (kind: LegacyTrackDef['kind'], ref?: number): void => {
        defs.push({ id: `t${defs.length + 1}`, kind, ...(ref === undefined ? {} : { ref }) });
    };
    for (const kind of ['cuts', 'layers', 'overlays'] as const) {
        const refs = [...new Set(pending.filter(entry => entry.kind === kind).map(entry => entry.ref))].sort((a, b) => a - b);
        refs.forEach(ref => append(kind, ref));
    }
    if (hasCaptions) append('captions');
    return orderedTrackDefs(defs, audioRefs, hasCaptions, blockers);
}

function orderedTrackDefs(
    declared: readonly LegacyTrackDef[], audioRefs: readonly number[], hasCaptions: boolean, blockers: string[]
): LegacyTrackDef[] {
    const usedIds = new Set(declared.map(def => def.id));
    const newId = (candidate: string): string => uniqueId(candidate, usedIds);
    const audio: LegacyTrackDef[] = [];
    for (const ref of audioRefs) {
        const legacy = declared.find(def => def.kind === 'audio' && (def.ref ?? 0) === ref);
        audio.push({ ...(legacy ?? { id: newId(`audio-${ref}`), kind: 'audio' as const }), ref });
    }
    for (const legacy of declared.filter(def => def.kind === 'audio')) {
        if (!audio.some(def => (def.ref ?? 0) === (legacy.ref ?? 0))) audio.push(legacy);
    }
    const visual = declared.filter(def => def.kind !== 'audio');
    if (hasCaptions && declared.length === 0 && !visual.some(def => def.kind === 'captions')) {
        blockers.push('Internal error: the captions track could not be derived.');
    }
    return [...audio, ...visual];
}

function timelineDeclaresCaptions(timeline: unknown): boolean {
    return isRecord(timeline) && Array.isArray(timeline.tracks)
        && timeline.tracks.some(track => isRecord(track) && track.kind === 'captions');
}

function readCaptionsHaveRenderableCues(captionsPath: string): boolean {
    try {
        return captionsHaveRenderableCues(JSON.parse(readFileSync(captionsPath, 'utf8')));
    } catch {
        return false;
    }
}

function legacyAudioTrackRefs(value: unknown): LegacyAudioTrackRefs {
    const audio = isRecord(value) ? value : undefined;
    if (!audio) return { sfx: [], all: [] };
    const sfx = new Set<number>();
    if (Array.isArray(audio.sfx)) {
        for (const entry of audio.sfx) if (isRecord(entry)) sfx.add(trackOf(entry.track));
    }
    const sfxRefs = [...sfx].sort((a, b) => a - b);
    let nextRef = sfxRefs.length > 0 ? Math.max(...sfxRefs) + 1 : 0;
    const narration = Array.isArray(audio.narration) && audio.narration.length > 0
        ? nextRef++ : undefined;
    const bgm = isRecord(audio.bgm) ? nextRef++ : undefined;
    return {
        sfx: sfxRefs,
        ...(narration !== undefined ? { narration } : {}),
        ...(bgm !== undefined ? { bgm } : {}),
        all: [
            ...sfxRefs,
            ...(narration !== undefined ? [narration] : []),
            ...(bgm !== undefined ? [bgm] : [])
        ]
    };
}

function arrayOrEmpty(value: unknown, path: string, blockers: string[]): unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        blockers.push(`${path} is not an array.`);
        return [];
    }
    return value;
}

function frameRange(atSeconds: unknown, durationSeconds: unknown, fps: number): { at: number; duration: number } {
    const at = Math.round((atSeconds as number) * fps);
    const end = Math.round(((atSeconds as number) + (durationSeconds as number)) * fps);
    return { at, duration: Math.max(1, end - at) };
}

function uniqueId(candidate: string, used: Set<string>): string {
    let id = candidate;
    let suffix = 2;
    while (used.has(id)) id = `${candidate}-${suffix++}`;
    used.add(id);
    return id;
}

/**
 * v0/v1 は「未設定」を明示 `null`（例: `crop: null`）で書くことがあるが、v2 の対応する
 * 任意フィールド（`transform` / `opacity` / `crop` / `perspective` / `blend`）は「未設定」を
 * キー自体の省略で表す（v2 スキーマはこれらに `null` を許容しない — `edit-v2.ts` の
 * `validateCrop` 等は `requireRecord` で `null` を拒否する）。`source[key] !== undefined` だけの
 * 判定だと明示 `null` がそのまま v2 へ複写され、`crop: null` のような不正な v2 を生む
 * （task/2026-08-20-migrate-crop-schema で実測: `crop: null` を持つ v0 プロジェクトの変換が
 * `ok: true` を返しつつ `readEditV2` に通すと必ず失敗する）。既知の語彙（この 5 フィールド）の
 * 転写ミスの是正であり、新しい変換規則の追加ではない。
 *
 * ※ `proxy` / `chroma_key`（v2 側が `null` を許容する数少ないフィールド）はこの関数を通らず、
 * 呼び出し元が別途 `hasOwn` で明示的に `null` ごと転写している（このファイル内 2 箇所）。
 */
function copyPresent(source: RecordValue, keys: readonly string[]): RecordValue {
    return Object.fromEntries(
        keys.filter(key => source[key] !== undefined && source[key] !== null).map(key => [key, clone(source[key])])
    );
}

function rejectUnknownKeys(value: RecordValue, allowed: Set<string>, path: string, blockers: string[]): void {
    for (const key of Object.keys(value)) {
        if (allowed.has(key)) continue;
        if (key === 'transitionOut') {
            blockers.push(`${path}.transitionOut is the spelling an older Web UI wrote. Correct it to transition_out, or open the project in the Web UI and save.`);
        } else {
            blockers.push(`${path}.${key} is an unknown field the frozen converter does not handle.`);
        }
    }
}

function clone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is RecordValue {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function nonEmpty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function positive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function gainDb(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= -60 && value <= 12;
}

function validAudioClipFxDeclaration(value: RecordValue): boolean {
    if (value.speed !== undefined && !(typeof value.speed === 'number' && Number.isFinite(value.speed)
        && value.speed > 0.25 && value.speed <= 4)) return false;
    if (value.pitch_semitones !== undefined && !(typeof value.pitch_semitones === 'number'
        && Number.isFinite(value.pitch_semitones) && value.pitch_semitones >= -24 && value.pitch_semitones <= 24)) return false;
    if (value.formant !== undefined && value.formant !== 'preserve' && value.formant !== 'shift') return false;
    if (value.lowcut_hz !== undefined && !(typeof value.lowcut_hz === 'number'
        && Number.isFinite(value.lowcut_hz) && value.lowcut_hz >= 0 && value.lowcut_hz <= 400)) return false;
    if (value.denoise === undefined) return true;
    return isRecord(value.denoise)
        && (value.denoise.method === 'fft' || value.denoise.method === 'nlm')
        && typeof value.denoise.strength === 'number' && Number.isFinite(value.denoise.strength)
        && value.denoise.strength >= 0 && value.denoise.strength <= 1;
}

function migrateAudioClipSource(value: RecordValue): Partial<AudioMediaItemV2['source']> {
    return {
        ...(typeof value.speed === 'number' ? { speed: value.speed } : {}),
        ...(typeof value.pitch_semitones === 'number' ? { pitch_semitones: value.pitch_semitones } : {}),
        ...(value.formant === 'preserve' || value.formant === 'shift' ? { formant: value.formant } : {})
    };
}

function migrateAudioClipItem(value: RecordValue): Partial<AudioMediaItemV2> {
    return {
        ...(isRecord(value.denoise) ? { denoise: clone(value.denoise) as AudioMediaItemV2['denoise'] } : {}),
        ...(typeof value.lowcut_hz === 'number' ? { lowcut_hz: value.lowcut_hz } : {})
    };
}

function validAudioEnvelopeDeclaration(value: RecordValue): boolean {
    if (value.ducking !== undefined && typeof value.ducking !== 'boolean') return false;
    if (value.duck_db !== undefined && !(typeof value.duck_db === 'number' && Number.isFinite(value.duck_db)
        && value.duck_db >= -40 && value.duck_db <= 0)) return false;
    if (value.duck_attack !== undefined && !(typeof value.duck_attack === 'number' && Number.isFinite(value.duck_attack)
        && value.duck_attack >= 0 && value.duck_attack <= 2)) return false;
    if (value.duck_release !== undefined && !(typeof value.duck_release === 'number' && Number.isFinite(value.duck_release)
        && value.duck_release >= 0 && value.duck_release <= 5)) return false;
    if (value.keyframes === undefined) return true;
    return Array.isArray(value.keyframes) && value.keyframes.length >= 2 && value.keyframes.every(point =>
        isRecord(point) && nonNegative(point.t) && gainDb(point.gain_db)
        && (point.easing === undefined || typeof point.easing === 'string'));
}

function migrateAudioEnvelopeDeclaration(
    value: RecordValue,
    frameRate: number
): Partial<AudioMediaItemV2> {
    return {
        ...(Array.isArray(value.keyframes) ? { keyframes: value.keyframes.map(point => ({
            ...clone(point as RecordValue),
            t: Math.round(((point as RecordValue).t as number) * frameRate)
        })) as AudioMediaItemV2['keyframes'] } : {}),
        ...(typeof value.ducking === 'boolean' ? { ducking: value.ducking } : {}),
        ...(typeof value.duck_db === 'number' ? { duck_db: value.duck_db } : {}),
        ...(typeof value.duck_attack === 'number' ? { duck_attack: value.duck_attack } : {}),
        ...(typeof value.duck_release === 'number' ? { duck_release: value.duck_release } : {})
    };
}

function validNarrationProvenance(value: unknown): value is NonNullable<AudioMediaItemV2['provenance']> {
    if (!isRecord(value) || !nonEmpty(value.provider)) return false;
    for (const key of ['engine', 'voice', 'credit', 'generated_at']) {
        if (value[key] !== undefined && typeof value[key] !== 'string') return false;
    }
    return value.provider !== 'voicevox' || nonEmpty(value.credit);
}

function trackOf(value: unknown): number {
    return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
