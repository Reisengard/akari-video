#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KNOWN_ENTRY_FIELDS = new Set([
  "surface", "variants", "reading", "kind", "protect_break", "source", "added_at", "hits",
]);
const KINDS = new Set(["term", "notation", "ng", "reading-only"]);
const READING_PATTERN = /^[ぁ-ゖァ-ヺー]+$/u;
const usage = "Usage: node packages/schemas/bin/validate-word-book.mjs <word-book.json>";

export function normalizeWordBookKey(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase().replace(/\s/gu, "");
}

export function validateWordBook(value) {
  const errors = [];
  const info = [];
  const fail = (message) => errors.push(message);

  if (!isPlainObject(value)) {
    fail("word-book.json root must be an object");
    return { valid: false, errors, info, tooNew: false };
  }
  if (Number.isInteger(value.version) && value.version > 0) {
    fail(`version ${value.version} is newer than this validator supports. This file uses a newer format. Update the skills or the app.`);
    return { valid: false, errors, info, tooNew: true };
  }
  for (const key of Object.keys(value)) {
    if (key !== "version" && key !== "entries") fail(`root.${key} is an unknown field`);
  }
  if (!Object.hasOwn(value, "version")) fail("version is required");
  else if (value.version !== 0) fail("version must be 0");
  if (!Object.hasOwn(value, "entries")) {
    fail("entries is required");
    return { valid: errors.length === 0, errors, info, tooNew: false };
  }
  if (!Array.isArray(value.entries)) {
    fail("entries must be an array");
    return { valid: false, errors, info, tooNew: false };
  }

  const surfaces = new Map();
  const variants = new Map();
  for (const [index, entry] of value.entries.entries()) {
    const label = `entries[${index}]`;
    if (!isPlainObject(entry)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!KNOWN_ENTRY_FIELDS.has(key)) info.push(`word-book.unknown-field: ${label}.${key}`);
    }
    if (!Object.hasOwn(entry, "surface")) {
      fail(`${label}.surface is required`);
    } else if (typeof entry.surface !== "string" || entry.surface.length === 0 || !/\S/u.test(entry.surface)) {
      fail(`${label}.surface must be a non-empty string`);
    } else {
      if (entry.surface.trim() !== entry.surface) fail(`${label}.surface must not have leading or trailing whitespace`);
      if (entry.surface.normalize("NFC") !== entry.surface) fail(`${label}.surface must be NFC`);
      const key = normalizeWordBookKey(entry.surface);
      if (surfaces.has(key)) fail(`${label}.surface normalized key duplicates entries[${surfaces.get(key)}].surface`);
      else surfaces.set(key, index);
    }
    if (!Object.hasOwn(entry, "kind")) fail(`${label}.kind is required`);
    else if (!KINDS.has(entry.kind)) fail(`${label}.kind must be one of term / notation / ng / reading-only`);

    const entryVariants = entry.variants ?? [];
    if (!Array.isArray(entryVariants)) {
      fail(`${label}.variants must be an array`);
    } else {
      const local = new Set();
      for (const [variantIndex, variant] of entryVariants.entries()) {
        const variantLabel = `${label}.variants[${variantIndex}]`;
        if (typeof variant !== "string" || variant.length === 0 || !/\S/u.test(variant)) {
          fail(`${variantLabel} must be a non-empty string`);
          continue;
        }
        const key = normalizeWordBookKey(variant);
        if (local.has(variant)) fail(`${label}.variants contains a duplicate string: ${JSON.stringify(variant)}`);
        local.add(variant);
        const owner = variants.get(key);
        if (owner !== undefined && owner !== index) {
          fail(`${variantLabel} normalized key collides with entries[${owner}].variants`);
        } else {
          variants.set(key, index);
        }
      }
    }
    if (entry.kind === "reading-only") {
      if (typeof entry.reading !== "string" || !READING_PATTERN.test(entry.reading)) {
        fail(`${label}.reading is required for reading-only and must be a kana + long-vowel-mark string`);
      }
      if (Array.isArray(entryVariants) && entryVariants.length > 0) {
        fail(`${label}.variants must be empty when reading-only`);
      }
    } else if (Object.hasOwn(entry, "reading") && (typeof entry.reading !== "string" || !READING_PATTERN.test(entry.reading))) {
      fail(`${label}.reading must be hiragana, katakana, and long-vowel marks only`);
    }
    if (entry.kind === "notation" && (!Array.isArray(entryVariants) || entryVariants.length < 1)) {
      fail(`${label}.variants must have at least 1 item for notation`);
    }
    if (Object.hasOwn(entry, "protect_break") && typeof entry.protect_break !== "boolean") fail(`${label}.protect_break must be a boolean`);
    if (Object.hasOwn(entry, "source") && typeof entry.source !== "string") fail(`${label}.source must be a string`);
    if (Object.hasOwn(entry, "added_at") && (typeof entry.added_at !== "string" || !isIsoDateTime(entry.added_at))) fail(`${label}.added_at must be an ISO 8601 date-time`);
    if (Object.hasOwn(entry, "hits") && (!Number.isInteger(entry.hits) || entry.hits < 0)) fail(`${label}.hits must be an integer >= 0`);
  }
  return { valid: errors.length === 0, errors, info, tooNew: false };
}

export function runValidateWordBookCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? ((line) => console.log(line));
  const stderr = io.stderr ?? ((line) => console.error(line));
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    stdout(usage);
    return 0;
  }
  if (argv.length !== 1) {
    stderr(usage);
    return 2;
  }
  const filePath = path.resolve(argv[0]);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    stderr(`NG: ${filePath}`);
    stderr(`- word-book.json could not be read: ${messageOf(error)}`);
    return 1;
  }
  const result = validateWordBook(value);
  for (const message of result.info) stderr(`info: ${message}`);
  if (!result.valid) {
    stderr(`NG: ${filePath}`);
    for (const message of result.errors) stderr(`- ${message}`);
    return 1;
  }
  stdout(`OK: ${filePath}`);
  return 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) process.exitCode = runValidateWordBookCli();
