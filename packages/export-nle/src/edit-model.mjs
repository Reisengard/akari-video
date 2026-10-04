// edit.json v2 を edit-store の内部表現で読み、書き出し器用モデルへ落とす。
// 版判定・tracks の検証は readInternalEdit に集約し、このパッケージでは版分岐しない。

import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { readInternalEdit, resolveInternalTrackZ } = require("../../edit-store/lib/index.js");

export function cutSpeed(cut) {
  const value = cut?.speed;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

// v2 の整数フレームを秒ベースの NLE 正規化モデルへ変える唯一の変換点。
export function itemFrameRange(item, fps) {
  return {
    start: item.atFrames / fps,
    duration: item.durationFrames / fps,
  };
}

// captions の start/end は素材秒アンカー。各 media item の絶対配置へ写す。
export function sourceRangeToTimelineRanges(start, end, cuts, sourceId = null) {
  if (!Array.isArray(cuts) || cuts.length === 0) {
    return [{ start, duration: end - start, sourceStart: start, sourceEnd: end }];
  }
  const ranges = [];
  for (const cut of cuts) {
    if (sourceId !== null && cut.src !== sourceId) continue;
    const overlapStart = Math.max(start, cut.in);
    const overlapEnd = Math.min(end, cut.out);
    if (overlapEnd > overlapStart) {
      const speed = cutSpeed(cut);
      ranges.push({
        start: cut.at + (overlapStart - cut.in) / speed,
        duration: (overlapEnd - overlapStart) / speed,
        sourceStart: overlapStart,
        sourceEnd: overlapEnd,
      });
    }
  }
  return ranges;
}

export function sourcePointToTimeline(t, cuts, sourceId = null) {
  const ranges = sourceRangeToTimelineRanges(t, t + 1e-6, cuts, sourceId);
  return ranges.length > 0 ? ranges[0].start : null;
}

export function loadEditFile(inputPath) {
  const absolute = resolve(inputPath);
  const stats = statSync(absolute);
  const editPath = stats.isDirectory() ? resolve(absolute, "edit.json") : absolute;
  const projectRoot = dirname(editPath);
  const edit = JSON.parse(readFileSync(editPath, "utf8"));
  return { edit, editPath, projectRoot };
}

export function normalizeEdit(edit, projectRoot) {
  const internal = readInternalEdit(edit);
  const rawEdit = typeof edit === "string" ? JSON.parse(edit) : edit;
  const fps = internal.output.fps;
  const warnings = [...internal.warnings];
  const unsupportedItems = declaredAudioItems(rawEdit);
  const sources = internal.sources
    .filter((source) => typeof source.path === "string")
    .map((source) => ({
      id: source.id,
      path: source.path,
      chroma_key: source.chromaKey ?? null,
    }));

  const videoTracks = internal.tracks
    .filter((track) => track.lane === "visual" && track.items.length > 0)
    .map((track) => {
      const z = resolveInternalTrackZ(internal.tracks, track.id);
      const clips = [];
      for (const item of track.items) {
        const range = itemFrameRange(item, fps);
        const field = `tracks[${track.id}].items[${item.id}].source`;
        switch (item.source.kind) {
          case "media": {
            const speed = positiveNumber(item.declaration.speed)
              ? item.declaration.speed
              : derivedSpeed(item.source, range.duration, fps);
            clips.push({
              kind: "media",
              id: item.id,
              z,
              at: range.start,
              duration: range.duration,
              src: item.source.sourceId,
              path: item.source.path,
              in: item.source.in,
              out: item.source.out,
              ...(speed !== undefined ? { speed } : {}),
              ...copyPresent(item.declaration, [
                "transform", "opacity", "blend", "crop", "perspective", "transition_out",
                "freeze", "fx", "chroma_key",
              ]),
            });
            break;
          }
          case "html": {
            const baked = bakedPath(item);
            if (baked) clips.push(bakedClip(item, range, z, baked));
            else unsupportedItems.push({
              field,
              reason: "html cannot run in an NLE, and a v2 html source has no baked picture, so it is not exported",
              hint: "Bake an alpha video in AKARI, place it as a telop that has baked, then export again",
            });
            break;
          }
          case "telop": {
            const baked = bakedPath(item);
            if (baked) clips.push(bakedClip(item, range, z, baked));
            else unsupportedItems.push({
              field,
              reason: "telop has no baked picture, so it cannot be converted to an NLE clip",
              hint: "Bake an alpha video in AKARI, set source.baked, then export again",
            });
            break;
          }
          case "filter":
            unsupportedItems.push({
              field,
              reason: "an AKARI filter source has no clip form that interops with an exchange format",
              hint: "Set the filter again in the destination, or bake it into the picture and then export",
            });
            break;
          default:
            unsupportedItems.push({ field, reason: "not exported because source.kind is unknown", hint: "Check the input with edit-lint" });
        }
      }
      return { id: track.id, z, clips };
    })
    .filter((track) => track.clips.length > 0)
    .sort((left, right) => left.z - right.z);

  const cuts = videoTracks.flatMap((track) => track.clips.filter((clip) => clip.kind === "media"));
  const layers = videoTracks.flatMap((track) => track.clips.filter((clip) => clip.kind === "baked"));
  const audio = isRecord(internal.declaration.audio) ? internal.declaration.audio : {};
  return {
    projectRoot,
    projectName: basename(projectRoot),
    output: internal.output,
    sources,
    videoTracks,
    cuts,
    layers,
    narration: Array.isArray(audio.narration) ? audio.narration : [],
    bgm: isRecord(audio.bgm) ? audio.bgm : null,
    sfx: Array.isArray(audio.sfx) ? audio.sfx : [],
    master: audio.master ?? null,
    beats: internal.beats ?? [],
    emphasisWords: Array.isArray(internal.declaration.emphasisWords) ? internal.declaration.emphasisWords : [],
    direction: null,
    unsupportedItems,
    warnings,
  };
}

// readInternalEdit は edit.audio.* を既存の declared audio track にも射影する。
// 正規化後の items では由来を区別できないため、入力 tracks[] に実在する item だけを報告する。
function declaredAudioItems(edit) {
  if (!isRecord(edit) || !Array.isArray(edit.tracks)) return [];
  return edit.tracks.flatMap((track) => {
    if (!isRecord(track) || track.lane !== "audio" || !Array.isArray(track.items)) return [];
    return track.items.filter(isRecord).map((item, index) => ({
      field: `tracks[${typeof track.id === "string" ? track.id : "?"}].items[${typeof item.id === "string" ? item.id : index}]`,
      reason: "audio is not yet an official export input on tracks[], so this declaration is unused",
      hint: "Declare the audio on edit.audio.narration, sfx, or bgm in the current contract",
    }));
  });
}

function bakedPath(item) {
  if (typeof item.source.baked === "string" && item.source.baked.trim() !== "") return item.source.baked;
  if (typeof item.declaration.baked === "string" && item.declaration.baked.trim() !== "") return item.declaration.baked;
  return null;
}

function bakedClip(item, range, z, path) {
  return {
    kind: "baked",
    id: item.id,
    z,
    at: range.start,
    duration: range.duration,
    path,
    ...copyPresent(item.declaration, ["transform", "opacity", "blend", "crop", "perspective", "chroma_key"]),
  };
}

function derivedSpeed(source, duration, fps) {
  if (!(duration > 0)) return undefined;
  const span = source.out - source.in;
  return Math.abs(span - duration) > 1 / fps + 1e-9 ? span / duration : undefined;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function copyPresent(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function baseTimelineDuration(model) {
  let end = 0;
  for (const track of model.videoTracks) {
    for (const clip of track.clips) end = Math.max(end, clip.at + clip.duration);
  }
  for (const item of model.sfx ?? []) {
    if (typeof item.t !== "number") continue;
    const inPoint = typeof item.in === "number" ? item.in : 0;
    if (typeof item.out === "number" && item.out > inPoint) {
      end = Math.max(end, item.t + (item.out - inPoint));
    }
  }
  return end;
}
