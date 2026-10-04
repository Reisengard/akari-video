import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveFfprobe } from "../../../media-bin/src/index.mjs";
import { loadPartsSet, requirePartsVowelAssets } from "./parts-set.mjs";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

export function validateSpriteManifest(manifest) {
  const errors = [];
  if (!record(manifest)) return { ok: false, errors: ["sprite.json root must be an object"] };
  if (manifest.version !== 0) errors.push("version must be the integer 0");
  if (!record(manifest.size) || !Number.isInteger(manifest.size.width) || manifest.size.width < 2
      || !Number.isInteger(manifest.size.height) || manifest.size.height < 2) {
    errors.push("size.width / size.height must be an integer >= 2");
  }
  if (!record(manifest.anchor) || !Number.isFinite(manifest.anchor.x) || !Number.isFinite(manifest.anchor.y)
      || manifest.anchor.x < 0 || manifest.anchor.x > 1 || manifest.anchor.y < 0 || manifest.anchor.y > 1) {
    errors.push("anchor.x / anchor.y must be a finite number from 0 to 1");
  }
  if (typeof manifest.base !== "string" || manifest.base.trim() === "") errors.push("base must be a non-empty string");
  for (const [groupName, keys] of [["mouth", ["closed", "mid", "open"]], ["eyes", ["open", "closed"]]]) {
    const group = manifest[groupName];
    if (!record(group)) {
      errors.push(`${groupName} must be an object`);
      continue;
    }
    for (const key of keys) {
      if (typeof group[key] !== "string" || group[key].trim() === "") {
        errors.push(`${groupName}.${key} must be a non-empty string`);
      }
    }
    for (const [key, value] of Object.entries(group)) {
      if (typeof value !== "string" || value.trim() === "") errors.push(`${groupName}.${key} must be a non-empty string`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function requireVowelMouthAssets(spriteSet) {
  if (spriteSet?.kind === "parts-v2") return requirePartsVowelAssets(spriteSet);
  const manifest = spriteSet?.manifest ?? spriteSet;
  const missing = ["a", "i", "u", "e", "o"].filter((key) => (
    !record(manifest?.mouth) || typeof manifest.mouth[key] !== "string" || manifest.mouth[key].trim() === ""
  ));
  if (missing.length > 0) {
    throw new Error(`vowel mode requires mouth.a/i/u/e/o in sprite.json (missing: ${missing.join(", ")})`);
  }
  return spriteSet;
}

export function loadSpriteSet(spriteDir, { ffprobeCommand } = {}) {
  const root = realpathSync(resolve(spriteDir));
  const manifestPath = join(root, "sprite.json");
  const partsPath = join(root, "parts.json");
  if (!existsSync(manifestPath)) {
    if (existsSync(partsPath)) return loadPartsSet(root, { ffprobeCommand });
    throw new Error(`sprite.json or parts.json was not found: ${root}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const structural = validateSpriteManifest(manifest);
  if (!structural.ok) throw new Error(structural.errors.join("; "));
  const refs = new Map([["base", manifest.base]]);
  for (const [key, value] of Object.entries(manifest.mouth)) refs.set(`mouth.${key}`, value);
  for (const [key, value] of Object.entries(manifest.eyes)) refs.set(`eyes.${key}`, value);
  const command = ffprobeCommand ?? resolveFfprobe();
  const assets = {};
  for (const [name, ref] of refs) {
    if (isAbsolute(ref)) throw new Error(`${name} must be a directory-relative path`);
    const candidate = resolve(root, ref);
    if (!existsSync(candidate)) throw new Error(`PNG for ${name} was not found: ${ref}`);
    const resolved = realpathSync(candidate);
    if (!inside(root, resolved)) throw new Error(`${name} refers to a path outside the sprite directory: ${ref}`);
    if (extname(resolved).toLowerCase() !== ".png") throw new Error(`${name} must refer to a PNG: ${ref}`);
    const dimensions = probePng(resolved, command);
    if (dimensions.width !== manifest.size.width || dimensions.height !== manifest.size.height) {
      throw new Error(`${name} has dimensions ${dimensions.width}x${dimensions.height}, which do not match size `
        + `${manifest.size.width}x${manifest.size.height}`);
    }
    assets[name] = resolved;
  }
  return { root, manifest, assets };
}
