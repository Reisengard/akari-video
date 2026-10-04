import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { checkWorldMap } from "./invariants.mjs";
import { normalizeWorldMap } from "./normalize.mjs";

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const UNMEASURED_COVER_NOTE = "The cover is not measured. Run `akari world preview --measure` first";

export function formatCoordinateNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Coordinates must be finite numbers");
  if (Number.isInteger(value)) return String(value);
  const source = String(value);
  if (!/[eE]/.test(source)) return source.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  const [coefficient, exponentText] = source.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const negative = coefficient.startsWith("-");
  const digits = coefficient.replace("-", "").replace(".", "");
  const decimal = coefficient.replace("-", "").indexOf(".");
  const integerDigits = decimal < 0 ? digits.length : decimal;
  const decimalIndex = integerDigits + exponent;
  const expanded = decimalIndex <= 0
    ? `0.${"0".repeat(-decimalIndex)}${digits}`
    : decimalIndex >= digits.length
      ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
      : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return `${negative ? "-" : ""}${expanded}`.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function withinWorldBounds(world, point) {
  const bounds = world?.flat?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !Array.isArray(point) || point.length < 2) return false;
  const [bx, by, bw, bh] = bounds;
  const [x, y] = point;
  return [bx, by, bw, bh, x, y].every((value) => typeof value === "number" && Number.isFinite(value))
    && bx <= x && x <= bx + bw && by <= y && y <= by + bh;
}

export function replaceStopCoordinate(text, stopId, c) {
  assertCoordinate(c);
  const cameraStops = topLevelArray(text, "cameraStops");
  let stop;
  for (const range of directObjects(text, cameraStops.start, cameraStops.end)) {
    let parsed;
    try { parsed = JSON.parse(text.slice(range.start, range.end)); } catch { continue; }
    if (parsed?.id === stopId) { stop = range; break; }
  }
  if (!stop) throw new Error(`cameraStops in world-map.json has no stop ${stopId}`);
  const property = directPropertyArray(text, stop.start, stop.end, "c");
  if (!property) throw new Error(`cameraStop ${stopId} has no c`);
  const literals = directNumberLiterals(text, property.start, property.end);
  if (literals.length < c.length) throw new Error(`c of cameraStop ${stopId} has fewer than ${c.length} elements`);
  let result = text;
  for (let index = c.length - 1; index >= 0; index -= 1) {
    const literal = literals[index];
    result = result.slice(0, literal.start) + formatCoordinateNumber(c[index]) + result.slice(literal.end);
  }
  return result;
}

export async function moveWorldStop(projectRoot, options = {}) {
  const file = path.resolve(projectRoot, "planning", "world-map.json");
  const read = options.readFileImpl ?? readFile;
  const write = options.writeFileImpl ?? writeFile;
  const check = options.check ?? checkWorldMap;
  let text;
  try { text = await read(file, "utf8"); } catch (error) { return failure("IO", error, file); }
  let source;
  try { source = JSON.parse(text); } catch (error) { return failure("PARSE", error, file); }
  if (typeof source?.schemaVersion === "number" && source.schemaVersion > 3) return failure("VERSION", `schemaVersion ${source.schemaVersion} is not supported`, file);
  const map = source?.schemaVersion === 3 ? source : normalizeWorldMap(source).map;
  const beforeChecked = check(map, { strict: false });
  if (map?.kind !== "flat") return failure("KIND", "Spatial stops cannot be moved (flat only)", file);
  const stop = Array.isArray(map?.cameraStops) ? map.cameraStops.find((candidate) => candidate?.id === options.stopId) : undefined;
  if (!stop) return failure("NO_STOP", `cameraStops in world-map.json has no stop ${options.stopId}`, file);
  try { assertCoordinate(options.c); } catch (error) { return failure("ARG", error, file); }
  if (options.c.length === 3 && !(options.c[2] > 0)) return failure("ARG", "scale must be greater than 0", file);
  const world = Array.isArray(map?.worlds) ? map.worlds.find((candidate) => candidate?.id === stop.world) : undefined;
  if (!withinWorldBounds(world, options.c)) return failure("BOUNDS", `Cannot move outside the bounds ${JSON.stringify(world?.flat?.bounds)} of world ${stop.world}`, file);
  const rounded = options.c.map((value, index) => round(value, index === 2 ? 4 : 3));
  let next;
  try { next = replaceStopCoordinate(text, options.stopId, rounded); } catch (error) { return failure("WRITE_BACK", error, file); }
  let nextSource;
  try { nextSource = JSON.parse(next); } catch (error) { return failure("WRITE_BACK", error, file); }
  const map2 = nextSource?.schemaVersion === 3 ? nextSource : normalizeWorldMap(nextSource).map;
  const checked = check(map2, { strict: false });
  const previousC7 = new Set(beforeChecked.errors.filter((finding) => finding.code === "C7").map(findingKey));
  const ignoredC7 = checked.errors.filter((finding) => finding.code === "C7" && previousC7.has(findingKey(finding)));
  const errors = checked.errors.filter((finding) => finding.code !== "C7" || !previousC7.has(findingKey(finding)));
  if (errors.length > 0) {
    const hasNewC7 = errors.some((finding) => finding.code === "C7");
    const reason = `world-map.json violates the invariants after write-back${hasNewC7 ? `. ${UNMEASURED_COVER_NOTE}` : ""}`;
    return { ...failure("INVARIANT", reason, file), errors };
  }
  const before = Array.isArray(stop.c) ? [...stop.c] : [];
  const after = [...before];
  rounded.forEach((value, index) => { after[index] = value; });
  const nextStop = Array.isArray(map2?.cameraStops) ? map2.cameraStops.find((candidate) => candidate?.id === options.stopId) : undefined;
  if (!isDeepStrictEqual(nextStop?.c, after)) return failure("WRITE_BACK", "Could not reload the written-back coordinates", file);
  const expected = structuredClone(source);
  const expectedStop = Array.isArray(expected?.cameraStops) ? expected.cameraStops.find((candidate) => candidate?.id === options.stopId) : undefined;
  if (!expectedStop || !Array.isArray(expectedStop.c)) return failure("WRITE_BACK", "Could not verify the original stop coordinates", file);
  expectedStop.c = after;
  if (!isDeepStrictEqual(expected, nextSource)) return failure("WRITE_BACK", "Something other than the stop coordinates was changed", file);
  const changed = next !== text;
  if (changed) {
    try { await write(file, next, "utf8"); } catch (error) { return failure("IO", error, file); }
  }
  return { ok: true, file, stopId: options.stopId, before, after, changed, notes: ignoredC7.length ? [UNMEASURED_COVER_NOTE] : [] };
}

function findingKey(finding) {
  return `${finding.code}\u0000${finding.message}`;
}

function assertCoordinate(c) {
  if (!Array.isArray(c) || c.length < 2 || c.length > 3 || !c.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new TypeError("c must be an array of 2 or 3 finite numbers");
  }
}

function failure(code, reason, file) {
  return { ok: false, code, reason: reason instanceof Error ? reason.message : String(reason), file };
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function topLevelArray(text, key) {
  const marker = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*\\[`, "g");
  for (const match of text.matchAll(marker)) {
    const state = structuralState(text, match.index);
    if (state.objectDepth !== 1 || state.arrayDepth !== 0) continue;
    const start = match.index + match[0].lastIndexOf("[");
    return { start, end: matchingEnd(text, start, "[", "]", `The ${key} array in world-map.json is not closed`) };
  }
  throw new Error(`world-map.json has no "${key}"`);
}

function directObjects(text, arrayStart, arrayEnd) {
  const ranges = [];
  let string = false, escaped = false, arrayDepth = 0, objectDepth = 0, start = -1;
  for (let index = arrayStart + 1; index < arrayEnd - 1; index += 1) {
    const char = text[index];
    if (string) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') string = false; continue; }
    if (char === '"') string = true;
    else if (char === "[") arrayDepth += 1;
    else if (char === "]") arrayDepth -= 1;
    else if (char === "{" && arrayDepth === 0) { if (objectDepth++ === 0) start = index; }
    else if (char === "}" && arrayDepth === 0 && --objectDepth === 0) ranges.push({ start, end: index + 1 });
  }
  return ranges;
}

function directPropertyArray(text, objectStart, objectEnd, key) {
  const marker = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*\\[`, "g");
  marker.lastIndex = objectStart + 1;
  let match;
  while ((match = marker.exec(text)) && match.index < objectEnd) {
    const state = structuralState(text, match.index, objectStart);
    if (state.objectDepth !== 1 || state.arrayDepth !== 0) continue;
    const start = match.index + match[0].lastIndexOf("[");
    return { start, end: matchingEnd(text, start, "[", "]", `The ${key} array of the cameraStop is not closed`) };
  }
  return undefined;
}

function directNumberLiterals(text, start, end) {
  const result = [];
  let index = start + 1;
  while (index < end - 1) {
    if (/\s|,/.test(text[index])) { index += 1; continue; }
    NUMBER.lastIndex = index;
    const match = NUMBER.exec(text);
    if (!match || match.index >= end) throw new Error("c of the cameraStop has a non-numeric element");
    result.push({ start: index, end: NUMBER.lastIndex });
    index = NUMBER.lastIndex;
  }
  return result;
}

function matchingEnd(text, start, open, close, message) {
  let depth = 0, string = false, escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (string) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') string = false; }
    else if (char === '"') string = true;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return index + 1;
  }
  throw new Error(message);
}

function structuralState(text, end, start = 0) {
  let objectDepth = 0, arrayDepth = 0, string = false, escaped = false;
  for (let index = start; index < end; index += 1) {
    const char = text[index];
    if (string) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') string = false; }
    else if (char === '"') string = true;
    else if (char === "{") objectDepth += 1;
    else if (char === "}") objectDepth -= 1;
    else if (char === "[") arrayDepth += 1;
    else if (char === "]") arrayDepth -= 1;
  }
  return { objectDepth, arrayDepth };
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
