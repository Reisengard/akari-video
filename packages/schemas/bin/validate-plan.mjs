#!/usr/bin/env node

// plan.json v0（仮枠タイムライン）の構造と、JSON Schema 単体では表せない
// 参照・範囲・整合制約を検証する。confidence の整合（filled なのに media 全 null 等）は
// 助言レベルのため warning（stderr）に出し、exit code は errors のみで決定する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-plan.mjs <plan.json>";
const planArgument = process.argv[2];

if (!planArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (planArgument === "--help" || planArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const EPSILON = 1e-6;
const planPath = path.resolve(planArgument);
const planDirectory = path.dirname(planPath);
const schemaPath = fileURLToPath(new URL("../plan.schema.json", import.meta.url));
const errors = [];
const warnings = [];

const CONFIDENCES = new Set(["proposed", "locked", "filled"]);
const FILL_METHODS = new Set(["generate", "record", "import"]);
const CONSTRAINT_KINDS = new Set(["duration_max", "duration_exact", "note"]);

if (!isRegularFile(planPath)) {
  fail(`plan.json was not found: ${planPath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`plan.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:plan:v0") {
  fail("plan.schema.json $id does not match the v0 contract");
  finish();
}

let plan;
try {
  plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
} catch (error) {
  fail(`plan.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validatePlan(plan);
finish();

function validatePlan(value) {
  if (!isPlainObject(value)) {
    fail("plan.json root must be an object");
    return;
  }
  if (Number.isInteger(value.version) && value.version > 0) {
    fail(
      `version ${value.version} is newer than this validator supports. This file uses a newer format. Update the skills or the app.`,
    );
    return;
  }
  if (value.version !== 0) {
    fail("version must be 0");
    return;
  }
  const slots = validateSlots(value.slots);
  validateConstraints(value.constraints, slots);
}

function validateSlots(value) {
  const slots = new Map();
  if (value === undefined) return slots;
  if (!Array.isArray(value)) {
    fail("slots must be an array");
    return slots;
  }
  for (const [index, slot] of value.entries()) {
    const label = `slots[${index}]`;
    if (!isPlainObject(slot)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of [
      "id",
      "label",
      "script",
      "target_duration_seconds",
      "confidence",
      "fill",
      "media",
      "provenance",
    ]) {
      if (!hasOwn(slot, field)) {
        fail(`${label}.${field} is required (the value may be null, but the key must not be omitted)`);
      }
    }
    if (!isNonEmptyString(slot.id)) {
      fail(`${label}.id must be a non-empty string`);
    } else if (slots.has(slot.id)) {
      fail(`slots[].id is duplicated: ${slot.id}`);
    } else {
      slots.set(slot.id, slot);
    }
    if (hasOwn(slot, "label") && !isNonEmptyString(slot.label)) {
      fail(`${label}.label must be a non-empty string`);
    }
    validateNullableNonEmptyString(slot.script, `${label}.script`);
    if (
      hasOwn(slot, "target_duration_seconds") &&
      (!isFiniteNumber(slot.target_duration_seconds) || slot.target_duration_seconds <= 0)
    ) {
      fail(`${label}.target_duration_seconds must be a finite number > 0 (seconds)`);
    }
    if (hasOwn(slot, "confidence") && !CONFIDENCES.has(slot.confidence)) {
      fail(`${label}.confidence must be one of proposed / locked / filled`);
    }
    validateFill(slot.fill, label);
    const media = validateMedia(slot.media, label);
    validateProvenance(slot.provenance, label);

    if (slot.confidence === "filled" && media !== null && mediaAllNull(media) ) {
      warn(`${label} has confidence filled but all media fields are null`);
    }
    if (
      CONFIDENCES.has(slot.confidence) &&
      slot.confidence !== "proposed" &&
      isPlainObject(slot.fill) &&
      slot.fill.method === null
    ) {
      warn(`${label} has confidence ${slot.confidence} but fill.method is undecided (null)`);
    }
  }
  return slots;
}

function validateFill(value, label) {
  if (!hasOwn({ fill: value }, "fill") || value === undefined) return;
  if (!isPlainObject(value) || !hasOwn(value, "method")) {
    fail(`${label}.fill must be an object with { method }`);
    return;
  }
  if (value.method !== null && !FILL_METHODS.has(value.method)) {
    fail(`${label}.fill.method must be one of generate / record / import, or null`);
    return;
  }
  validateNullableNonEmptyString(value.prompt, `${label}.fill.prompt`);
  validateNullableNonEmptyString(value.asset_path, `${label}.fill.asset_path`);
  if (isNonEmptyString(value.asset_path)) {
    requireRegularFile(value.asset_path, `${label}.fill.asset_path`);
  }
  if (value.method === "import" && !isNonEmptyString(value.asset_path)) {
    warn(`${label}.fill has method import but no asset_path`);
  }
}

function validateMedia(value, label) {
  if (value === undefined) return null;
  if (!isPlainObject(value)) {
    fail(`${label}.media must be an object`);
    return null;
  }
  for (const field of ["image_path", "audio_path", "text_card"]) {
    if (!hasOwn(value, field)) {
      fail(`${label}.media.${field} is required (the value may be null, but the key must not be omitted)`);
    }
  }
  validateNullableNonEmptyString(value.image_path, `${label}.media.image_path`);
  validateNullableNonEmptyString(value.audio_path, `${label}.media.audio_path`);
  if (value.text_card !== undefined && value.text_card !== null && typeof value.text_card !== "string") {
    fail(`${label}.media.text_card must be null or a string`);
  }
  for (const field of ["image_path", "audio_path"]) {
    if (isNonEmptyString(value[field])) {
      requireRegularFile(value[field], `${label}.media.${field}`);
    }
  }
  return value;
}

function validateProvenance(value, label) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    fail(`${label}.provenance must be an object`);
    return;
  }
  for (const field of ["tool", "created_at", "note"]) {
    if (!hasOwn(value, field)) {
      fail(`${label}.provenance.${field} is required (the value may be null, but the key must not be omitted)`);
    }
  }
  validateNullableNonEmptyString(value.tool, `${label}.provenance.tool`);
  if (value.created_at !== undefined && value.created_at !== null && typeof value.created_at !== "string") {
    fail(`${label}.provenance.created_at must be null or an ISO-8601 string`);
  }
  if (value.note !== undefined && value.note !== null && typeof value.note !== "string") {
    fail(`${label}.provenance.note must be null or a string`);
  }
}

function validateConstraints(value, slots) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail("constraints must be an array");
    return;
  }
  const ids = new Set();
  const slotDurationSum = [...slots.values()].reduce(
    (sum, slot) =>
      isFiniteNumber(slot.target_duration_seconds) && slot.target_duration_seconds > 0
        ? sum + slot.target_duration_seconds
        : sum,
    0,
  );
  for (const [index, constraint] of value.entries()) {
    const label = `constraints[${index}]`;
    if (!isPlainObject(constraint)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of ["id", "kind", "applies_to", "value", "note"]) {
      if (!hasOwn(constraint, field)) {
        fail(`${label}.${field} is required (the value may be null, but the key must not be omitted)`);
      }
    }
    if (!isNonEmptyString(constraint.id)) {
      fail(`${label}.id must be a non-empty string`);
    } else if (ids.has(constraint.id)) {
      fail(`constraints[].id is duplicated: ${constraint.id}`);
    } else {
      ids.add(constraint.id);
    }
    if (!CONSTRAINT_KINDS.has(constraint.kind)) {
      fail(`${label}.kind must be one of duration_max / duration_exact / note`);
      continue;
    }
    if (constraint.applies_to !== null && constraint.applies_to !== undefined) {
      if (!isNonEmptyString(constraint.applies_to)) {
        fail(`${label}.applies_to must be null or a slot id`);
      } else if (!slots.has(constraint.applies_to)) {
        fail(`${label}.applies_to does not reference a slots[].id: ${constraint.applies_to}`);
        continue;
      }
    }
    if (constraint.kind === "note") {
      if (constraint.value !== null && constraint.value !== undefined) {
        fail(`${label} must be null because kind is note`);
      }
      if (!isNonEmptyString(constraint.note)) {
        fail(`${label} has kind note, so note must be a non-empty string`);
      }
      continue;
    }
    if (!isFiniteNumber(constraint.value) || constraint.value <= 0) {
      fail(`${label}.value must be a finite number > 0 (seconds)`);
      continue;
    }
    const scopedDuration = isNonEmptyString(constraint.applies_to)
      ? slots.get(constraint.applies_to)?.target_duration_seconds
      : slotDurationSum;
    if (!isFiniteNumber(scopedDuration)) continue;
    const scopeLabel = isNonEmptyString(constraint.applies_to)
      ? `slot ${constraint.applies_to}`
      : "the slot total";
    if (constraint.kind === "duration_max" && scopedDuration > constraint.value + EPSILON) {
      fail(
        `${label}: duration of ${scopeLabel} (${formatNumber(scopedDuration)}s) exceeds duration_max ${formatNumber(constraint.value)}s`,
      );
    }
    if (
      constraint.kind === "duration_exact" &&
      Math.abs(scopedDuration - constraint.value) > EPSILON
    ) {
      warn(
        `${label}: duration of ${scopeLabel} (${formatNumber(scopedDuration)}s) does not match duration_exact ${formatNumber(constraint.value)}s (convergence to the target duration is covered by placeholder-slot QA)`,
      );
    }
  }
}

function requireRegularFile(reference, label) {
  const filePath = path.isAbsolute(reference)
    ? reference
    : path.resolve(planDirectory, reference);
  if (!isRegularFile(filePath)) {
    fail(`${label} does not resolve to a real file: ${reference}`);
  }
}

function validateNullableNonEmptyString(value, label) {
  if (value === undefined || value === null) return;
  if (!isNonEmptyString(value)) {
    fail(`${label} must be null or a non-empty string`);
  }
}

function mediaAllNull(media) {
  return (
    (media.image_path === null || media.image_path === undefined) &&
    (media.audio_path === null || media.audio_path === undefined) &&
    (media.text_card === null || media.text_card === undefined)
  );
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : String(value);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function finish() {
  for (const warning of warnings) console.error(`warning: ${warning}`);
  if (errors.length > 0) {
    console.error(`NG: ${planPath}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${planPath}${warnings.length > 0 ? ` (${warnings.length} warnings)` : ""}`);
  process.exit(0);
}
