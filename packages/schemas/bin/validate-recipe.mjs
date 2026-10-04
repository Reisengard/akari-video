#!/usr/bin/env node

// recipe.json v0（レシピ凍結と好みの記憶）の構造を検証する。
// docs/contract-2026-07-25-recipe-v0.md 参照。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-recipe.mjs <recipe.json>";
const recipeArgument = process.argv[2];

if (!recipeArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (recipeArgument === "--help" || recipeArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const recipePath = path.resolve(recipeArgument);
const schemaPath = fileURLToPath(new URL("../recipe.schema.json", import.meta.url));
const errors = [];

const WORKFLOWS = new Set(["edit", "research"]);
const ASPECTS = new Set(["16:9", "9:16", "1:1"]);
const CONFIRMED_BY = new Set(["intake", "structure-confirm", "edit-approval", "render-approval"]);
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

if (!isRegularFile(recipePath)) {
  fail(`recipe.json was not found: ${recipePath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`recipe.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:recipe:v0") {
  fail("recipe.schema.json $id does not match the v0 contract");
  finish();
}

let recipe;
try {
  recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
} catch (error) {
  fail(`recipe.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validateRecipe(recipe);
finish();

function validateRecipe(value) {
  if (!isPlainObject(value)) {
    fail("recipe.json root must be an object");
    return;
  }
  if (Number.isInteger(value.version) && value.version > 0) {
    fail(
      `version ${value.version} is newer than this validator supports. This file uses a newer format. Update the skills or the app.`,
    );
    return;
  }
  if (!hasOwn(value, "version")) {
    fail("version is required");
  } else if (value.version !== 0) {
    fail("version must be 0");
  }
  if (!hasOwn(value, "name")) {
    fail("name is required");
  } else if (!isNonEmptyString(value.name) || !NAME_PATTERN.test(value.name)) {
    fail(`name must be a non-empty kebab-case string (lowercase letters, digits, and hyphens only): ${JSON.stringify(value.name)}`);
  }
  if (!hasOwn(value, "frozen_at")) {
    fail("frozen_at is required");
  } else if (typeof value.frozen_at !== "string" || !isIsoDateTime(value.frozen_at)) {
    fail("frozen_at must be an ISO 8601 date-time string");
  }
  if (!hasOwn(value, "source_project")) {
    fail("source_project is required");
  } else if (!isNonEmptyString(value.source_project)) {
    fail("source_project must be a non-empty string");
  } else if (value.source_project.includes("/") || value.source_project.includes("\\")) {
    fail(
      `source_project must be a "project name + date" name, not a path (the contract avoids references that break when a project moves; §6): ${value.source_project}`,
    );
  }
  if (!hasOwn(value, "workflow")) {
    fail("workflow is required");
  } else if (!WORKFLOWS.has(value.workflow)) {
    fail("workflow must be one of edit / research");
  }
  let confirmedKeys = null;
  if (!hasOwn(value, "confirmed")) {
    fail("confirmed is required");
  } else {
    confirmedKeys = validateConfirmed(value.confirmed);
  }
  if (!hasOwn(value, "provenance")) {
    fail("provenance is required");
  } else {
    validateProvenance(value.provenance, confirmedKeys);
  }
}

function validateConfirmed(value) {
  if (!isPlainObject(value)) {
    fail("confirmed must be an object");
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    fail(
      "confirmed must have at least 1 confirmed field (only confirmed values are recorded, so an empty recipe is not frozen)",
    );
  }
  if (hasOwn(value, "aspect") && !ASPECTS.has(value.aspect)) {
    fail("confirmed.aspect must be one of 16:9 / 9:16 / 1:1");
  }
  if (hasOwn(value, "target_duration_band") && !isNonEmptyString(value.target_duration_band)) {
    fail("confirmed.target_duration_band must be a non-empty string");
  }
  if (hasOwn(value, "caption_style_ref") && !isNonEmptyString(value.caption_style_ref)) {
    fail("confirmed.caption_style_ref must be a non-empty string");
  }
  if (hasOwn(value, "bgm_profile") && !isNonEmptyString(value.bgm_profile)) {
    fail("confirmed.bgm_profile must be a non-empty string");
  }
  if (hasOwn(value, "overlay_kinds")) {
    validateOverlayKinds(value.overlay_kinds);
  }
  if (hasOwn(value, "narration")) {
    validateNarration(value.narration);
  }
  return new Set(keys);
}

function validateOverlayKinds(value) {
  if (!Array.isArray(value)) {
    fail("confirmed.overlay_kinds must be an array");
    return;
  }
  if (value.length === 0) {
    fail("confirmed.overlay_kinds must have at least 1 item");
    return;
  }
  const seen = new Set();
  for (const [index, kind] of value.entries()) {
    const label = `confirmed.overlay_kinds[${index}]`;
    if (!isNonEmptyString(kind)) {
      fail(`${label} must be a non-empty string`);
      continue;
    }
    if (seen.has(kind)) {
      fail(`confirmed.overlay_kinds has a duplicate value: ${kind}`);
    } else {
      seen.add(kind);
    }
  }
}

function validateNarration(value) {
  if (!isPlainObject(value)) {
    fail("confirmed.narration must be an object");
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    fail("confirmed.narration must have at least one of engine or voice");
  }
  if (hasOwn(value, "engine") && !isNonEmptyString(value.engine)) {
    fail("confirmed.narration.engine must be a non-empty string");
  }
  if (hasOwn(value, "voice") && !isNonEmptyString(value.voice)) {
    fail("confirmed.narration.voice must be a non-empty string");
  }
}

function validateProvenance(value, confirmedKeys) {
  if (!isPlainObject(value)) {
    fail("provenance must be an object");
    return;
  }
  const provenanceKeys = new Set(Object.keys(value));
  if (provenanceKeys.size === 0) {
    fail("provenance must have at least 1 entry");
  }
  if (confirmedKeys) {
    for (const key of confirmedKeys) {
      if (!provenanceKeys.has(key)) {
        fail(`provenance.${key} is missing (confirmed.${key} needs a matching provenance entry with confirmed_by and at)`);
      }
    }
    for (const key of provenanceKeys) {
      if (!confirmedKeys.has(key)) {
        fail(`provenance.${key} has no matching confirmed.${key} (provenance cannot be recorded for a value that does not exist)`);
      }
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    const label = `provenance.${key}`;
    if (!isPlainObject(entry)) {
      fail(`${label} must be an object`);
      continue;
    }
    if (!hasOwn(entry, "confirmed_by")) {
      fail(`${label}.confirmed_by is required`);
    } else if (!CONFIRMED_BY.has(entry.confirmed_by)) {
      fail(`${label}.confirmed_by must be one of intake / structure-confirm / edit-approval / render-approval`);
    }
    if (!hasOwn(entry, "at")) {
      fail(`${label}.at is required`);
    } else if (typeof entry.at !== "string" || !isIsoDateTime(entry.at)) {
      fail(`${label}.at must be an ISO 8601 date-time string`);
    }
  }
}

function isIsoDateTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  errors.push(message);
}

function finish() {
  if (errors.length > 0) {
    console.error(`NG: ${recipePath}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${recipePath}`);
  process.exit(0);
}
