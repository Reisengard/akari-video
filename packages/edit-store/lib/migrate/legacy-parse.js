"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEdit = parseEdit;
const transition_vocabulary_1 = require("../transition-vocabulary");
const LAYER_BLEND_MODES = [
    'normal', 'screen', 'multiply', 'add', 'difference',
    'darken', 'lighten', 'overlay', 'hardlight', 'softlight'
];
function parseEdit(source) {
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object') {
        throw new Error('The edit data is not in a recognized format.');
    }
    const warnings = [];
    const cuts = [];
    const overlays = [];
    const beats = [];
    const layers = [];
    const audioSfx = [];
    const audioNarration = [];
    // 採用した要素が元配列の何番目だったか（不正な要素は読み飛ばすので配列位置は一致しない）。
    // internal-model.ts が「宣言の生要素」と「型付きビュー」を突き合わせるために使う。
    const origins = {
        cuts: [], overlays: [], beats: [], layers: [], audioSfx: [], audioNarration: []
    };
    let timeline;
    let audioBgm;
    const sources = [];
    const sourceIds = new Set();
    if (Array.isArray(value.sources)) {
        for (const sourceEntry of value.sources) {
            if (typeof sourceEntry?.id === 'string' && sourceEntry.id) {
                sourceIds.add(sourceEntry.id);
            }
            if (typeof sourceEntry?.id === 'string' && sourceEntry.id
                && typeof sourceEntry.path === 'string' && sourceEntry.path
                && (sourceEntry.proxy === null || typeof sourceEntry.proxy === 'string')) {
                sources.push({
                    id: sourceEntry.id,
                    path: sourceEntry.path,
                    proxy: sourceEntry.proxy
                });
            }
        }
    }
    const isV1 = Array.isArray(value.sources);
    const isV0 = !isV1 && value.sources === undefined
        && value.source !== null && typeof value.source === 'object';
    let defaultSource;
    if (isV0 && typeof value.source.path === 'string' && value.source.path
        && (value.source.proxy === undefined || value.source.proxy === null || typeof value.source.proxy === 'string')) {
        defaultSource = { path: value.source.path, proxy: value.source.proxy ?? null };
    }
    if (Array.isArray(value.cuts)) {
        for (let index = 0; index < value.cuts.length; index++) {
            const rawCut = value.cuts[index];
            const input = rawCut?.in;
            const output = rawCut?.out;
            const hasSrc = rawCut !== null && typeof rawCut === 'object'
                && Object.prototype.hasOwnProperty.call(rawCut, 'src');
            if ((isV1 && !hasSrc)
                || (hasSrc && typeof rawCut.src !== 'string')
                || (isV0 && hasSrc)
                || (hasSrc && (!isV1 || !sourceIds.has(rawCut.src)))) {
                warnings.push(`Clip ${index + 1} is not shown because its src could not be resolved.`);
                continue;
            }
            if (typeof input === 'number' && Number.isFinite(input)
                && typeof output === 'number' && Number.isFinite(output) && input < output) {
                let speed;
                if (rawCut.speed !== undefined) {
                    if (typeof rawCut.speed === 'number' && Number.isFinite(rawCut.speed) && rawCut.speed > 0) {
                        speed = rawCut.speed;
                    }
                    else {
                        warnings.push(`Clip ${index + 1} has an invalid speed, so it is treated as 1.`);
                    }
                }
                let transitionOut;
                if (rawCut.transition_out !== undefined && rawCut.transition_out !== null) {
                    const transition = rawCut.transition_out;
                    // 正準語彙に加え、手編集で先行した非空文字列も読み取りだけは保持する。
                    // 書き込み API は isTransitionType で閉じたまま、preview の汎用フォールバックへ渡す。
                    const validType = (0, transition_vocabulary_1.isTransitionType)(transition?.type)
                        || (typeof transition?.type === 'string' && transition.type.trim().length > 0);
                    const validDuration = typeof transition?.duration === 'number'
                        && Number.isFinite(transition.duration) && transition.duration > 0;
                    if (transition && typeof transition === 'object' && !Array.isArray(transition)
                        && validType && validDuration) {
                        transitionOut = {
                            type: transition.type,
                            duration: transition.duration
                        };
                    }
                    else {
                        warnings.push(`Ignored the invalid transition_out on clip ${index + 1}.`);
                    }
                }
                let at;
                if (rawCut.at !== undefined) {
                    if (typeof rawCut.at === 'number' && Number.isFinite(rawCut.at) && rawCut.at >= 0) {
                        at = rawCut.at;
                    }
                    else {
                        warnings.push(`Ignored the invalid at on clip ${index + 1}.`);
                    }
                }
                const track = normalizeTrack(rawCut.track);
                if (rawCut.track !== undefined && track !== rawCut.track) {
                    warnings.push(`Clip ${index + 1} has an invalid track, so it is shown on track 0.`);
                }
                let transform;
                if (rawCut.transform !== undefined && rawCut.transform !== null) {
                    const rawTransform = rawCut.transform;
                    const validKeys = Object.keys(rawTransform).every(key => key === 'x' || key === 'y' || key === 'scale' || key === 'rotate');
                    const validTransform = typeof rawTransform === 'object' && !Array.isArray(rawTransform)
                        && validKeys
                        && (rawTransform.x === undefined
                            || (typeof rawTransform.x === 'number' && Number.isFinite(rawTransform.x)))
                        && (rawTransform.y === undefined
                            || (typeof rawTransform.y === 'number' && Number.isFinite(rawTransform.y)))
                        && (rawTransform.scale === undefined
                            || (typeof rawTransform.scale === 'number'
                                && Number.isFinite(rawTransform.scale) && rawTransform.scale > 0))
                        && (rawTransform.rotate === undefined
                            || (typeof rawTransform.rotate === 'number' && Number.isFinite(rawTransform.rotate)));
                    if (validTransform) {
                        transform = {
                            ...(rawTransform.x !== undefined ? { x: rawTransform.x } : {}),
                            ...(rawTransform.y !== undefined ? { y: rawTransform.y } : {}),
                            ...(rawTransform.scale !== undefined ? { scale: rawTransform.scale } : {}),
                            ...(rawTransform.rotate !== undefined ? { rotate: rawTransform.rotate } : {})
                        };
                    }
                    else {
                        warnings.push(`Ignored the invalid transform on clip ${index + 1}.`);
                    }
                }
                let opacity;
                if (rawCut.opacity !== undefined && rawCut.opacity !== null) {
                    if (typeof rawCut.opacity === 'number' && Number.isFinite(rawCut.opacity)
                        && rawCut.opacity >= 0 && rawCut.opacity <= 1) {
                        opacity = rawCut.opacity;
                    }
                    else {
                        warnings.push(`Ignored the invalid opacity on clip ${index + 1}.`);
                    }
                }
                origins.cuts.push(index);
                cuts.push({
                    in: input,
                    out: output,
                    ...(typeof rawCut.src === 'string' ? { src: rawCut.src } : {}),
                    ...(transform !== undefined ? { transform } : {}),
                    ...(opacity !== undefined ? { opacity } : {}),
                    ...(speed !== undefined ? { speed } : {}),
                    ...(transitionOut ? { transitionOut } : {}),
                    ...(at !== undefined ? { at } : {}),
                    ...(rawCut.track !== undefined ? { track } : {})
                });
            }
            else {
                warnings.push(`Clip ${index + 1} is not shown because its time is invalid.`);
            }
        }
    }
    else if (value.cuts !== undefined) {
        warnings.push('cuts is not an array, so clips are not shown.');
    }
    if (Array.isArray(value.overlays)) {
        const seenIds = new Set();
        for (let index = 0; index < value.overlays.length; index++) {
            const overlay = value.overlays[index];
            if (typeof overlay?.id === 'string' && overlay.id
                && typeof overlay.start === 'number' && Number.isFinite(overlay.start)
                && typeof overlay.duration === 'number' && Number.isFinite(overlay.duration) && overlay.duration > 0) {
                if (seenIds.has(overlay.id)) {
                    warnings.push(`Overlay ${overlay.id} is duplicated, so later entries are not shown.`);
                    continue;
                }
                seenIds.add(overlay.id);
                origins.overlays.push(index);
                overlays.push({
                    id: overlay.id,
                    start: overlay.start,
                    duration: overlay.duration,
                    track: normalizeTrack(overlay.track),
                    payload: JSON.parse(JSON.stringify(overlay))
                });
                if (overlay.track !== undefined && normalizeTrack(overlay.track) !== overlay.track) {
                    warnings.push(`Overlay ${overlay.id} has an invalid track, so it is shown on track 0.`);
                }
            }
            else {
                warnings.push(`Overlay ${index + 1} is not shown because its id or time is invalid.`);
            }
        }
    }
    else if (value.overlays !== undefined) {
        warnings.push('overlays is not an array, so overlays are not shown.');
    }
    if (Array.isArray(value.beats)) {
        const seenIds = new Set();
        for (let index = 0; index < value.beats.length; index++) {
            const beat = value.beats[index];
            const validRequiredFields = beat !== null && typeof beat === 'object'
                && typeof beat.id === 'string' && /^b-\d{4}$/.test(beat.id)
                && typeof beat.kind === 'string' && beat.kind.length > 0
                && typeof beat.t === 'number' && Number.isFinite(beat.t) && beat.t >= 0
                && typeof beat.strength === 'number' && Number.isFinite(beat.strength)
                && beat.strength >= 0 && beat.strength <= 1;
            if (!validRequiredFields || seenIds.has(beat.id)) {
                warnings.push(`Beat marker ${index + 1} is not shown because its id, time, kind, or strength is invalid.`);
                continue;
            }
            const hasSrc = Object.prototype.hasOwnProperty.call(beat, 'src');
            if ((hasSrc && typeof beat.src !== 'string')
                || (isV0 && hasSrc)
                || (hasSrc && (!isV1 || !sourceIds.has(beat.src)))) {
                warnings.push(`Beat marker ${beat.id} is not shown because its src could not be resolved.`);
                continue;
            }
            seenIds.add(beat.id);
            origins.beats.push(index);
            beats.push({
                id: beat.id,
                ...(hasSrc ? { src: beat.src } : {}),
                t: beat.t,
                kind: beat.kind,
                strength: beat.strength,
                ...(typeof beat.basis === 'string' ? { basis: beat.basis } : {})
            });
        }
    }
    else if (value.beats !== undefined) {
        warnings.push('beats is not an array, so beat markers are not shown.');
    }
    if (Array.isArray(value.layers)) {
        const seenIds = new Set();
        for (let index = 0; index < value.layers.length; index++) {
            const layer = value.layers[index];
            const valid = layer !== null && typeof layer === 'object'
                && typeof layer.id === 'string' && layer.id.length > 0
                && typeof layer.t === 'number' && Number.isFinite(layer.t) && layer.t >= 0
                && typeof layer.duration === 'number' && Number.isFinite(layer.duration) && layer.duration > 0
                && (layer.kind === 'baked' || layer.kind === 'video')
                && typeof layer.src === 'string' && layer.src.length > 0;
            if (!valid) {
                warnings.push(`Footage ${index + 1} is not shown because its id, time, or kind is invalid.`);
                continue;
            }
            if (seenIds.has(layer.id)) {
                warnings.push(`Footage ${layer.id} is duplicated, so later entries are not shown.`);
                continue;
            }
            seenIds.add(layer.id);
            const track = normalizeTrack(layer.track);
            if (layer.track !== undefined && track !== layer.track) {
                warnings.push(`Footage ${index + 1} has an invalid track, so it is shown on track 0.`);
            }
            let preset;
            if (layer.preset !== undefined && layer.preset !== null) {
                if (typeof layer.preset === 'string') {
                    preset = layer.preset;
                }
                else {
                    warnings.push(`Ignored the invalid preset on footage ${layer.id}.`);
                }
            }
            let transform;
            if (layer.transform !== undefined && layer.transform !== null) {
                const rawTransform = layer.transform;
                const validTransform = typeof rawTransform === 'object' && !Array.isArray(rawTransform)
                    && (rawTransform.x === undefined
                        || (typeof rawTransform.x === 'number' && Number.isFinite(rawTransform.x)))
                    && (rawTransform.y === undefined
                        || (typeof rawTransform.y === 'number' && Number.isFinite(rawTransform.y)))
                    && (rawTransform.scale === undefined
                        || (typeof rawTransform.scale === 'number'
                            && Number.isFinite(rawTransform.scale) && rawTransform.scale > 0))
                    && (rawTransform.rotate === undefined
                        || (typeof rawTransform.rotate === 'number' && Number.isFinite(rawTransform.rotate)));
                if (validTransform) {
                    transform = {
                        ...(rawTransform.x !== undefined ? { x: rawTransform.x } : {}),
                        ...(rawTransform.y !== undefined ? { y: rawTransform.y } : {}),
                        ...(rawTransform.scale !== undefined ? { scale: rawTransform.scale } : {}),
                        ...(rawTransform.rotate !== undefined ? { rotate: rawTransform.rotate } : {})
                    };
                }
                else {
                    warnings.push(`Ignored the invalid transform on footage ${layer.id}.`);
                }
            }
            let opacity;
            if (layer.opacity !== undefined && layer.opacity !== null) {
                if (typeof layer.opacity === 'number' && Number.isFinite(layer.opacity)
                    && layer.opacity >= 0 && layer.opacity <= 1) {
                    opacity = layer.opacity;
                }
                else {
                    warnings.push(`Ignored the invalid opacity on footage ${layer.id}.`);
                }
            }
            let blend;
            if (layer.blend !== undefined && layer.blend !== null) {
                if (typeof layer.blend === 'string'
                    && LAYER_BLEND_MODES.includes(layer.blend)) {
                    blend = layer.blend;
                }
                else {
                    warnings.push(`Ignored the invalid blend on footage ${layer.id}.`);
                }
            }
            let chromaKey;
            if (layer.chroma_key !== undefined && layer.chroma_key !== null) {
                const rawChromaKey = layer.chroma_key;
                const validChromaKey = typeof rawChromaKey === 'object' && !Array.isArray(rawChromaKey)
                    && typeof rawChromaKey.color === 'string' && rawChromaKey.color.length > 0
                    && (rawChromaKey.similarity === undefined
                        || (typeof rawChromaKey.similarity === 'number' && Number.isFinite(rawChromaKey.similarity)
                            && rawChromaKey.similarity >= 0 && rawChromaKey.similarity <= 1))
                    && (rawChromaKey.blend === undefined
                        || (typeof rawChromaKey.blend === 'number' && Number.isFinite(rawChromaKey.blend)
                            && rawChromaKey.blend >= 0 && rawChromaKey.blend <= 1));
                if (validChromaKey) {
                    chromaKey = {
                        color: rawChromaKey.color,
                        ...(rawChromaKey.similarity !== undefined ? { similarity: rawChromaKey.similarity } : {}),
                        ...(rawChromaKey.blend !== undefined ? { blend: rawChromaKey.blend } : {})
                    };
                }
                else {
                    warnings.push(`Ignored the invalid chroma_key on footage ${layer.id}.`);
                }
            }
            origins.layers.push(index);
            layers.push({
                id: layer.id,
                t: layer.t,
                duration: layer.duration,
                kind: layer.kind,
                src: layer.src,
                ...(layer.track !== undefined ? { track } : {}),
                ...(preset !== undefined ? { preset } : {}),
                ...(transform !== undefined ? { transform } : {}),
                ...(opacity !== undefined ? { opacity } : {}),
                ...(blend !== undefined ? { blend } : {}),
                ...(chromaKey !== undefined ? { chromaKey } : {})
            });
        }
    }
    else if (value.layers !== undefined) {
        warnings.push('layers is not an array, so footage is not shown.');
    }
    if (value.audio !== undefined && (value.audio === null || typeof value.audio !== 'object' || Array.isArray(value.audio))) {
        warnings.push('audio is not an object, so sound effects and BGM are not shown.');
    }
    else if (value.audio && typeof value.audio === 'object') {
        if (Array.isArray(value.audio.sfx)) {
            for (let index = 0; index < value.audio.sfx.length; index++) {
                const sfx = value.audio.sfx[index];
                if (sfx === null || typeof sfx !== 'object'
                    || typeof sfx.path !== 'string' || sfx.path.length === 0
                    || typeof sfx.t !== 'number' || !Number.isFinite(sfx.t) || sfx.t < 0) {
                    warnings.push(`Sound effect ${index + 1} is not shown because its time or footage is invalid.`);
                    continue;
                }
                let gainDb;
                if (sfx.gain_db !== undefined && sfx.gain_db !== null) {
                    if (typeof sfx.gain_db === 'number' && Number.isFinite(sfx.gain_db)
                        && sfx.gain_db >= -60 && sfx.gain_db <= 12) {
                        gainDb = sfx.gain_db;
                    }
                    else {
                        warnings.push(`Ignored the invalid gain_db on sound effect ${index + 1}.`);
                    }
                }
                let inSeconds;
                if (sfx.in !== undefined && sfx.in !== null) {
                    if (typeof sfx.in === 'number' && Number.isFinite(sfx.in) && sfx.in >= 0) {
                        inSeconds = sfx.in;
                    }
                    else {
                        warnings.push(`Ignored the invalid in on sound effect ${index + 1}.`);
                    }
                }
                let outSeconds;
                if (sfx.out !== undefined && sfx.out !== null) {
                    if (typeof sfx.out === 'number' && Number.isFinite(sfx.out) && sfx.out > 0) {
                        outSeconds = sfx.out;
                    }
                    else {
                        warnings.push(`Ignored the invalid out on sound effect ${index + 1}.`);
                    }
                }
                origins.audioSfx.push(index);
                audioSfx.push({
                    id: `sfx-${index}`,
                    t: sfx.t,
                    // 実尺（ffprobe）取得までの暫定表示尺。out 指定済みなら out-in を正として使い、
                    // 未指定なら getAudioDuration 解決後に widget 側で実尺基準へ差し替える（地雷6回収）。
                    duration: outSeconds !== undefined ? Math.max(0, outSeconds - (inSeconds ?? 0)) : 1,
                    path: sfx.path,
                    ...(sfx.track !== undefined ? { track: normalizeTrack(sfx.track) } : {}),
                    ...(inSeconds !== undefined ? { in: inSeconds } : {}),
                    ...(outSeconds !== undefined ? { out: outSeconds } : {}),
                    ...(gainDb !== undefined ? { gainDb } : {})
                });
                if (sfx.track !== undefined && normalizeTrack(sfx.track) !== sfx.track) {
                    warnings.push(`Sound effect ${index + 1} has an invalid track, so it is shown on track 0.`);
                }
            }
        }
        if (Array.isArray(value.audio.narration)) {
            const seenNarrationIds = new Set();
            for (let index = 0; index < value.audio.narration.length; index++) {
                const narration = value.audio.narration[index];
                if (narration === null || typeof narration !== 'object'
                    || typeof narration.id !== 'string' || narration.id.length === 0
                    || typeof narration.path !== 'string' || narration.path.length === 0
                    || typeof narration.t !== 'number' || !Number.isFinite(narration.t) || narration.t < 0) {
                    warnings.push(`Narration ${index + 1} is not shown because its id, time, or footage is invalid.`);
                    continue;
                }
                if (seenNarrationIds.has(narration.id)) {
                    warnings.push(`Narration ${narration.id} is duplicated, so later entries are not shown.`);
                    continue;
                }
                seenNarrationIds.add(narration.id);
                let gainDb;
                if (narration.gain_db !== undefined && narration.gain_db !== null) {
                    if (typeof narration.gain_db === 'number' && Number.isFinite(narration.gain_db)
                        && narration.gain_db >= -60 && narration.gain_db <= 12) {
                        gainDb = narration.gain_db;
                    }
                    else {
                        warnings.push(`Ignored the invalid gain_db on narration ${narration.id}.`);
                    }
                }
                origins.audioNarration.push(index);
                audioNarration.push({
                    id: narration.id,
                    t: narration.t,
                    path: narration.path,
                    ...(gainDb !== undefined ? { gainDb } : {}),
                    ...(typeof narration.in === 'number' && Number.isFinite(narration.in) && narration.in >= 0
                        ? { in: narration.in } : {}),
                    ...(typeof narration.out === 'number' && Number.isFinite(narration.out) && narration.out > 0
                        ? { out: narration.out } : {}),
                    ...(typeof narration.script === 'string' ? { script: narration.script } : {}),
                    ...(typeof narration.reading === 'string' ? { reading: narration.reading } : {}),
                    ...(narration.provenance !== null && typeof narration.provenance === 'object'
                        && !Array.isArray(narration.provenance)
                        ? { provenance: structuredClone(narration.provenance) } : {})
                });
            }
        }
        else if (value.audio.narration !== undefined) {
            warnings.push('audio.narration is not an array, so narration is not shown.');
        }
        const bgm = value.audio.bgm;
        if (bgm !== undefined && bgm !== null) {
            if (typeof bgm === 'object' && !Array.isArray(bgm)
                && typeof bgm.path === 'string' && bgm.path.length > 0) {
                let gainDb;
                if (bgm.gain_db !== undefined && bgm.gain_db !== null) {
                    if (typeof bgm.gain_db === 'number' && Number.isFinite(bgm.gain_db)
                        && bgm.gain_db >= -60 && bgm.gain_db <= 12) {
                        gainDb = bgm.gain_db;
                    }
                    else {
                        warnings.push('Ignored the invalid bgm gain_db.');
                    }
                }
                let ducking;
                if (bgm.ducking !== undefined && bgm.ducking !== null) {
                    if (typeof bgm.ducking === 'boolean') {
                        ducking = bgm.ducking;
                    }
                    else {
                        warnings.push('Ignored the invalid bgm ducking.');
                    }
                }
                audioBgm = {
                    id: 'bgm',
                    path: bgm.path,
                    ...(typeof bgm.fadeIn === 'number' && Number.isFinite(bgm.fadeIn) && bgm.fadeIn >= 0
                        ? { fadeIn: bgm.fadeIn } : {}),
                    ...(typeof bgm.fadeOut === 'number' && Number.isFinite(bgm.fadeOut) && bgm.fadeOut >= 0
                        ? { fadeOut: bgm.fadeOut } : {}),
                    ...(gainDb !== undefined ? { gainDb } : {}),
                    ...(ducking !== undefined ? { ducking } : {})
                };
            }
            else {
                warnings.push('bgm is not shown because its path is invalid.');
            }
        }
    }
    if (value.timeline !== null && typeof value.timeline === 'object' && !Array.isArray(value.timeline)
        && Array.isArray(value.timeline.tracks)) {
        const tracks = [];
        const kinds = ['cuts', 'layers', 'overlays', 'captions', 'audio'];
        const seenTrackIds = new Set();
        const seenSingletonKinds = new Set();
        for (let index = 0; index < value.timeline.tracks.length; index++) {
            const track = value.timeline.tracks[index];
            const valid = track !== null && typeof track === 'object' && !Array.isArray(track)
                && typeof track.id === 'string' && track.id.length > 0
                && typeof track.kind === 'string' && kinds.includes(track.kind)
                && (track.ref === undefined || (Number.isInteger(track.ref) && track.ref >= 0))
                && (track.label === undefined || typeof track.label === 'string')
                && (track.muted === undefined || typeof track.muted === 'boolean')
                && (track.hidden === undefined || typeof track.hidden === 'boolean')
                && (track.locked === undefined || typeof track.locked === 'boolean');
            if (!valid) {
                warnings.push(`timeline.tracks entry ${index + 1} is invalid, so it is not shown.`);
                continue;
            }
            if (seenTrackIds.has(track.id)
                || (track.kind === 'captions' && seenSingletonKinds.has(track.kind))) {
                warnings.push(`timeline.tracks entry ${index + 1} is a duplicate, so it is not shown.`);
                continue;
            }
            seenTrackIds.add(track.id);
            if (track.kind === 'captions') {
                seenSingletonKinds.add(track.kind);
            }
            tracks.push({
                id: track.id,
                kind: track.kind,
                ...(track.ref !== undefined ? { ref: track.ref } : {}),
                ...(track.label !== undefined ? { label: track.label } : {}),
                ...(track.muted !== undefined ? { muted: track.muted } : {}),
                ...(track.hidden !== undefined ? { hidden: track.hidden } : {}),
                ...(track.locked !== undefined ? { locked: track.locked } : {})
            });
        }
        timeline = { tracks };
    }
    let fps = 30;
    if (value.output && typeof value.output === 'object'
        && typeof value.output.fps === 'number' && Number.isFinite(value.output.fps) && value.output.fps > 0) {
        fps = value.output.fps;
    }
    return {
        cuts,
        ...(isV1 ? { sources } : {}),
        ...(defaultSource ? { source: defaultSource } : {}),
        overlays,
        ...(Array.isArray(value.beats) ? { beats } : {}),
        layers,
        audioSfx,
        audioNarration,
        audioBgms: audioBgm ? [audioBgm] : [],
        ...(audioBgm ? { audioBgm } : {}),
        ...(timeline ? { timeline } : {}),
        fps,
        warnings,
        origins
    };
}
function normalizeTrack(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}
