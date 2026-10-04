#!/usr/bin/env node

// connections.json v0 の構造を、Node.js 組み込み機能だけで検証する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-connections.mjs <connections.json>";
const connectionsArgument = process.argv[2];

if (!connectionsArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (connectionsArgument === "--help" || connectionsArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const connectionsPath = path.resolve(connectionsArgument);
const schemaPath = fileURLToPath(new URL("../connections.schema.json", import.meta.url));
const errors = [];

if (!isRegularFile(connectionsPath)) {
  fail(`connections.json was not found: ${connectionsPath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`connections.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:connections:v0") {
  fail("connections.schema.json $id does not match the v0 contract");
  finish();
}

let connections;
try {
  connections = JSON.parse(fs.readFileSync(connectionsPath, "utf8"));
} catch (error) {
  fail(`connections.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validateConnections(connections);
finish();

function validateConnections(value) {
  if (!isPlainObject(value)) {
    fail("connections.json root must be an object");
    return;
  }
  validateFields(value, ["providers", "policy"], ["providers", "defaults", "policy", "memory"], "root");
  validateProviders(value.providers);
  if (hasOwn(value, "defaults")) validateDefaults(value.defaults);
  validatePolicy(value.policy);
  if (hasOwn(value, "memory")) validateMemory(value.memory);
}

function validateDefaults(value) {
  if (!isPlainObject(value)) {
    fail("defaults must be an object");
    return;
  }
  validateFields(value, [], ["generate"], "defaults");
  if (!hasOwn(value, "generate")) return;
  if (!isPlainObject(value.generate)) {
    fail("defaults.generate must be an object");
    return;
  }
  validateFields(value.generate, [], ["still", "video"], "defaults.generate");
  for (const field of ["still", "video"]) {
    if (hasOwn(value.generate, field) && value.generate[field] !== null) {
      validateNonEmptyString(value.generate[field], `defaults.generate.${field}`);
    }
  }
}

function validateProviders(value) {
  if (!Array.isArray(value)) {
    fail("providers must be an array");
    return;
  }
  const ids = new Set();
  for (const [index, provider] of value.entries()) {
    const label = `providers[${index}]`;
    if (!isPlainObject(provider)) {
      fail(`${label} must be an object`);
      continue;
    }
    const fields = ["id", "kind", "auth", "env", "models", "notes", "doctor"];
    validateFields(provider, fields, fields, label);
    validateNonEmptyString(provider.id, `${label}.id`);
    if (typeof provider.id === "string") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider.id)) {
        fail(`${label}.id must be kebab-case of lowercase letters and digits`);
      }
      if (ids.has(provider.id)) fail(`provider id is duplicated: ${provider.id}`);
      ids.add(provider.id);
    }

    validateEnum(provider.kind, ["genai", "image", "video", "tts", "music", "sns", "analytics", "notify"], `${label}.kind`);
    validateEnum(provider.auth, ["login", "env-key", "oauth-mcp", "none"], `${label}.auth`);
    if (provider.auth === "env-key") {
      if (typeof provider.env !== "string" || !/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(provider.env)) {
        fail(`${label}.env must be in \${KEY_NAME} form for env-key auth`);
      }
    } else if (provider.env !== null) {
      fail(`${label}.env must be null for login / oauth-mcp auth`);
    }
    validateModels(provider.models, `${label}.models`);
    validateNotes(provider.notes, `${label}.notes`, provider.auth);
    validateDoctor(provider.doctor, `${label}.doctor`);
  }
}

function validateModels(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  validateFields(value, ["default", "allowed"], ["default", "allowed"], label);
  if (value.default !== null) validateNonEmptyString(value.default, `${label}.default`);
  validateStringArray(value.allowed, `${label}.allowed`);
  if (typeof value.default === "string" && Array.isArray(value.allowed) && !value.allowed.includes(value.default)) {
    fail(`${label}.default must be included in allowed`);
  }
}

function validateNotes(value, label, auth) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  const fields = ["description", "workflows", "billing", "quota", "scopes", "setup_url"];
  validateFields(value, fields, fields, label);
  for (const field of ["description", "billing", "quota"]) {
    validateNonEmptyString(value[field], `${label}.${field}`);
  }
  validateStringArray(value.workflows, `${label}.workflows`);
  validateStringArray(value.scopes, `${label}.scopes`);
  if (value.setup_url !== null) validateHttpsUrl(value.setup_url, `${label}.setup_url`);
  if (auth === "env-key" && value.setup_url === null) {
    fail(`${label}.setup_url is required to tell users where to get the env-key`);
  }
}

function validateDoctor(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  validateFields(value, ["status"], ["last_checked", "status", "detail"], label);
  validateEnum(
    value.status,
    ["ok", "unauthorized", "unconfigured", "unchecked", "setup_required"],
    `${label}.status`,
  );
  if (hasOwn(value, "last_checked") && value.last_checked !== null) {
    if (typeof value.last_checked !== "string" || !isIsoDateTime(value.last_checked)) {
      fail(`${label}.last_checked must be null or an ISO 8601 date-time`);
    }
  }
  if (hasOwn(value, "detail")) validateNonEmptyString(value.detail, `${label}.detail`);
}

function validateMemory(value) {
  if (!Array.isArray(value)) {
    fail("memory must be an array");
    return;
  }
  const names = new Set();
  for (const [index, connection] of value.entries()) {
    const label = `memory[${index}]`;
    if (!isPlainObject(connection)) {
      fail(`${label} must be an object`);
      continue;
    }
    const required = ["name", "root"];
    const allowed = ["name", "root", "entry", "include", "exclude", "read_policy"];
    validateFields(connection, required, allowed, label);
    validateNonEmptyString(connection.name, `${label}.name`);
    if (typeof connection.name === "string") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(connection.name)) {
        fail(`${label}.name must be kebab-case of lowercase letters and digits`);
      }
      if (names.has(connection.name)) fail(`memory name is duplicated: ${connection.name}`);
      names.add(connection.name);
    }
    validateNonEmptyString(connection.root, `${label}.root`);
    if (hasOwn(connection, "entry")) validateNonEmptyString(connection.entry, `${label}.entry`);
    if (hasOwn(connection, "include")) validateStringArray(connection.include, `${label}.include`);
    if (hasOwn(connection, "exclude")) validateStringArray(connection.exclude, `${label}.exclude`);
    if (hasOwn(connection, "read_policy") && connection.read_policy !== "read-only") {
      fail(`${label}.read_policy must be read-only`);
    }
  }
}

function validatePolicy(value) {
  const label = "policy";
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  const fields = ["currency", "monthly_budget", "approval_threshold"];
  validateFields(value, fields, fields, label);
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    fail("policy.currency must be a 3-letter uppercase currency code");
  }
  for (const field of ["monthly_budget", "approval_threshold"]) {
    const item = value[field];
    if (item !== null && (!isFiniteNumber(item) || item < 0)) {
      fail(`policy.${field} must be null or a finite number >= 0`);
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

function validateStringArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
    return;
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    validateNonEmptyString(item, `${label}[${index}]`);
    if (typeof item === "string") {
      if (seen.has(item)) fail(`${label} is duplicated: ${item}`);
      seen.add(item);
    }
  }
}

function validateNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function validateEnum(value, allowed, label) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${label} must be one of ${allowed.join(" / ")}`);
  }
}

function validateHttpsUrl(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") fail(`${label} must be an https URL`);
  } catch {
    fail(`${label} must be a valid URL`);
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
    console.error(`NG: ${connectionsPath}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${connectionsPath}`);
  process.exit(0);
}
