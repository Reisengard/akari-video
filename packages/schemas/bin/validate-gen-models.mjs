#!/usr/bin/env node

// gen-models.json v1 のスキーマと、行をまたぐ意味制約を検証する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const usage = "Usage: node packages/schemas/bin/validate-gen-models.mjs <gen-models.json>";
const catalogArgument = process.argv[2];

if (!catalogArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (catalogArgument === "--help" || catalogArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const catalogPath = path.resolve(catalogArgument);
const schemaPath = fileURLToPath(new URL("../gen-models.schema.json", import.meta.url));
const errors = [];

if (!isRegularFile(catalogPath)) {
  fail(`gen-models.json was not found: ${catalogPath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`gen-models.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:gen-models:v1") {
  fail("gen-models.schema.json $id does not match the v1 contract");
  finish();
}

let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
} catch (error) {
  fail(`gen-models.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

try {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(catalog)) {
    for (const error of validate.errors ?? []) {
      fail(`Schema violation at ${error.instancePath || "/"}: ${error.message}`);
    }
  }
} catch (error) {
  fail(`Cannot compile gen-models.schema.json: ${messageOf(error)}`);
  finish();
}

validateCatalog(catalog);
finish();

function validateCatalog(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.models)) return;
  if (value.models.length !== 15) fail(`models must have 15 entries, found ${value.models.length}`);

  const ids = new Set();
  for (const [index, model] of value.models.entries()) {
    if (!model || typeof model !== "object" || Array.isArray(model)) continue;
    const label = typeof model.id === "string" ? model.id : `models[${index}]`;
    if (typeof model.id === "string") {
      if (ids.has(model.id)) fail(`id is duplicated: ${model.id}`);
      ids.add(model.id);
    }
    if (model.verified !== "documented") {
      fail(`${label} verified must be documented`);
    }
    if (model.price && typeof model.price === "object" && model.price.by_resolution) {
      const resolutions = new Set(Array.isArray(model.resolutions) ? model.resolutions : []);
      for (const resolution of Object.keys(model.price.by_resolution)) {
        if (resolution !== "" && !resolutions.has(resolution)) {
          fail(`${label} price.by_resolution.${resolution} is not included in resolutions`);
        }
      }
    }
    validateDuration(model.duration, label);
  }
  findForbiddenWord(value);
}

function validateDuration(duration, label) {
  if (!duration || typeof duration !== "object") return;
  if (duration.kind === "range") {
    if (duration.min > duration.max) fail(`${label} duration.min must be less than or equal to max`);
    if (duration.default !== null
        && (duration.default < duration.min || duration.default > duration.max
          || (duration.default - duration.min) % duration.step !== 0)) {
      fail(`${label} duration.default must match a step within the range`);
    }
  }
  if (duration.kind === "enum" && duration.default !== null && !duration.values.includes(duration.default)) {
    fail(`${label} duration.default must be included in values`);
  }
}

function findForbiddenWord(value, location = "root") {
  if (typeof value === "string") {
    if (value === "cap" + "ability") fail(`${location} uses a forbidden word as a value`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "cap" + "ability") fail(`${location} has a forbidden word as a key`);
    findForbiddenWord(child, `${location}.${key}`);
  }
}

function isRegularFile(targetPath) {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  errors.push(message);
}

function finish() {
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${catalogPath}`);
  process.exit(0);
}
