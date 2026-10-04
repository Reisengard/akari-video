#!/usr/bin/env node

// intake.json v0 の構造を、Node.js 組み込み機能だけで検証する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-intake.mjs <intake.json>";
const intakeArgument = process.argv[2];

if (!intakeArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (intakeArgument === "--help" || intakeArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const TASK_IDS = ["transcribe-captions", "silence-cut", "bgm-sfx", "narration", "3d-inserts"];
const AUTONOMY_VALUES = ["full-auto", "checkpoint", "collaborative"];
const STATUS_VALUES = ["draft", "submitted"];
const ROOT_FIELDS = ["version", "tasks", "target", "autonomy", "status", "submitted_at"];
const OPTIONAL_ROOT_FIELDS = ["title"];
const TARGET_REQUIRED_FIELDS = ["duration_s", "keep_length"];
const TARGET_FIELDS = ["duration_s", "keep_length", "taste"];

const intakePath = path.resolve(intakeArgument);
const schemaPath = fileURLToPath(new URL("../intake.schema.json", import.meta.url));
const errors = [];

if (!isRegularFile(intakePath)) {
  fail(`intake.json was not found: ${intakePath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`intake.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:intake:v0") {
  fail("intake.schema.json $id does not match the v0 contract");
  finish();
}

let intake;
try {
  intake = JSON.parse(fs.readFileSync(intakePath, "utf8"));
} catch (error) {
  fail(`intake.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validateIntake(intake);
finish();

function validateIntake(value) {
  if (!isPlainObject(value)) {
    fail("intake.json root must be an object");
    return;
  }
  validateFields(value, ROOT_FIELDS, [...ROOT_FIELDS, ...OPTIONAL_ROOT_FIELDS], "root");

  if (value.version !== 1) {
    fail("version must be 1");
  }
  validateTasks(value.tasks);
  validateTarget(value.target);
  validateEnum(value.autonomy, AUTONOMY_VALUES, "autonomy");
  validateEnum(value.status, STATUS_VALUES, "status");
  validateSubmittedAt(value.status, value.submitted_at);
  if (hasOwn(value, "title")) {
    validateTitle(value.title);
  }
}

function validateTitle(value) {
  if (value !== null && typeof value !== "string") {
    fail("title must be null or a string");
  }
}

function validateTasks(value) {
  if (!Array.isArray(value)) {
    fail("tasks must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    const label = `tasks[${index}]`;
    if (typeof item !== "string" || !TASK_IDS.includes(item)) {
      fail(`${label} must be one of ${TASK_IDS.join(" / ")}`);
      continue;
    }
    if (seen.has(item)) fail(`tasks is duplicated: ${item}`);
    seen.add(item);
  }
}

function validateTarget(value) {
  if (!isPlainObject(value)) {
    fail("target must be an object");
    return;
  }
  validateFields(value, TARGET_REQUIRED_FIELDS, TARGET_FIELDS, "target");

  const hasDuration = value.duration_s !== null && value.duration_s !== undefined;
  if (hasDuration && !(isFiniteNumber(value.duration_s) && value.duration_s > 0)) {
    fail("target.duration_s must be null or a positive finite number");
  }
  if (hasOwn(value, "keep_length") && typeof value.keep_length !== "boolean") {
    fail("target.keep_length must be a boolean");
  }
  if (hasDuration && value.keep_length === true) {
    fail("target.duration_s and target.keep_length: true cannot be specified together (mutually exclusive)");
  }
  if (hasOwn(value, "taste") && value.taste !== null && typeof value.taste !== "string") {
    fail("target.taste must be null or a string");
  }
}

function validateSubmittedAt(status, value) {
  if (status === "submitted") {
    if (typeof value !== "string" || !isIsoDateTime(value)) {
      fail("submitted_at must be an ISO 8601 datetime when status is submitted");
    }
  } else if (status === "draft") {
    if (value !== null) {
      fail("submitted_at must be null when status is draft");
    }
  }
}

function validateFields(value, required, allowed, label) {
  for (const field of required) {
    if (!hasOwn(value, field)) fail(`${label}.${field} is required`);
  }
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) fail(`${label}.${field} is an unknown field`);
  }
}

function validateEnum(value, allowed, label) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${label} must be one of ${allowed.join(" / ")}`);
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
    console.error(`NG: ${intakePath}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${intakePath}`);
  process.exit(0);
}
