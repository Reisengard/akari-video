#!/usr/bin/env node

// <元ファイル名>.meta.json の生成サイドカー v1 を検証する。
// 素材工房の asset-meta.schema.json とは別契約。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const usage = "Usage: node packages/schemas/bin/validate-generation-meta.mjs <source-file-name.meta.json>";
const argument = process.argv[2];

if (!argument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}
if (argument === "--help" || argument === "-h") {
  console.log(usage);
  process.exit(0);
}

const metaPath = path.resolve(argument);
const schemaPath = fileURLToPath(new URL("../generation-meta.schema.json", import.meta.url));
let schema;
let meta;

try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  console.error(`NG: ${metaPath}`);
  console.error(`- generation-meta.schema.json is not valid JSON: ${messageOf(error)}`);
  process.exit(2);
}
if (schema.$id !== "urn:akari-video:schema:generation-meta:v1") {
  console.error(`NG: ${metaPath}`);
  console.error("- generation-meta.schema.json $id does not match the v1 contract");
  process.exit(2);
}
try {
  meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
} catch (error) {
  console.error(`NG: ${metaPath}`);
  console.error(`- Cannot read the generation sidecar as JSON: ${messageOf(error)}`);
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", value => typeof value === "string" && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value));
const validate = ajv.compile(schema);
if (!validate(meta)) {
  console.error(`NG: ${metaPath}`);
  for (const error of validate.errors ?? []) console.error(`- ${describeError(error)}`);
  process.exit(1);
}

console.log(`OK: ${metaPath}`);

function describeError(error) {
  const location = error.instancePath || "/";
  switch (error.keyword) {
    case "required": return `${location} is missing required key ${error.params.missingProperty}`;
    case "additionalProperties": return `${location} has unknown key ${error.params.additionalProperty}`;
    case "enum": return `${location} does not match any allowed value`;
    case "const": return `${location} must be ${JSON.stringify(error.params.allowedValue)}`;
    case "type": return `${location} must be of type ${error.params.type}`;
    case "format": return `${location} must be in ${error.params.format} format`;
    case "pattern": return `${location} string format does not match the contract`;
    default: return `${location} does not satisfy the contract (${error.keyword})`;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
