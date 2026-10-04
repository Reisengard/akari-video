import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveFfprobe } from "../../../media-bin/src/index.mjs";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finitePoint(value) {
  return record(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function probePng(path, ffprobeCommand) {
  const result = spawnSync(ffprobeCommand, [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
    "-of", "json", path,
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read PNG dimensions: ${path}: ${String(result.stderr || result.error?.message).trim()}`);
  }
  const stream = JSON.parse(result.stdout)?.streams?.[0];
  if (!(Number.isInteger(stream?.width) && Number.isInteger(stream?.height))) {
    throw new Error(`Invalid PNG dimensions: ${path}`);
  }
  return { width: stream.width, height: stream.height };
}

function validateStates(states, label, errors) {
  if (states === "always") return;
  if (!record(states)) {
    errors.push(`${label}.states must be "always" or an object`);
    return;
  }
  const known = new Set(["mouth", "eyes", "emotion"]);
  if (Object.keys(states).length === 0) errors.push(`${label}.states must not be empty`);
  for (const [drive, values] of Object.entries(states)) {
    if (!known.has(drive)) errors.push(`${label}.states.${drive} is not a supported drive sequence`);
    if (!Array.isArray(values) || values.length === 0
        || values.some((value) => typeof value !== "string" || value.trim() === "")) {
      errors.push(`${label}.states.${drive} must be an array of non-empty strings`);
    }
  }
}

function validatePhysics(physics, label, errors) {
  if (physics === undefined) return;
  if (!record(physics)) {
    errors.push(`${label}.physics must be an object`);
    return;
  }
  if (physics.wobble !== undefined) {
    if (!record(physics.wobble)) errors.push(`${label}.physics.wobble must be an object`);
    else for (const axis of ["x", "y"]) {
      const wave = physics.wobble[axis];
      if (wave === undefined) continue;
      if (!record(wave) || !Number.isFinite(wave.amplitude) || !Number.isFinite(wave.frequency)
          || wave.frequency < 0 || (wave.phase !== undefined && !Number.isFinite(wave.phase))) {
        errors.push(`${label}.physics.wobble.${axis} must have finite amplitude/frequency/phase`);
      }
    }
  }
  if (physics.follow !== undefined
      && (!record(physics.follow) || !Number.isFinite(physics.follow.drag) || physics.follow.drag < 1)) {
    errors.push(`${label}.physics.follow.drag must be a finite number >= 1`);
  }
  if (physics.rotationalDrag !== undefined) {
    const value = physics.rotationalDrag;
    if (!record(value) || !Number.isFinite(value.strength)
        || (value.minDeg !== undefined && !Number.isFinite(value.minDeg))
        || (value.maxDeg !== undefined && !Number.isFinite(value.maxDeg))
        || (value.lerp !== undefined && (!Number.isFinite(value.lerp) || value.lerp <= 0 || value.lerp > 1))) {
      errors.push(`${label}.physics.rotationalDrag has invalid strength/minDeg/maxDeg/lerp`);
    } else if ((value.minDeg ?? -180) > (value.maxDeg ?? 180)) {
      errors.push(`${label}.physics.rotationalDrag must be satisfying minDeg <= maxDeg`);
    }
  }
  if (physics.talkBounce !== undefined) {
    const value = physics.talkBounce;
    if (!record(value) || !Number.isFinite(value.velocity) || value.velocity < 0
        || !Number.isFinite(value.gravity) || value.gravity < 0) {
      errors.push(`${label}.physics.talkBounce velocity/gravity must be finite numbers >= 0`);
    }
  }
}

export function validatePartsManifest(manifest) {
  const errors = [];
  if (!record(manifest)) return { ok: false, errors: ["parts.json root must be an object"] };
  if (manifest.version !== 2) errors.push("version must be the integer 2");
  if (!record(manifest.size) || !Number.isInteger(manifest.size.width) || manifest.size.width < 2
      || !Number.isInteger(manifest.size.height) || manifest.size.height < 2) {
    errors.push("size.width / size.height must be an integer >= 2");
  }
  if (!record(manifest.anchor) || !Number.isFinite(manifest.anchor.x) || !Number.isFinite(manifest.anchor.y)
      || manifest.anchor.x < 0 || manifest.anchor.x > 1 || manifest.anchor.y < 0 || manifest.anchor.y > 1) {
    errors.push("anchor.x / anchor.y must be a finite number from 0 to 1");
  }
  if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    errors.push("parts must be a non-empty array");
    return { ok: false, errors };
  }

  const ids = new Set();
  for (const [index, part] of manifest.parts.entries()) {
    const label = `parts[${index}]`;
    if (!record(part)) { errors.push(`${label} must be an object`); continue; }
    if (typeof part.id !== "string" || !/^[A-Za-z0-9_.-]+$/.test(part.id)) errors.push(`${label}.id is invalid`);
    else if (ids.has(part.id)) errors.push(`${label}.id ${part.id} is duplicated`);
    else ids.add(part.id);
    if (typeof part.image !== "string" || part.image.trim() === "") errors.push(`${label}.image must be a non-empty string`);
    if (!(part.parent === null || typeof part.parent === "string")) errors.push(`${label}.parent must be null or an id string`);
    if (!finitePoint(part.offset)) errors.push(`${label}.offset.x/y must be a finite number`);
    if (!finitePoint(part.origin)) errors.push(`${label}.origin.x/y must be a finite number`);
    if (!Number.isFinite(part.z)) errors.push(`${label}.z must be a finite number`);
    validateStates(part.states, label, errors);
    validatePhysics(part.physics, label, errors);
  }

  const byId = new Map(manifest.parts.filter(record).map((part) => [part.id, part]));
  for (const part of manifest.parts.filter(record)) {
    if (typeof part.parent === "string" && !byId.has(part.parent)) errors.push(`parent ${part.parent} of part ${part.id} does not exist`);
    if (part.parent === part.id) errors.push(`part ${part.id} cannot be its own parent`);
    const seen = new Set([part.id]);
    let cursor = part;
    while (typeof cursor?.parent === "string") {
      if (seen.has(cursor.parent)) { errors.push(`parent chain of part ${part.id} is circular`); break; }
      seen.add(cursor.parent);
      cursor = byId.get(cursor.parent);
    }
  }
  if (!manifest.parts.some((part) => record(part) && part.parent === null)) errors.push("parent:null root part is required");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function topologicalParts(parts) {
  const pending = new Map(parts.map((part, index) => [part.id, { ...part, declarationIndex: index }]));
  const ordered = [];
  while (pending.size > 0) {
    let advanced = false;
    for (const [id, part] of pending) {
      if (part.parent === null || ordered.some((candidate) => candidate.id === part.parent)) {
        ordered.push(part);
        pending.delete(id);
        advanced = true;
      }
    }
    if (!advanced) throw new Error("Cannot resolve the parent chain in parts.json");
  }
  return ordered;
}

export function loadPartsSet(partsDir, { ffprobeCommand } = {}) {
  const root = realpathSync(resolve(partsDir));
  const manifestPath = join(root, "parts.json");
  if (!existsSync(manifestPath)) throw new Error(`parts.json was not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const structural = validatePartsManifest(manifest);
  if (!structural.ok) throw new Error(structural.errors.join("; "));
  const command = ffprobeCommand ?? resolveFfprobe();
  const assets = {};
  for (const part of manifest.parts) {
    const ref = part.image;
    if (isAbsolute(ref)) throw new Error(`part ${part.id}.image must be a directory-relative path`);
    const candidate = resolve(root, ref);
    if (!existsSync(candidate)) throw new Error(`PNG for part ${part.id} was not found: ${ref}`);
    const resolved = realpathSync(candidate);
    if (!inside(root, resolved)) throw new Error(`part ${part.id} refers to a path outside the parts directory: ${ref}`);
    if (extname(resolved).toLowerCase() !== ".png") throw new Error(`part ${part.id} must refer to a PNG: ${ref}`);
    assets[part.id] = { path: resolved, ...probePng(resolved, command) };
  }
  return { root, manifest, assets, parts: topologicalParts(manifest.parts), kind: "parts-v2" };
}

export function requirePartsVowelAssets(partsSet) {
  const values = new Set();
  for (const part of partsSet.parts) {
    if (part.states !== "always") for (const value of part.states.mouth ?? []) values.add(value);
  }
  const missing = ["closed", "a", "i", "u", "e", "o"].filter((value) => !values.has(value));
  if (missing.length > 0) throw new Error(`vowel mode requires states.mouth in parts.json to have closed/a/i/u/e/o (missing: ${missing.join(", ")})`);
  return partsSet;
}
