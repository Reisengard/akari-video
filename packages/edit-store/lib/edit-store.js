"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingBracket = findMatchingBracket;
exports.splitTopLevelElements = splitTopLevelElements;
exports.computeCutTrackSegments = computeCutTrackSegments;
exports.trimCutInSource = trimCutInSource;
exports.slipCutInSource = slipCutInSource;
exports.setCutSpeedInSource = setCutSpeedInSource;
exports.updateCutTransformInSource = updateCutTransformInSource;
exports.updateCutOpacityInSource = updateCutOpacityInSource;
exports.setCutTransitionOutInSource = setCutTransitionOutInSource;
exports.removeV2TransitionOutWithHandleRetractInSource = removeV2TransitionOutWithHandleRetractInSource;
exports.reorderCutsInSource = reorderCutsInSource;
exports.splitCutInSource = splitCutInSource;
exports.deleteCutInSource = deleteCutInSource;
exports.insertCutInSource = insertCutInSource;
exports.deleteLayerByIdInSource = deleteLayerByIdInSource;
exports.deleteLayerInSource = deleteLayerInSource;
exports.insertLayerInSource = insertLayerInSource;
exports.deleteSfxInSource = deleteSfxInSource;
exports.insertSfxInSource = insertSfxInSource;
exports.moveCutInSource = moveCutInSource;
exports.moveCutAndPruneTracksInSource = moveCutAndPruneTracksInSource;
exports.setCutAtValuesInSource = setCutAtValuesInSource;
exports.updateLayerInSource = updateLayerInSource;
exports.updateLayerTransformInSource = updateLayerTransformInSource;
exports.updateLayerOpacityInSource = updateLayerOpacityInSource;
exports.updateLayerBlendInSource = updateLayerBlendInSource;
exports.moveLayerInSource = moveLayerInSource;
exports.moveSfxInSource = moveSfxInSource;
exports.trimSfxInSource = trimSfxInSource;
exports.setSfxGainDbInSource = setSfxGainDbInSource;
exports.updateBgmInSource = updateBgmInSource;
exports.moveOverlayInSource = moveOverlayInSource;
exports.resizeOverlayInSource = resizeOverlayInSource;
exports.insertOverlayInSource = insertOverlayInSource;
exports.removeOverlayInSource = removeOverlayInSource;
exports.writeTimelineTracksInSource = writeTimelineTracksInSource;
exports.updateArrayElementByIndex = updateArrayElementByIndex;
exports.updateOverlayVarInSource = updateOverlayVarInSource;
const transition_vocabulary_1 = require("./transition-vocabulary");
const JSON_NUMBER = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';
const LAYER_BLEND_MODES = [
    'normal', 'screen', 'multiply', 'add', 'difference',
    'darken', 'lighten', 'overlay', 'hardlight', 'softlight'
];
function findMatchingBracket(source, openIndex) {
    const opening = source[openIndex];
    if (opening !== '[' && opening !== '{') {
        throw new Error('The start position for matching brackets is invalid.');
    }
    const stack = [opening];
    let inString = false;
    let escaped = false;
    for (let index = openIndex + 1; index < source.length; index++) {
        const character = source[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (character === '\\') {
                escaped = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
        }
        else if (character === '[' || character === '{') {
            stack.push(character);
        }
        else if (character === ']' || character === '}') {
            const expected = character === ']' ? '[' : '{';
            if (stack.pop() !== expected) {
                throw new Error('The JSON brackets do not match.');
            }
            if (stack.length === 0) {
                return index;
            }
        }
    }
    throw new Error('The JSON closing bracket was not found.');
}
function splitTopLevelElements(innerText) {
    const ranges = [];
    let start = 0;
    let squareDepth = 0;
    let braceDepth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < innerText.length; index++) {
        const character = innerText[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (character === '\\') {
                escaped = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
        }
        else if (character === '[') {
            squareDepth++;
        }
        else if (character === ']') {
            squareDepth--;
        }
        else if (character === '{') {
            braceDepth++;
        }
        else if (character === '}') {
            braceDepth--;
        }
        else if (character === ',' && squareDepth === 0 && braceDepth === 0) {
            ranges.push({ start, end: index });
            start = index + 1;
        }
    }
    ranges.push({ start, end: innerText.length });
    const elements = [];
    for (const range of ranges) {
        const raw = innerText.slice(range.start, range.end);
        const leading = raw.search(/\S/);
        if (leading < 0) {
            continue;
        }
        const trailing = raw.length - raw.trimEnd().length;
        const elementStart = range.start + leading;
        const elementEnd = range.end - trailing;
        elements.push({
            text: innerText.slice(elementStart, elementEnd),
            start: elementStart,
            end: elementEnd
        });
    }
    return elements;
}
function computeCutTrackSegments(cuts) {
    const cursorByTrack = new Map();
    const previousIndexByTrack = new Map();
    const segments = [];
    cuts.forEach((cut, index) => {
        const track = typeof cut.track === 'number' && Number.isInteger(cut.track) && cut.track >= 0 ? cut.track : 0;
        const speed = typeof cut.speed === 'number' && cut.speed > 0 ? cut.speed : 1;
        const duration = Math.max(0, cut.out - cut.in) / speed;
        const cursor = cursorByTrack.get(track) ?? 0;
        const hasExplicitAt = typeof cut.at === 'number' && Number.isFinite(cut.at) && cut.at >= 0;
        const previousIndex = previousIndexByTrack.get(track);
        const transitionOverlap = !hasExplicitAt && previousIndex !== undefined
            ? cuts[previousIndex].transitionOut?.duration ?? 0 : 0;
        const at = hasExplicitAt ? cut.at : cursor - transitionOverlap;
        const end = at + duration;
        cursorByTrack.set(track, end);
        previousIndexByTrack.set(track, index);
        segments.push({ index, track, at, duration, end });
    });
    return segments;
}
function trimCutInSource(source, cutIndex, nextIn, nextOut, maxOutSeconds) {
    if (maxOutSeconds !== undefined) {
        if (!Number.isFinite(maxOutSeconds) || maxOutSeconds < 0) {
            throw new Error('The clip duration is invalid.');
        }
        nextOut = Math.min(nextOut, maxOutSeconds);
    }
    if (!Number.isFinite(nextIn) || !Number.isFinite(nextOut) || nextIn < 0 || nextOut < 0) {
        throw new Error('Clip time is invalid.');
    }
    if (nextOut - nextIn < 0.15) {
        throw new Error('The clip is too short. It cannot be under 0.15 seconds.');
    }
    const before = readCutsForSurgery(source);
    source = freezeNextImplicitCutAt(source, cutIndex, before);
    if (before.cuts[cutIndex] && before.cuts[cutIndex].in !== nextIn) {
        const segment = before.segments[cutIndex];
        const speed = typeof before.cuts[cutIndex].speed === 'number' && before.cuts[cutIndex].speed > 0
            ? before.cuts[cutIndex].speed : 1;
        const nextAt = segment.at + (nextIn - before.cuts[cutIndex].in) / speed;
        if (nextAt < 0) {
            throw new Error('The clip output position must be 0 or greater.');
        }
        source = writeCutAtProperty(source, cutIndex, nextAt);
    }
    const array = locateArray(source, 'cuts');
    const elements = splitTopLevelElements(array.inner);
    const element = elements[cutIndex];
    if (!element) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    const label = `Clip ${cutIndex + 1}`;
    const currentIn = readNumberProperty(element.text, 'in', label);
    const currentOut = readNumberProperty(element.text, 'out', label);
    let nextText = element.text;
    if (currentIn !== nextIn) {
        nextText = replaceNumberProperty(nextText, 'in', nextIn, label);
    }
    if (currentOut !== nextOut) {
        nextText = replaceNumberProperty(nextText, 'out', nextOut, label);
    }
    return replaceElement(source, array.openIndex + 1, element, nextText);
}
/**
 * ソーストリマーの slip 操作: out−in（尺）と t（タイムライン位置）を固定したまま
 * in/out を同量シフトする。trimCutInSource と異なり尺そのものは変化しないため、
 * at の再計算・freezeNextImplicitCutAt（暗黙 at の凍結）は不要
 * （後続クリップのタイムライン位置に一切影響しない）。
 */
function slipCutInSource(source, cutIndex, nextIn, nextOut, maxOutSeconds) {
    if (maxOutSeconds !== undefined) {
        if (!Number.isFinite(maxOutSeconds) || maxOutSeconds < 0) {
            throw new Error('The clip duration is invalid.');
        }
        if (nextOut > maxOutSeconds) {
            throw new Error('The clip out point is past the footage duration.');
        }
    }
    if (!Number.isFinite(nextIn) || !Number.isFinite(nextOut) || nextIn < 0 || nextOut < 0) {
        throw new Error('Clip time is invalid.');
    }
    if (nextOut - nextIn < 0.15) {
        throw new Error('The clip is too short. It cannot be under 0.15 seconds.');
    }
    const array = locateArray(source, 'cuts');
    const elements = splitTopLevelElements(array.inner);
    const element = elements[cutIndex];
    if (!element) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    const label = `Clip ${cutIndex + 1}`;
    const currentIn = readNumberProperty(element.text, 'in', label);
    const currentOut = readNumberProperty(element.text, 'out', label);
    let nextText = element.text;
    if (currentIn !== nextIn) {
        nextText = replaceNumberProperty(nextText, 'in', nextIn, label);
    }
    if (currentOut !== nextOut) {
        nextText = replaceNumberProperty(nextText, 'out', nextOut, label);
    }
    return replaceElement(source, array.openIndex + 1, element, nextText);
}
function setCutSpeedInSource(source, cutIndex, speed) {
    if (speed !== null && (!Number.isFinite(speed) || speed <= 0)) {
        throw new Error('speed must be a positive number.');
    }
    return updateArrayElementByIndex(source, 'cuts', cutIndex, 'Clip', element => {
        const hasSpeed = hasTopLevelProperty(element, 'speed');
        if (speed === null) {
            return hasSpeed ? removeObjectProperty(element, 'speed') : element;
        }
        return hasSpeed
            ? replacePropertyValue(element, 'speed', speed, `Clip ${cutIndex + 1}`)
            : appendNumberProperty(element, 'speed', speed);
    });
}
function updateCutTransformInSource(source, cutIndex, updates) {
    if (updates.x === undefined && updates.y === undefined
        && updates.scale === undefined && updates.scaleX === undefined && updates.scaleY === undefined && updates.rotate === undefined) {
        throw new Error('Specify the transform fields to change.');
    }
    for (const property of ['x', 'y', 'rotate']) {
        const value = updates[property];
        if (value !== undefined && value !== null && !Number.isFinite(value)) {
            throw new Error(`transform.${property} must be a finite number.`);
        }
    }
    for (const key of ['scale', 'scaleX', 'scaleY']) {
        const value = updates[key];
        if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0)) {
            throw new Error(`transform.${key} must be a positive number.`);
        }
    }
    return updateArrayElementByIndex(source, 'cuts', cutIndex, 'Clip', element => {
        const hasTransform = hasTopLevelProperty(element, 'transform');
        if (!hasTransform) {
            const transform = Object.fromEntries(Object.entries(updates).filter((entry) => entry[1] !== undefined && entry[1] !== null));
            return Object.keys(transform).length > 0
                ? appendJsonProperty(element, 'transform', transform)
                : element;
        }
        const located = locateTopLevelObjectProperty(element, 'transform');
        let transform = located.text;
        for (const property of ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate']) {
            const value = updates[property];
            if (value === undefined) {
                continue;
            }
            const hasProperty = hasTopLevelProperty(transform, property);
            transform = value === null
                ? (hasProperty ? removeObjectProperty(transform, property) : transform)
                : (hasProperty
                    ? replacePropertyValue(transform, property, value, `transform of clip ${cutIndex + 1}`)
                    : appendNumberProperty(transform, property, value));
        }
        if (Object.keys(JSON.parse(transform)).length === 0) {
            return removeObjectProperty(element, 'transform');
        }
        return element.slice(0, located.start) + transform + element.slice(located.end);
    });
}
function updateCutOpacityInSource(source, cutIndex, opacity) {
    if (opacity !== null && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)) {
        throw new Error('opacity must be from 0 to 1.');
    }
    return updateArrayElementByIndex(source, 'cuts', cutIndex, 'Clip', element => {
        const hasOpacity = hasTopLevelProperty(element, 'opacity');
        if (opacity === null) {
            return hasOpacity ? removeObjectProperty(element, 'opacity') : element;
        }
        return hasOpacity
            ? replaceTopLevelPropertyValue(element, 'opacity', opacity, `Clip ${cutIndex + 1}`)
            : appendNumberProperty(element, 'opacity', opacity);
    });
}
function setCutTransitionOutInSource(source, cutIndex, transitionOut) {
    if (transitionOut !== null) {
        if (!(0, transition_vocabulary_1.isTransitionType)(transitionOut.type)) {
            throw new Error('The transition type is invalid.');
        }
        if (!Number.isFinite(transitionOut.duration) || transitionOut.duration <= 0) {
            throw new Error('Transition duration must be a positive number.');
        }
    }
    return updateArrayElementByIndex(source, 'cuts', cutIndex, 'Clip', element => {
        const hasTransitionOut = hasTopLevelProperty(element, 'transition_out');
        if (transitionOut === null) {
            return hasTransitionOut ? removeObjectProperty(element, 'transition_out') : element;
        }
        const value = { type: transitionOut.type, duration: transitionOut.duration };
        if (!hasTransitionOut) {
            return appendJsonProperty(element, 'transition_out', value);
        }
        // schema は transition_out に明示的な null（未設定の別表記）も許容しており、
        // 実データにも存在する。その場合は object ではないため locateTopLevelObjectProperty が
        // 例外を投げる — 一旦除去してから追記する（結果は object 直書きと同じ）。
        try {
            const located = locateTopLevelObjectProperty(element, 'transition_out');
            return element.slice(0, located.start) + JSON.stringify(value) + element.slice(located.end);
        }
        catch {
            return appendJsonProperty(removeObjectProperty(element, 'transition_out'), 'transition_out', value);
        }
    });
}
/**
 * v0.1.20 の自動のりしろ debris を、transition_out の削除と同じ 1 回の
 * byte-preserving 手術で回収する。新意味論の通常操作では trim を一切変更しない。
 */
function removeV2TransitionOutWithHandleRetractInSource(source, input) {
    const raw = JSON.parse(source);
    if (raw.version !== 2) {
        throw new Error('Convert to v2 before editing.');
    }
    if (!input.itemId) {
        throw new Error('The transition item id is empty.');
    }
    if (!Number.isInteger(input.retractFrames) || input.retractFrames <= 0
        || !Number.isFinite(input.fps) || input.fps <= 0) {
        throw new Error('The overlap restore amount is invalid.');
    }
    const tracks = locateArray(source, 'tracks');
    const trackElements = splitTopLevelElements(tracks.inner);
    const matches = [];
    for (const track of trackElements) {
        let items;
        try {
            items = locateArray(track.text, 'items');
        }
        catch {
            continue;
        }
        const item = splitTopLevelElements(items.inner)
            .find(candidate => readStringProperty(candidate.text, 'id') === input.itemId);
        if (item)
            matches.push({ track, items, item });
    }
    if (matches.length !== 1) {
        throw new Error(matches.length === 0
            ? `Item ${input.itemId} was not found.`
            : `Item ${input.itemId} appears more than once.`);
    }
    const match = matches[0];
    const label = `Item ${input.itemId}`;
    const durationFrames = readNumberProperty(match.item.text, 'duration', label);
    if (!Number.isInteger(durationFrames) || durationFrames < input.retractFrames) {
        throw new Error(`${label} duration cannot be restored safely.`);
    }
    const mediaSource = locateTopLevelObjectProperty(match.item.text, 'source');
    if (readStringProperty(mediaSource.text, 'kind') !== 'media') {
        throw new Error(`${label} is not picture footage.`);
    }
    const sourceIn = readNumberProperty(mediaSource.text, 'in', label);
    const sourceOut = readNumberProperty(mediaSource.text, 'out', label);
    const speed = (sourceOut - sourceIn) / (durationFrames / input.fps);
    if (!Number.isFinite(speed) || speed <= 0) {
        throw new Error(`${label} speed cannot be restored safely.`);
    }
    const nextOut = sourceOut - (input.retractFrames / input.fps) * speed;
    if (!Number.isFinite(nextOut) || nextOut < sourceIn) {
        throw new Error(`${label} out cannot be restored safely.`);
    }
    let nextMediaSource = removeObjectProperty(mediaSource.text, 'transition_out');
    nextMediaSource = replaceNumberProperty(nextMediaSource, 'out', nextOut, label);
    let nextItem = match.item.text.slice(0, mediaSource.start)
        + nextMediaSource
        + match.item.text.slice(mediaSource.end);
    nextItem = replaceNumberProperty(nextItem, 'duration', durationFrames - input.retractFrames, label);
    const nextTrack = replaceElement(match.track.text, match.items.openIndex + 1, match.item, nextItem);
    return replaceElement(source, tracks.openIndex + 1, match.track, nextTrack);
}
function reorderCutsInSource(source, fromIndex, toIndex) {
    const array = locateArray(source, 'cuts');
    const elements = splitTopLevelElements(array.inner);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
        || fromIndex < 0 || fromIndex >= elements.length || toIndex < 0 || toIndex >= elements.length) {
        throw new Error('The clip reorder position is out of range.');
    }
    if (fromIndex === toIndex) {
        return source;
    }
    const reordered = elements.map(element => element.text);
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    // Keep every separator at its original slot. Only element bodies move, so commas,
    // newlines, indentation, and all text outside cuts remain byte-for-byte identical.
    let nextInner = array.inner.slice(0, elements[0].start);
    for (let index = 0; index < elements.length; index++) {
        nextInner += reordered[index];
        nextInner += index + 1 < elements.length
            ? array.inner.slice(elements[index].end, elements[index + 1].start)
            : array.inner.slice(elements[index].end);
    }
    return source.slice(0, array.openIndex + 1) + nextInner + source.slice(array.closeIndex);
}
function splitCutInSource(source, cutIndex, atSeconds) {
    if (!Number.isFinite(atSeconds)) {
        throw new Error('The split time is invalid.');
    }
    const array = locateArray(source, 'cuts');
    const elements = splitTopLevelElements(array.inner);
    const element = elements[cutIndex];
    if (!element) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    const label = `Clip ${cutIndex + 1}`;
    const currentIn = readNumberProperty(element.text, 'in', label);
    const currentOut = readNumberProperty(element.text, 'out', label);
    if (atSeconds < currentIn + 0.15 || atSeconds > currentOut - 0.15) {
        throw new Error('The split is too close to a clip edge. Each side needs at least 0.15 seconds.');
    }
    const firstText = replaceNumberProperty(element.text, 'out', atSeconds, label);
    let secondText = replaceNumberProperty(element.text, 'in', atSeconds, label);
    if (hasTopLevelProperty(element.text, 'at')) {
        const before = readCutsForSurgery(source);
        const speed = typeof before.cuts[cutIndex].speed === 'number' && before.cuts[cutIndex].speed > 0
            ? before.cuts[cutIndex].speed : 1;
        secondText = replacePropertyValue(secondText, 'at', before.segments[cutIndex].at + (atSeconds - currentIn) / speed, label);
    }
    // 区切り文字は既存要素間の生テキスト（カンマ・改行・インデント）をそのまま再利用し、整形を保つ。
    const separator = elements.length >= 2
        ? array.inner.slice(elements[0].end, elements[1].start)
        : ', ';
    return replaceElement(source, array.openIndex + 1, element, `${firstText}${separator}${secondText}`);
}
function deleteCutInSource(source, cutIndex) {
    source = freezeNextImplicitCutAt(source, cutIndex, readCutsForSurgery(source));
    return removeArrayElementByIndex(source, 'cuts', cutIndex);
}
function removeArrayElementByIndex(source, key, index) {
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const element = elements[index];
    if (!element) {
        throw new Error(`Item ${index + 1} of ${key} was not found.`);
    }
    const innerOffset = array.openIndex + 1;
    let removeStart;
    let removeEnd;
    if (elements.length === 1) {
        // 唯一の要素: 前後の区切りが存在しないため inner 全体を空にする。
        removeStart = 0;
        removeEnd = array.inner.length;
    }
    else if (index === elements.length - 1) {
        // 末尾要素: 直前の区切り（前要素の終端から）ごと除去する。
        removeStart = elements[index - 1].end;
        removeEnd = element.end;
    }
    else {
        // 後続がある要素: 自身の開始から次要素の開始（自身の後ろの区切り込み）まで除去する。
        removeStart = element.start;
        removeEnd = elements[index + 1].start;
    }
    const nextSource = source.slice(0, innerOffset + removeStart) + source.slice(innerOffset + removeEnd);
    return { source: nextSource, removedText: element.text };
}
function insertCutInSource(source, cutIndex, elementText) {
    return insertArrayElementByIndex(source, 'cuts', cutIndex, elementText);
}
function insertArrayElementByIndex(source, key, index, elementText) {
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const innerOffset = array.openIndex + 1;
    const separator = elements.length >= 2
        ? array.inner.slice(elements[0].end, elements[1].start)
        : ', ';
    if (elements.length === 0) {
        return source.slice(0, innerOffset) + elementText + source.slice(innerOffset);
    }
    if (index >= elements.length) {
        // 末尾への挿入: 最後の要素の直後に区切り + 要素を追加する。
        const insertAt = innerOffset + elements[elements.length - 1].end;
        return source.slice(0, insertAt) + separator + elementText + source.slice(insertAt);
    }
    const target = elements[index];
    if (!target) {
        throw new Error(`The insert position ${index + 1} on ${key} is invalid.`);
    }
    const insertAt = innerOffset + target.start;
    return source.slice(0, insertAt) + elementText + separator + source.slice(insertAt);
}
function deleteLayerByIdInSource(source, layerId) {
    const array = locateArray(source, 'layers');
    const elements = splitTopLevelElements(array.inner);
    const layerIndex = elements.findIndex(element => readStringProperty(element.text, 'id') === layerId);
    if (layerIndex < 0) {
        throw new Error(`Footage ${layerId} was not found.`);
    }
    return { ...removeArrayElementByIndex(source, 'layers', layerIndex), layerIndex };
}
function deleteLayerInSource(source, layerIndex) {
    return removeArrayElementByIndex(source, 'layers', layerIndex);
}
function insertLayerInSource(source, layerIndex, elementText) {
    return insertArrayElementByIndex(source, 'layers', layerIndex, elementText);
}
function deleteSfxInSource(source, sfxIndex) {
    return removeArrayElementByIndex(source, 'sfx', sfxIndex);
}
function insertSfxInSource(source, sfxIndex, elementText) {
    return insertArrayElementByIndex(source, 'sfx', sfxIndex, elementText);
}
function moveCutInSource(source, cutIndex, nextAt, nextTrack, trackState) {
    if (!Number.isFinite(nextAt) || nextAt < 0) {
        throw new Error('Clip start time is invalid.');
    }
    if (nextTrack !== undefined && nextTrack !== null && (!Number.isInteger(nextTrack) || nextTrack < 0)) {
        throw new Error('Clip track is invalid.');
    }
    const before = readCutsForSurgery(source);
    if (!before.cuts[cutIndex]) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    let updated = freezeNextImplicitCutAt(source, cutIndex, before);
    updated = writeCutAtProperty(updated, cutIndex, nextAt);
    if (trackState) {
        updated = applyIndexedTrackState(updated, 'cuts', trackState, 'Clip');
    }
    else if (nextTrack === null
        || (nextTrack !== undefined && normalizeTrack(before.cuts[cutIndex].track) !== nextTrack)) {
        updated = updateArrayElementByIndex(updated, 'cuts', cutIndex, 'Clip', element => writeTrackProperty(element, nextTrack, `Clip ${cutIndex + 1}`));
    }
    assertMovedCutDoesNotOverlap(updated, cutIndex);
    return updated;
}
/**
 * クリップ移動と、移動で空になった宣言済み cuts トラックの除去を同じ候補全文へ畳む。
 * trackIds は UI が移動前の件数から特定したものだけを受け取り、他種別・使用中トラックは守る。
 */
function moveCutAndPruneTracksInSource(source, cutIndex, nextAt, nextTrack, trackState, trackIds = []) {
    let updated = moveCutInSource(source, cutIndex, nextAt, nextTrack, trackState);
    if (trackIds.length === 0) {
        return { source: updated };
    }
    const value = JSON.parse(updated);
    const declared = value.timeline?.tracks;
    if (!Array.isArray(declared)) {
        return { source: updated };
    }
    const requested = new Set(trackIds);
    const occupied = new Set((Array.isArray(value.cuts) ? value.cuts : []).map(cut => normalizeTrack(cut?.track)));
    const before = declared.map(track => ({ ...track }));
    const after = before.filter(track => !requested.has(track.id) || track.kind !== 'cuts' || occupied.has(track.ref ?? 0));
    if (after.length === before.length) {
        return { source: updated };
    }
    updated = writeTimelineTracksInSource(updated, after);
    return { source: updated, prunedTracks: { before, after } };
}
function setCutAtValuesInSource(source, entries) {
    const updates = new Map(entries.map(entry => [entry.cutIndex, entry.at]));
    for (const [index, value] of updates) {
        if (!Number.isInteger(index) || index < 0 || (value !== null && (!Number.isFinite(value) || value < 0))) {
            throw new Error('The clip pack position is invalid.');
        }
    }
    const array = locateArray(source, 'cuts');
    const elements = splitTopLevelElements(array.inner);
    const texts = elements.map((element, index) => {
        if (!updates.has(index)) {
            return element.text;
        }
        const at = updates.get(index);
        const hasAt = hasTopLevelProperty(element.text, 'at');
        return at === null
            ? (hasAt ? removeObjectProperty(element.text, 'at') : element.text)
            : (hasAt
                ? replacePropertyValue(element.text, 'at', at, `Clip ${index + 1}`)
                : appendNumberProperty(element.text, 'at', at));
    });
    return rebuildArrayElements(source, array, elements, texts);
}
function updateLayerInSource(source, layerId, updates) {
    return updateArrayElementById(source, 'layers', layerId, 'Footage', element => {
        let next = element;
        for (const property of ['t', 'duration', 'track']) {
            const value = updates[property];
            if (value === undefined) {
                continue;
            }
            const hasProperty = hasTopLevelProperty(next, property);
            if (hasProperty && readOptionalNumberProperty(next, property) === value) {
                continue;
            }
            next = hasProperty
                ? replacePropertyValue(next, property, value, `Footage ${layerId}`)
                : appendNumberProperty(next, property, value);
        }
        return next;
    });
}
function updateLayerTransformInSource(source, layerId, updates) {
    if (updates.x === undefined && updates.y === undefined
        && updates.scale === undefined && updates.scaleX === undefined && updates.scaleY === undefined && updates.rotate === undefined) {
        throw new Error('Specify the transform fields to change.');
    }
    for (const property of ['x', 'y', 'rotate']) {
        const value = updates[property];
        if (value !== undefined && value !== null && !Number.isFinite(value)) {
            throw new Error(`transform.${property} must be a finite number.`);
        }
    }
    for (const key of ['scale', 'scaleX', 'scaleY']) {
        const value = updates[key];
        if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0)) {
            throw new Error(`transform.${key} must be a positive number.`);
        }
    }
    return updateArrayElementById(source, 'layers', layerId, 'Footage', element => {
        const hasTransform = hasTopLevelProperty(element, 'transform');
        if (!hasTransform) {
            const transform = Object.fromEntries(Object.entries(updates).filter((entry) => entry[1] !== undefined && entry[1] !== null));
            return Object.keys(transform).length > 0
                ? appendJsonProperty(element, 'transform', transform)
                : element;
        }
        const located = locateTopLevelObjectProperty(element, 'transform');
        let transform = located.text;
        for (const property of ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate']) {
            const value = updates[property];
            if (value === undefined) {
                continue;
            }
            const hasProperty = hasTopLevelProperty(transform, property);
            transform = value === null
                ? (hasProperty ? removeObjectProperty(transform, property) : transform)
                : (hasProperty
                    ? replacePropertyValue(transform, property, value, `transform of footage ${layerId}`)
                    : appendNumberProperty(transform, property, value));
        }
        if (Object.keys(JSON.parse(transform)).length === 0) {
            return removeObjectProperty(element, 'transform');
        }
        return element.slice(0, located.start) + transform + element.slice(located.end);
    });
}
function updateLayerOpacityInSource(source, layerId, opacity) {
    if (opacity !== null && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)) {
        throw new Error('opacity must be from 0 to 1.');
    }
    return updateArrayElementById(source, 'layers', layerId, 'Footage', element => {
        const hasOpacity = hasTopLevelProperty(element, 'opacity');
        if (opacity === null) {
            return hasOpacity ? removeObjectProperty(element, 'opacity') : element;
        }
        return hasOpacity
            ? replaceTopLevelPropertyValue(element, 'opacity', opacity, `Footage ${layerId}`)
            : appendNumberProperty(element, 'opacity', opacity);
    });
}
function updateLayerBlendInSource(source, layerId, blend) {
    if (blend !== null && !LAYER_BLEND_MODES.includes(blend)) {
        throw new Error('The blend value is invalid.');
    }
    return updateArrayElementById(source, 'layers', layerId, 'Footage', element => {
        const hasBlend = hasTopLevelProperty(element, 'blend');
        if (blend === null) {
            return hasBlend ? removeObjectProperty(element, 'blend') : element;
        }
        return hasBlend
            ? replaceTopLevelPropertyValue(element, 'blend', blend, `Footage ${layerId}`)
            : appendJsonProperty(element, 'blend', blend);
    });
}
function moveLayerInSource(source, layerId, nextT, nextDuration, nextTrack, trackState) {
    if (!Number.isFinite(nextT) || nextT < 0 || !Number.isFinite(nextDuration) || nextDuration < 0.15) {
        throw new Error('Footage time or duration is invalid.');
    }
    if (nextTrack !== undefined && (!Number.isInteger(nextTrack) || nextTrack < 0)) {
        throw new Error('Footage track is invalid.');
    }
    const beforeArray = locateArray(source, 'layers');
    const beforeElements = splitTopLevelElements(beforeArray.inner);
    const beforeIndex = beforeElements.findIndex(element => readStringProperty(element.text, 'id') === layerId);
    if (beforeIndex < 0) {
        throw new Error(`Footage ${layerId} was not found.`);
    }
    const currentTrack = normalizeTrack(readOptionalNumberProperty(beforeElements[beforeIndex].text, 'track'));
    const updated = updateLayerInSource(source, layerId, {
        t: nextT,
        duration: nextDuration,
        ...(!trackState && nextTrack !== undefined && nextTrack !== currentTrack
            ? { track: nextTrack } : {})
    });
    if (trackState) {
        return applyIdTrackState(updated, 'layers', trackState, 'Footage');
    }
    return updated;
}
function moveSfxInSource(source, sfxIndex, nextT, nextTrack, trackState) {
    if (!Number.isFinite(nextT) || nextT < 0) {
        throw new Error('SE start time is invalid.');
    }
    if (nextTrack !== undefined && (!Number.isInteger(nextTrack) || nextTrack < 0)) {
        throw new Error('SE track is invalid.');
    }
    const beforeArray = locateArray(source, 'sfx');
    const beforeElements = splitTopLevelElements(beforeArray.inner);
    const currentElement = beforeElements[sfxIndex];
    if (!currentElement) {
        throw new Error(`SE ${sfxIndex + 1} was not found.`);
    }
    const currentTrack = normalizeTrack(readOptionalNumberProperty(currentElement.text, 'track'));
    const updated = updateArrayElementByIndex(source, 'sfx', sfxIndex, 'SE', element => {
        const hasT = hasTopLevelProperty(element, 't');
        let next = hasT
            ? replacePropertyValue(element, 't', nextT, `SE ${sfxIndex + 1}`)
            : appendNumberProperty(element, 't', nextT);
        if (!trackState && nextTrack !== undefined && nextTrack !== currentTrack) {
            next = writeTrackProperty(next, nextTrack, `SE ${sfxIndex + 1}`);
        }
        return next;
    });
    if (trackState) {
        return applyIndexedTrackState(updated, 'sfx', trackState, 'SE');
    }
    return updated;
}
/**
 * SE の in/out（素材秒）を書き戻す。動画クリップのトリム（trimCutInSource）と同じ操作感に
 * 合わせ、左端ドラッグ（in の変更）は t も連動させる呼び出し側の責務で nextT を渡す。
 * null は「フィールドを削除して省略時意味論（in=0 / out=素材末尾）へ戻す」（undo 用）。
 */
function trimSfxInSource(source, sfxIndex, nextIn, nextOut, nextT) {
    if (nextIn !== null && (!Number.isFinite(nextIn) || nextIn < 0)) {
        throw new Error('SE in is invalid.');
    }
    if (nextOut !== null && (!Number.isFinite(nextOut) || nextOut <= 0)) {
        throw new Error('SE out is invalid.');
    }
    if (nextIn !== null && nextOut !== null && nextOut - nextIn < 0.1) {
        throw new Error('The sound effect is too short. It cannot be under 0.1 seconds.');
    }
    if (nextT !== undefined && (!Number.isFinite(nextT) || nextT < 0)) {
        throw new Error('SE start time is invalid.');
    }
    return updateArrayElementByIndex(source, 'sfx', sfxIndex, 'SE', element => {
        const label = `SE ${sfxIndex + 1}`;
        let next = element;
        if (nextT !== undefined) {
            next = hasTopLevelProperty(next, 't')
                ? replacePropertyValue(next, 't', nextT, label)
                : appendNumberProperty(next, 't', nextT);
        }
        if (nextIn === null) {
            next = hasTopLevelProperty(next, 'in') ? removeObjectProperty(next, 'in') : next;
        }
        else {
            next = hasTopLevelProperty(next, 'in')
                ? replacePropertyValue(next, 'in', nextIn, label)
                : appendNumberProperty(next, 'in', nextIn);
        }
        if (nextOut === null) {
            next = hasTopLevelProperty(next, 'out') ? removeObjectProperty(next, 'out') : next;
        }
        else {
            next = hasTopLevelProperty(next, 'out')
                ? replacePropertyValue(next, 'out', nextOut, label)
                : appendNumberProperty(next, 'out', nextOut);
        }
        return next;
    });
}
function setSfxGainDbInSource(source, sfxIndex, gainDb) {
    if (gainDb !== null && (!Number.isFinite(gainDb) || gainDb < -60 || gainDb > 12)) {
        throw new Error('gain_db must be from -60 to 12.');
    }
    return updateArrayElementByIndex(source, 'sfx', sfxIndex, 'SE', element => {
        const hasGain = hasTopLevelProperty(element, 'gain_db');
        if (gainDb === null) {
            return hasGain ? removeObjectProperty(element, 'gain_db') : element;
        }
        return hasGain
            ? replacePropertyValue(element, 'gain_db', gainDb, `SE ${sfxIndex + 1}`)
            : appendNumberProperty(element, 'gain_db', gainDb);
    });
}
function updateBgmInSource(source, updates) {
    if (updates.gainDb === undefined && updates.fadeIn === undefined
        && updates.fadeOut === undefined && updates.ducking === undefined) {
        throw new Error('Specify the BGM fields to change.');
    }
    if (updates.gainDb !== undefined && updates.gainDb !== null
        && (!Number.isFinite(updates.gainDb) || updates.gainDb < -60 || updates.gainDb > 12)) {
        throw new Error('gain_db must be from -60 to 12.');
    }
    if (updates.fadeIn !== undefined && updates.fadeIn !== null
        && (!Number.isFinite(updates.fadeIn) || updates.fadeIn < 0)) {
        throw new Error('fadeIn must be 0 or greater.');
    }
    if (updates.fadeOut !== undefined && updates.fadeOut !== null
        && (!Number.isFinite(updates.fadeOut) || updates.fadeOut < 0)) {
        throw new Error('fadeOut must be 0 or greater.');
    }
    if (updates.ducking !== undefined && updates.ducking !== null && typeof updates.ducking !== 'boolean') {
        throw new Error('ducking must be a boolean.');
    }
    const audio = locateTopLevelObjectProperty(source, 'audio');
    const located = locateTopLevelObjectProperty(audio.text, 'bgm');
    let next = located.text;
    const apply = (property, value) => {
        if (value === undefined) {
            return;
        }
        const has = hasTopLevelProperty(next, property);
        if (value === null) {
            next = has ? removeObjectProperty(next, property) : next;
            return;
        }
        next = has
            ? replacePropertyValue(next, property, value, 'bgm')
            : appendNumberProperty(next, property, value);
    };
    apply('gain_db', updates.gainDb);
    apply('fadeIn', updates.fadeIn);
    apply('fadeOut', updates.fadeOut);
    apply('ducking', updates.ducking);
    const nextAudio = audio.text.slice(0, located.start) + next + audio.text.slice(located.end);
    return source.slice(0, audio.start) + nextAudio + source.slice(audio.end);
}
function moveOverlayInSource(source, overlayId, nextStart, nextTrack, trackState) {
    if (!Number.isFinite(nextStart)) {
        throw new Error('Overlay start time is invalid.');
    }
    if (nextTrack !== undefined && nextTrack !== null && (!Number.isInteger(nextTrack) || nextTrack < 0)) {
        throw new Error('Overlay track is invalid.');
    }
    const updated = updateOverlay(source, overlayId, element => {
        let next = replaceNumberProperty(element, 'start', nextStart, `Overlay ${overlayId}`);
        if (!trackState && (nextTrack === null || (nextTrack !== undefined
            && normalizeTrack(readOptionalNumberProperty(element, 'track')) !== nextTrack))) {
            next = writeTrackProperty(next, nextTrack, `Overlay ${overlayId}`);
        }
        return next;
    });
    if (trackState) {
        return applyOverlayTrackState(updated, trackState);
    }
    return updated;
}
function resizeOverlayInSource(source, overlayId, nextDuration) {
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        throw new Error('Overlay duration must be a positive number.');
    }
    return updateOverlay(source, overlayId, element => replaceNumberProperty(element, 'duration', nextDuration, `Overlay ${overlayId}`));
}
function insertOverlayInSource(source, overlay) {
    const id = overlay.id;
    const start = overlay.start;
    const duration = overlay.duration;
    if (typeof id !== 'string' || !id || typeof start !== 'number' || !Number.isFinite(start)
        || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
        throw new Error('The overlay to add is not in a recognized format.');
    }
    const array = locateArray(source, 'overlays');
    const elements = splitTopLevelElements(array.inner);
    if (elements.some(element => readStringProperty(element.text, 'id') === id)) {
        throw new Error(`Overlay ${id} already exists.`);
    }
    const serialized = serializeLikeExistingElement(overlay, array.inner, elements);
    const trailingStart = elements.length > 0 ? elements[elements.length - 1].end : 0;
    const trailing = array.inner.slice(trailingStart);
    let nextInner;
    if (elements.length === 0) {
        const leading = array.inner.slice(0, trailingStart);
        const indent = indentationBeforeClose(array.inner);
        nextInner = `${leading}${indent}${serialized}${trailing}`;
    }
    else {
        const separator = separatorForAppend(array.inner, elements);
        nextInner = `${array.inner.slice(0, trailingStart)}${separator}${serialized}${trailing}`;
    }
    return source.slice(0, array.openIndex + 1) + nextInner + source.slice(array.closeIndex);
}
function removeOverlayInSource(source, overlayId) {
    const array = locateArray(source, 'overlays');
    const elements = splitTopLevelElements(array.inner);
    const index = elements.findIndex(element => readStringProperty(element.text, 'id') === overlayId);
    if (index < 0) {
        throw new Error(`Overlay ${overlayId} was not found.`);
    }
    let nextInner;
    if (elements.length === 1) {
        nextInner = array.inner.slice(elements[0].end);
    }
    else if (index < elements.length - 1) {
        nextInner = array.inner.slice(0, elements[index].start) + array.inner.slice(elements[index + 1].start);
    }
    else {
        nextInner = array.inner.slice(0, elements[index - 1].end) + array.inner.slice(elements[index].end);
    }
    return source.slice(0, array.openIndex + 1) + nextInner + source.slice(array.closeIndex);
}
function writeTimelineTracksInSource(source, tracks) {
    const serialized = JSON.stringify(tracks);
    let timeline;
    try {
        timeline = locateObjectProperty(source, 'timeline');
    }
    catch {
        const value = JSON.parse(source);
        if (Object.prototype.hasOwnProperty.call(value, 'timeline')) {
            value.timeline = { tracks };
            return `${JSON.stringify(value, undefined, 2)}${source.endsWith('\n') ? '\n' : ''}`;
        }
        return appendJsonProperty(source, 'timeline', { tracks });
    }
    let updatedTimeline;
    try {
        const array = locateArray(timeline.text, 'tracks');
        updatedTimeline = timeline.text.slice(0, array.openIndex)
            + serialized
            + timeline.text.slice(array.closeIndex + 1);
    }
    catch {
        updatedTimeline = appendJsonProperty(timeline.text, 'tracks', tracks);
    }
    return source.slice(0, timeline.start) + updatedTimeline + source.slice(timeline.end);
}
function locateArray(source, key) {
    const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(source);
    if (!match) {
        throw new Error(`edit.json has no ${key} array.`);
    }
    const openIndex = source.indexOf('[', match.index);
    const closeIndex = findMatchingBracket(source, openIndex);
    return { openIndex, closeIndex, inner: source.slice(openIndex + 1, closeIndex) };
}
function locateTopLevelProperty(scopeText, key) {
    const openIndex = scopeText.indexOf('{');
    const closeIndex = openIndex >= 0 ? findMatchingBracket(scopeText, openIndex) : -1;
    if (openIndex < 0 || closeIndex < 0) {
        return undefined;
    }
    const inner = scopeText.slice(openIndex + 1, closeIndex);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = splitTopLevelElements(inner)
        .filter(element => new RegExp(`^"${escapedKey}"\\s*:`).test(element.text));
    if (matches.length !== 1) {
        return undefined;
    }
    return {
        text: matches[0].text,
        start: openIndex + 1 + matches[0].start,
        end: openIndex + 1 + matches[0].end
    };
}
function hasTopLevelProperty(scopeText, key) {
    return locateTopLevelProperty(scopeText, key) !== undefined;
}
function locateTopLevelObjectProperty(scopeText, key) {
    const property = locateTopLevelProperty(scopeText, key);
    if (!property) {
        throw new Error(`"${key}" was not found.`);
    }
    const colonIndex = property.text.indexOf(':');
    const openIndex = scopeText.indexOf('{', property.start + colonIndex + 1);
    if (openIndex < 0 || openIndex >= property.end) {
        throw new Error(`"${key}" is not an object.`);
    }
    const closeIndex = findMatchingBracket(scopeText, openIndex);
    return { start: openIndex, end: closeIndex + 1, text: scopeText.slice(openIndex, closeIndex + 1) };
}
function locateObjectProperty(scopeText, key) {
    const match = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(scopeText);
    if (!match) {
        throw new Error(`"${key}" was not found.`);
    }
    const openIndex = scopeText.indexOf('{', match.index);
    const closeIndex = findMatchingBracket(scopeText, openIndex);
    return { start: openIndex, end: closeIndex + 1, text: scopeText.slice(openIndex, closeIndex + 1) };
}
function readCutsForSurgery(source) {
    const value = JSON.parse(source);
    if (!Array.isArray(value.cuts)) {
        throw new Error('edit.json has no cuts array.');
    }
    const cuts = value.cuts.map((raw, index) => {
        if (!raw || typeof raw !== 'object') {
            throw new Error(`Clip ${index + 1} is not in a recognized format.`);
        }
        const cut = raw;
        if (typeof cut.in !== 'number' || !Number.isFinite(cut.in)
            || typeof cut.out !== 'number' || !Number.isFinite(cut.out) || cut.out <= cut.in) {
            throw new Error(`Clip ${index + 1} time is invalid.`);
        }
        return {
            in: cut.in,
            out: cut.out,
            ...(typeof cut.speed === 'number' ? { speed: cut.speed } : {}),
            ...(typeof cut.at === 'number' ? { at: cut.at } : {}),
            ...(typeof cut.track === 'number' ? { track: cut.track } : {}),
            ...(cut.transition_out && typeof cut.transition_out === 'object'
                ? { transitionOut: cut.transition_out } : {})
        };
    });
    return { cuts, segments: computeCutTrackSegments(cuts), rawCuts: value.cuts };
}
function freezeNextImplicitCutAt(source, cutIndex, before) {
    const target = before.segments[cutIndex];
    if (!target) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    for (let index = cutIndex + 1; index < before.cuts.length; index++) {
        if (before.segments[index].track !== target.track) {
            continue;
        }
        const raw = before.rawCuts[index];
        return Object.prototype.hasOwnProperty.call(raw, 'at')
            ? source : writeCutAtProperty(source, index, before.segments[index].at);
    }
    return source;
}
function writeCutAtProperty(source, cutIndex, at) {
    return updateArrayElementByIndex(source, 'cuts', cutIndex, 'Clip', element => hasTopLevelProperty(element, 'at')
        ? replacePropertyValue(element, 'at', at, `Clip ${cutIndex + 1}`)
        : appendNumberProperty(element, 'at', at));
}
function updateArrayElementByIndex(source, key, index, label, update) {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error(`The ${label} index is invalid.`);
    }
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const element = elements[index];
    if (!element) {
        throw new Error(`${label} ${index + 1} was not found.`);
    }
    return replaceElement(source, array.openIndex + 1, element, update(element.text));
}
function updateArrayElementById(source, key, id, label, update) {
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const matches = elements.filter(element => readStringProperty(element.text, 'id') === id);
    if (matches.length !== 1) {
        throw new Error(matches.length === 0 ? `${label} ${id} was not found.` : `${label} ${id} appears more than once.`);
    }
    return replaceElement(source, array.openIndex + 1, matches[0], update(matches[0].text));
}
function rebuildArrayElements(source, array, elements, texts) {
    if (elements.length === 0) {
        return source;
    }
    let nextInner = array.inner.slice(0, elements[0].start);
    for (let index = 0; index < elements.length; index++) {
        nextInner += texts[index];
        nextInner += index + 1 < elements.length
            ? array.inner.slice(elements[index].end, elements[index + 1].start)
            : array.inner.slice(elements[index].end);
    }
    return source.slice(0, array.openIndex + 1) + nextInner + source.slice(array.closeIndex);
}
function applyIndexedTrackState(source, key, trackState, label) {
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const texts = elements.map((element, index) => {
        if (!Object.prototype.hasOwnProperty.call(trackState, String(index))) {
            return element.text;
        }
        return writeTrackProperty(element.text, trackState[String(index)], `${label} ${index + 1}`);
    });
    return rebuildArrayElements(source, array, elements, texts);
}
function applyIdTrackState(source, key, trackState, label) {
    const array = locateArray(source, key);
    const elements = splitTopLevelElements(array.inner);
    const texts = elements.map((element, index) => {
        const id = readStringProperty(element.text, 'id');
        if (!id || !Object.prototype.hasOwnProperty.call(trackState, id)) {
            return element.text;
        }
        return writeTrackProperty(element.text, trackState[id], `${label} ${id || index + 1}`);
    });
    return rebuildArrayElements(source, array, elements, texts);
}
function writeTrackProperty(source, track, label) {
    if (track !== null && (!Number.isInteger(track) || track < 0)) {
        throw new Error(`${label} track is invalid.`);
    }
    const hasTrack = hasTopLevelProperty(source, 'track');
    if (track === null) {
        return hasTrack ? removeObjectProperty(source, 'track') : source;
    }
    return hasTrack
        ? (readOptionalNumberProperty(source, 'track') === track
            ? source : replacePropertyValue(source, 'track', track, label))
        : appendNumberProperty(source, 'track', track);
}
function assertMovedCutDoesNotOverlap(source, cutIndex) {
    const { segments } = readCutsForSurgery(source);
    const moved = segments[cutIndex];
    if (!moved) {
        throw new Error(`Clip ${cutIndex + 1} was not found.`);
    }
    if (segments.some(segment => segment.index !== cutIndex && segment.track === moved.track
        && moved.at < segment.end && segment.at < moved.end)) {
        throw new Error('Spans overlap on the same clip track.');
    }
}
function replaceNumberProperty(source, property, value, label) {
    const located = locateTopLevelProperty(source, property);
    if (!located) {
        throw new Error(`Cannot locate ${label} ${property}.`);
    }
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^("${escapedProperty}"\\s*:\\s*)${JSON_NUMBER}$`);
    if (!pattern.test(located.text)) {
        throw new Error(`Cannot locate ${label} ${property}.`);
    }
    const updated = located.text.replace(pattern, (_match, prefix) => `${prefix}${JSON.stringify(value)}`);
    return source.slice(0, located.start) + updated + source.slice(located.end);
}
function readNumberProperty(source, property, label) {
    const value = readOptionalNumberProperty(source, property);
    if (value === undefined) {
        throw new Error(`Cannot locate ${label} ${property}.`);
    }
    return value;
}
function readOptionalNumberProperty(source, property) {
    const located = locateTopLevelProperty(source, property);
    if (!located) {
        return undefined;
    }
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^"${escapedProperty}"\\s*:\\s*(${JSON_NUMBER})$`).exec(located.text);
    return match ? Number(match[1]) : undefined;
}
function normalizeTrack(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}
function appendNumberProperty(source, property, value) {
    return appendJsonProperty(source, property, value);
}
function appendJsonProperty(source, property, value) {
    const closeIndex = source.lastIndexOf('}');
    if (closeIndex < 0) {
        throw new Error('Cannot locate the overlay object.');
    }
    const beforeClose = source.slice(0, closeIndex);
    const trailingWhitespace = beforeClose.match(/\s*$/)?.[0] ?? '';
    const body = beforeClose.slice(0, beforeClose.length - trailingWhitespace.length);
    if (!body.trim().endsWith('{')) {
        if (source.includes('\n')) {
            const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
            const propertyIndent = source.match(/(?:^|\r?\n)([ \t]+)"[^"\r\n]+"\s*:/)?.[1] ?? '  ';
            return `${body},${lineEnding}${propertyIndent}"${property}": ${JSON.stringify(value)}${trailingWhitespace}${source.slice(closeIndex)}`;
        }
        return `${body}, "${property}": ${JSON.stringify(value)}${trailingWhitespace}${source.slice(closeIndex)}`;
    }
    return `${body}"${property}": ${JSON.stringify(value)}${trailingWhitespace}${source.slice(closeIndex)}`;
}
function replacePropertyValue(source, property, value, label) {
    const located = locateTopLevelProperty(source, property);
    if (!located) {
        throw new Error(`Cannot locate ${label} ${property}.`);
    }
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^("${escapedProperty}"\\s*:\\s*)(?:${JSON_NUMBER}|"(?:\\\\.|[^"\\\\])*"|true|false|null)$`);
    if (!pattern.test(located.text)) {
        throw new Error(`Cannot locate ${label} ${property}.`);
    }
    const updated = located.text.replace(pattern, (_match, prefix) => `${prefix}${JSON.stringify(value)}`);
    return source.slice(0, located.start) + updated + source.slice(located.end);
}
function replaceTopLevelPropertyValue(source, property, value, label) {
    return replacePropertyValue(source, property, value, label);
}
function removeObjectProperty(source, property) {
    const openIndex = source.indexOf('{');
    const closeIndex = openIndex >= 0 ? findMatchingBracket(source, openIndex) : -1;
    if (openIndex < 0 || closeIndex < 0) {
        throw new Error('Cannot locate the overlay object.');
    }
    const inner = source.slice(openIndex + 1, closeIndex);
    const elements = splitTopLevelElements(inner);
    const index = elements.findIndex(element => new RegExp(`^"${property}"\\s*:`).test(element.text));
    if (index < 0) {
        return source;
    }
    let nextInner;
    if (elements.length === 1) {
        nextInner = inner.slice(elements[0].end);
    }
    else if (index < elements.length - 1) {
        nextInner = inner.slice(0, elements[index].start) + inner.slice(elements[index + 1].start);
    }
    else {
        nextInner = inner.slice(0, elements[index - 1].end) + inner.slice(elements[index].end);
    }
    return source.slice(0, openIndex + 1) + nextInner + source.slice(closeIndex);
}
function applyOverlayTrackState(source, trackState) {
    const array = locateArray(source, 'overlays');
    const elements = splitTopLevelElements(array.inner);
    let nextInner = array.inner;
    for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        const id = readStringProperty(element.text, 'id');
        if (!id || !Object.prototype.hasOwnProperty.call(trackState, id)) {
            continue;
        }
        const track = trackState[id];
        if (track !== null && (!Number.isInteger(track) || track < 0)) {
            throw new Error(`Overlay ${id} track is invalid.`);
        }
        const hasTrack = hasTopLevelProperty(element.text, 'track');
        const nextText = track === null
            ? (hasTrack ? removeObjectProperty(element.text, 'track') : element.text)
            : (hasTrack
                ? replacePropertyValue(element.text, 'track', track, `Overlay ${id}`)
                : appendNumberProperty(element.text, 'track', track));
        nextInner = nextInner.slice(0, element.start) + nextText + nextInner.slice(element.end);
    }
    return source.slice(0, array.openIndex + 1) + nextInner + source.slice(array.closeIndex);
}
function updateOverlay(source, overlayId, update) {
    const array = locateArray(source, 'overlays');
    const elements = splitTopLevelElements(array.inner);
    const matches = elements.filter(element => readStringProperty(element.text, 'id') === overlayId);
    if (matches.length !== 1) {
        throw new Error(matches.length === 0
            ? `Overlay ${overlayId} was not found.`
            : `Overlay ${overlayId} appears more than once.`);
    }
    const element = matches[0];
    return replaceElement(source, array.openIndex + 1, element, update(element.text));
}
function updateOverlayVarInSource(source, overlayId, varName, nextValue) {
    if (!overlayId || !varName || typeof nextValue !== 'string') {
        throw new Error('The overlay parameter update is invalid.');
    }
    return updateArrayElementById(source, 'overlays', overlayId, 'Overlay', element => {
        const vars = locateTopLevelObjectProperty(element, 'vars');
        const hasVar = hasTopLevelProperty(vars.text, varName);
        if (!hasVar) {
            throw new Error(`Parameter ${varName} of overlay ${overlayId} was not found.`);
        }
        const nextVarsText = replacePropertyValue(vars.text, varName, nextValue, `${varName} of overlay ${overlayId}`);
        return element.slice(0, vars.start) + nextVarsText + element.slice(vars.end);
    });
}
function replaceElement(source, innerOffset, element, nextText) {
    const start = innerOffset + element.start;
    const end = innerOffset + element.end;
    return source.slice(0, start) + nextText + source.slice(end);
}
function readStringProperty(source, property) {
    const located = locateTopLevelProperty(source, property);
    if (!located) {
        return undefined;
    }
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^"${escapedProperty}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"$`).exec(located.text);
    if (!match) {
        return undefined;
    }
    try {
        return JSON.parse(`"${match[1]}"`);
    }
    catch {
        return match[1];
    }
}
function separatorForAppend(inner, elements) {
    if (elements.length >= 2) {
        return inner.slice(elements[elements.length - 2].end, elements[elements.length - 1].start);
    }
    const indent = inner.slice(0, elements[0].start).match(/(?:^|\r?\n)([ \t]*)$/)?.[1] ?? '';
    const lineEnding = inner.includes('\r\n') ? '\r\n' : '\n';
    return `,${lineEnding}${indent}`;
}
function serializeLikeExistingElement(value, inner, elements) {
    const sample = elements[0]?.text;
    if (!sample || !sample.includes('\n')) {
        return JSON.stringify(value);
    }
    const indent = inner.slice(0, elements[0].start).match(/(?:^|\r?\n)([ \t]*)$/)?.[1] ?? '';
    return JSON.stringify(value, null, 2).replace(/\n/g, `\n${indent}`);
}
function indentationBeforeClose(inner) {
    if (!inner.includes('\n')) {
        return '';
    }
    const lineEnding = inner.includes('\r\n') ? '\r\n' : '\n';
    const closeIndent = inner.match(/(?:\r?\n)([ \t]*)$/)?.[1] ?? '';
    return `${lineEnding}${closeIndent}  `;
}
