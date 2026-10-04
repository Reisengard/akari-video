"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePreviewItemWrite = resolvePreviewItemWrite;
exports.resolvePreviewItemWriteBatch = resolvePreviewItemWriteBatch;
const edit_v2_1 = require("./edit-v2");
const transform_1 = require("./transform");
const transform_keyframe_edit_1 = require("./transform-keyframe-edit");
const item_motion_js_1 = require("../../overlay-runtime/src/item-motion.js");
const motion_keyframe_replace_1 = require("./motion-keyframe-replace");
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const recordOf = (value) => isRecord(value) ? value : {};
const stringifyEdit = (value) => `${JSON.stringify(value, undefined, 2)}\n`;
const transformKeys = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'];
function mergeTransform(original, patch) {
    const merged = (0, transform_1.normalizeTransform)({ ...recordOf(original), ...patch });
    if (merged.scaleX !== undefined || merged.scaleY !== undefined) {
        const axes = (0, transform_1.effectiveScale)(merged);
        merged.scaleX = axes.x;
        merged.scaleY = axes.y;
    }
    const ordered = {};
    for (const key of transformKeys) {
        if (merged[key] !== undefined)
            ordered[key] = merged[key];
    }
    for (const [key, value] of Object.entries(merged)) {
        if (!transformKeys.includes(key))
            ordered[key] = value;
    }
    return ordered;
}
/**
 * 出力プレビューの item 書き戻しを、版判定を含む読み込み層 1 箇所へ閉じ込める。
 * 呼び出し側は v2 / legacy を知らず、返された edit.json 候補と HTML 参照先だけを扱う。
 */
function resolvePreviewItemWrite(editText, command) {
    const parsed = JSON.parse(editText);
    if (!isRecord(parsed)) {
        throw new Error('edit.json is not an object.');
    }
    return parsed.version === 2
        ? resolveV2Write(parsed, command)
        : resolveLegacyWrite(parsed, command);
}
/** Resolve all commands in memory. The caller lints and persists the final document once.
 * External HTML writes cannot participate in this single-document transaction.
 */
function resolvePreviewItemWriteBatch(editText, commands) {
    if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error('The write batch is empty.');
    }
    let candidateText = editText;
    for (const command of commands) {
        if (command.kind === 'overlay' && 'html' in command.patch) {
            throw new Error('A batch cannot write external HTML body text.');
        }
        const resolved = resolvePreviewItemWrite(candidateText, command);
        candidateText = resolved.candidateText ?? candidateText;
    }
    return { candidateText };
}
function resolveV2Write(parsed, command) {
    // strict reader を front door にして、legacy 文書や壊れた v2 を更新対象へ入れない。
    (0, edit_v2_1.readEditV2)(parsed);
    const edit = parsed;
    const itemId = command.itemId;
    if (!itemId) {
        throw new Error('Cannot locate the v2 item id.');
    }
    const children = (item) => item.items
        ?? (Array.isArray(item.children)
            ? item.children : []);
    const find = (items, id, ancestors = []) => {
        for (const candidate of items) {
            if (candidate.id === id)
                return { item: candidate, ancestors };
            const nested = find(children(candidate), id, [...ancestors, candidate]);
            if (nested)
                return nested;
        }
        return undefined;
    };
    const roots = edit.tracks.flatMap(track => track.lane === 'visual' && 'items' in track ? track.items : []);
    // Only overlay writes gain recursive addressing. Other preview systems keep
    // their existing addressing/coordinate contract.
    let target = command.kind === 'overlay' ? find(roots, itemId)
        : roots.filter(candidate => candidate.id === itemId).map(item => ({ item, ancestors: [] }))[0];
    let materialized = false;
    if (!target && command.kind === 'overlay' && itemId.includes('#')) {
        const separator = itemId.lastIndexOf('#');
        const bag = find(roots, itemId.slice(0, separator));
        const part = itemId.slice(separator + 1);
        if (bag?.item.source.kind === 'html' && !bag.item.source.part && part
            && !bag.item.source.exclude?.includes(part)) {
            const existing = children(bag.item).find(child => child.source.kind === 'html' && child.source.part === part);
            if (existing)
                target = { item: existing, ancestors: [...bag.ancestors, bag.item] };
            else {
                // Object-tree contract §1.3: touched projections become explicit
                // children; §3.1: materialize the projection. Do not exclude it.
                const ids = new Set();
                const collect = (items) => {
                    for (const entry of items) {
                        ids.add(entry.id);
                        collect(children(entry));
                    }
                };
                for (const track of edit.tracks)
                    if ('items' in track)
                        collect(track.items);
                const base = `${bag.item.id}.${part}`;
                let id = base;
                for (let suffix = 2; ids.has(id); suffix++)
                    id = `${base}-${suffix}`;
                const child = {
                    id, at: 0, duration: bag.item.duration,
                    source: { kind: 'html', path: bag.item.source.path, part }
                };
                (bag.item.items ??= []).push(child);
                target = { item: child, ancestors: [...bag.ancestors, bag.item] };
                materialized = true;
            }
        }
    }
    if (!target)
        throw new Error(`Item was not found: ${itemId}`);
    const item = target.item;
    const writeTransform = (patch) => {
        const seconds = command.playheadSeconds;
        const positionOnly = Object.keys(patch).length > 0
            && Object.keys(patch).every(key => key === 'x' || key === 'y');
        if (positionOnly || Number.isFinite(seconds)) {
            const start = [...target.ancestors, item].reduce((sum, entry) => sum + entry.at, 0);
            const frame = Number.isFinite(seconds)
                ? Math.max(0, Math.min(item.duration, Math.round(seconds * edit.output.fps) - start)) : 0;
            const updated = (0, transform_keyframe_edit_1.writeItemTransformAt)(item, frame, patch);
            item.transform = updated.transform;
            item.keyframes = updated.keyframes;
        }
        else {
            item.transform = mergeTransform(item.transform, patch);
        }
    };
    if (command.kind === 'overlay') {
        if ('text' in command.patch) {
            if (typeof command.patch.text !== 'string') {
                throw new Error('A part\'s text must be a string.');
            }
            if (item.source.kind !== 'html' || !item.source.part) {
                throw new Error(`Cannot write text back to an item that is not a part: ${itemId}`);
            }
        }
        if (item.source.kind === 'html' && item.source.part && 'html' in command.patch) {
            throw new Error(`Part text is stored on source.text: ${itemId}`);
        }
        // parts.mjs composes groups, but a bag supplies per-key defaults that
        // its part overrides. Only group ancestors form an invertible parent.
        // Preserve the original top-level merge/serialization byte for byte.
        if (command.patch.transform && (target.ancestors.length || item.motion || item.keyframes?.length)) {
            const compose = (parent, child = {}) => {
                const angle = parent.rotate * Math.PI / 180;
                const x = child.x ?? 0, y = child.y ?? 0;
                return {
                    x: parent.x + parent.scale * (Math.cos(angle) * x - Math.sin(angle) * y),
                    y: parent.y + parent.scale * (Math.sin(angle) * x + Math.cos(angle) * y),
                    scale: parent.scale * (child.scale ?? 1), rotate: parent.rotate + (child.rotate ?? 0)
                };
            };
            const parent = target.ancestors.filter(ancestor => ancestor.source.kind === 'group')
                .reduce((world, ancestor) => compose(world, ancestor.transform), { x: 0, y: 0, scale: 1, rotate: 0 });
            if (!Number.isFinite(parent.scale) || parent.scale === 0) {
                throw new Error(`Cannot invert the parent transform: ${itemId}`);
            }
            const patch = command.patch.transform;
            const bag = target.ancestors[target.ancestors.length - 1];
            const bagDefaults = item.source.kind === 'html' && item.source.part && bag?.source.kind === 'html'
                ? bag.transform : undefined;
            const world = { ...compose(parent, { ...bagDefaults, ...item.transform }), ...patch };
            const local = {};
            if (patch.x !== undefined || patch.y !== undefined) {
                const fps = edit.output.fps;
                let at = 0;
                const ancestors = target.ancestors.filter(ancestor => ancestor.source.kind === 'group');
                const parentChain = ancestors.map(ancestor => {
                    at += ancestor.at;
                    return { at: at / fps, duration: ancestor.duration / fps, fps,
                        transform: ancestor.transform, opacity: ancestor.opacity,
                        keyframes: ancestor.keyframes, motion: ancestor.motion };
                }).reverse();
                const currentAt = [...target.ancestors, item].reduce((sum, entry) => sum + entry.at, 0);
                const base = (0, item_motion_js_1.invertItemMotionPosition)({ at: currentAt / fps,
                    duration: item.duration / fps, fps, transform: item.transform,
                    opacity: item.opacity, keyframes: item.keyframes, motion: item.motion }, command.playheadSeconds ?? currentAt / fps, parentChain, world.x, world.y);
                local.x = base.x;
                local.y = base.y;
            }
            if (patch.scale !== undefined)
                local.scale = world.scale / parent.scale;
            if (patch.scaleX !== undefined)
                local.scaleX = patch.scaleX / parent.scale;
            if (patch.scaleY !== undefined)
                local.scaleY = patch.scaleY / parent.scale;
            if (patch.rotate !== undefined)
                local.rotate = world.rotate - parent.rotate;
            command = { ...command, patch: { ...command.patch, transform: local } };
        }
        if (item.source.kind === 'group') {
            if (command.patch.html !== undefined || command.patch.vars !== undefined || command.patch.params !== undefined) {
                throw new Error(`Cannot write HTML body, vars, or HTML params back onto a group item: ${itemId}`);
            }
            if (command.patch.xyKeyframes)
                item.keyframes = (0, transform_keyframe_edit_1.normalizeItemKeyframeGroup)({ ...item,
                    keyframes: (0, motion_keyframe_replace_1.replaceXYKeyframes)(item.keyframes, command.patch.xyKeyframes, item.duration) }, 'position').keyframes;
            if (command.patch.transform)
                writeTransform(command.patch.transform);
            if (!command.patch.transform && !command.patch.xyKeyframes)
                return {};
            return { candidateText: stringifyEdit(edit) };
        }
    }
    let htmlPath;
    let editChanged = materialized;
    if (command.kind === 'overlay') {
        if (item.source.kind !== 'html' && item.source.kind !== 'shape') {
            throw new Error(`Not an HTML or shape item: ${itemId}`);
        }
        if (item.source.kind === 'html') {
            const source = item.source;
            if (typeof command.patch.text === 'string') {
                source.text = command.patch.text;
                editChanged = true;
            }
            if (typeof command.patch.html === 'string') {
                htmlPath = source.path;
            }
            if (command.patch.params) {
                for (const [name, value] of Object.entries(command.patch.params)) {
                    if (!name || typeof value !== 'string') {
                        throw new Error('HTML params need non-empty keys and string values.');
                    }
                }
                source.params = { ...source.params, ...command.patch.params };
                editChanged = true;
            }
            if (command.patch.vars) {
                source.vars = { ...recordOf(source.vars), ...command.patch.vars };
                editChanged = true;
            }
        }
        else if (command.patch.html !== undefined || command.patch.params !== undefined || command.patch.vars !== undefined) {
            throw new Error(`Cannot write HTML body, vars, or HTML params back onto a shape item: ${itemId}`);
        }
        if (command.patch.transform) {
            writeTransform(command.patch.transform);
            editChanged = true;
        }
        if (command.patch.xyKeyframes) {
            item.keyframes = (0, transform_keyframe_edit_1.normalizeItemKeyframeGroup)({ ...item,
                keyframes: (0, motion_keyframe_replace_1.replaceXYKeyframes)(item.keyframes, command.patch.xyKeyframes, item.duration) }, 'position').keyframes;
            editChanged = true;
        }
    }
    else if (command.kind === 'layer') {
        if (command.patch.xyKeyframes) {
            item.keyframes = (0, transform_keyframe_edit_1.normalizeItemKeyframeGroup)({ ...item,
                keyframes: (0, motion_keyframe_replace_1.replaceXYKeyframes)(item.keyframes, command.patch.xyKeyframes, item.duration) }, 'position').keyframes;
            editChanged = true;
        }
        if (command.patch.transform) {
            writeTransform(command.patch.transform);
            editChanged = true;
        }
        if (command.patch.crop) {
            item.crop = { ...command.patch.crop };
            editChanged = true;
        }
        if (command.patch.perspective !== undefined) {
            if (command.patch.perspective === null) {
                delete item.perspective;
            }
            else {
                item.perspective = {
                    corners: command.patch.perspective.corners.map(([x, y]) => [x, y])
                };
            }
            editChanged = true;
        }
    }
    else {
        if (item.source.kind !== 'media') {
            throw new Error(`Not a picture item: ${itemId}`);
        }
        if (command.patch.xyKeyframes) {
            item.keyframes = (0, transform_keyframe_edit_1.normalizeItemKeyframeGroup)({ ...item,
                keyframes: (0, motion_keyframe_replace_1.replaceXYKeyframes)(item.keyframes, command.patch.xyKeyframes, item.duration) }, 'position').keyframes;
            editChanged = true;
        }
        if (command.patch.transform) {
            writeTransform(command.patch.transform);
            editChanged = true;
        }
        if (command.patch.crop) {
            item.crop = { ...command.patch.crop };
            editChanged = true;
        }
    }
    return {
        ...(editChanged ? { candidateText: stringifyEdit(edit) } : {}),
        ...(htmlPath !== undefined ? { htmlPath } : {})
    };
}
function resolveLegacyWrite(edit, command) {
    if (command.kind === 'overlay') {
        if (!Array.isArray(edit.overlays)) {
            throw new Error('edit.json overlays is not an array.');
        }
        const overlay = edit.overlays.find(value => isRecord(value) && String(value.id) === command.itemId);
        if (!isRecord(overlay)) {
            throw new Error(`Overlay was not found: ${command.itemId}`);
        }
        const htmlPath = typeof command.patch.html === 'string'
            ? (typeof overlay.html === 'string' ? overlay.html : undefined)
            : undefined;
        if (typeof command.patch.html === 'string' && !htmlPath) {
            throw new Error(`overlays[].html is not a file reference: ${command.itemId}`);
        }
        let editChanged = false;
        if (command.patch.params) {
            throw new Error('Writing HTML params back requires edit.json version 2.');
        }
        if (command.patch.vars) {
            overlay.vars = { ...recordOf(overlay.vars), ...command.patch.vars };
            editChanged = true;
        }
        if (command.patch.transform) {
            overlay.transform = mergeTransform(overlay.transform, command.patch.transform);
            editChanged = true;
        }
        return {
            ...(editChanged ? { candidateText: stringifyEdit(edit) } : {}),
            ...(htmlPath !== undefined ? { htmlPath } : {})
        };
    }
    if (command.kind === 'layer') {
        if (!Array.isArray(edit.layers)) {
            throw new Error('edit.json layers is not an array.');
        }
        const layer = edit.layers.find(value => isRecord(value) && String(value.id) === command.itemId);
        if (!isRecord(layer)) {
            throw new Error(`Footage was not found: ${command.itemId}`);
        }
        if (command.patch.transform) {
            layer.transform = mergeTransform(layer.transform, command.patch.transform);
        }
        if (command.patch.crop) {
            layer.crop = { ...command.patch.crop };
        }
        if (command.patch.perspective !== undefined) {
            if (command.patch.perspective === null) {
                delete layer.perspective;
            }
            else {
                layer.perspective = {
                    corners: command.patch.perspective.corners.map(([x, y]) => [x, y])
                };
            }
        }
        return { candidateText: stringifyEdit(edit) };
    }
    if (!Array.isArray(edit.cuts)) {
        throw new Error('edit.json cuts is not an array.');
    }
    const cut = edit.cuts[command.legacyIndex];
    if (!isRecord(cut)) {
        throw new Error(`Cut was not found: index ${command.legacyIndex}`);
    }
    // cutV0 / cutV1 schema に crop の席が無いので、legacy 文書へは書けない（黙って捨てない）。
    if (command.patch.crop) {
        throw new Error('Writing a cut crop back requires edit.json version 2.');
    }
    if (command.patch.transform) {
        cut.transform = mergeTransform(cut.transform, command.patch.transform);
    }
    return { candidateText: stringifyEdit(edit) };
}
