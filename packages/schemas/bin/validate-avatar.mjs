#!/usr/bin/env node

// avatar ディレクトリ（avatar.json + AVATAR.md + renditions/*/rendition.json）を検証する。
// docs/contract-2026-07-26-avatar-registry-v0.md 参照。
//
// 検証対象は単一ファイルではなく「1 アバター = 1 ディレクトリ」全体:
//   <avatar-dir>/avatar.json
//   <avatar-dir>/AVATAR.md
//   <avatar-dir>/renditions/<id>/rendition.json + アセット実ファイル
//
// schema 構造検証に加え、以下のルール検査を行う:
//   (a) rights 欄必須（欠落 = fail）
//   (b) rights.subject:"person" × rights.distribution:"sellable" = fail
//   (c) rights.subject:"person" のアバターが公開リポ catalog/avatars/ 配下パスにある = fail
//   (d) AVATAR.md が 136 行以上 = fail（上限 135）
//   (e) rendition.json のアセット参照が実ファイルへ解決できない = fail（全数列挙）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-avatar.mjs <avatar-dir>";
const avatarDirArgument = process.argv[2];

if (!avatarDirArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (avatarDirArgument === "--help" || avatarDirArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const avatarDir = path.resolve(avatarDirArgument);
const errors = [];

const AVATAR_SCHEMA_PATH = fileURLToPath(new URL("../avatar.schema.json", import.meta.url));
const RENDITION_SCHEMA_PATH = fileURLToPath(new URL("../avatar-rendition.schema.json", import.meta.url));

const AVATAR_MD_MAX_LINES = 135;
const RENDITION_KINDS = new Set(["2d", "3d", "photo"]);
const VOICE_LANES = new Set(["voicevox", "fal-clone", "recorded"]);
const DEFAULT_ROLES = new Set(["explainer", "listener", "tsukkomi", "narrator", "guest"]);
const RIGHTS_SUBJECTS = new Set(["person", "original", "third_party"]);
const RIGHTS_DISTRIBUTIONS = new Set(["private", "org", "sellable"]);
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

if (!isDirectory(avatarDir)) {
  fail(`Avatar directory was not found: ${avatarDir}`);
  finish();
}

checkSchemaId(AVATAR_SCHEMA_PATH, "urn:akari-video:schema:avatar:v0", "avatar.schema.json");
checkSchemaId(RENDITION_SCHEMA_PATH, "urn:akari-video:schema:avatar-rendition:v0", "avatar-rendition.schema.json");

const avatarJsonPath = path.join(avatarDir, "avatar.json");
const avatarMdPath = path.join(avatarDir, "AVATAR.md");

let avatar;
if (!isRegularFile(avatarJsonPath)) {
  fail(`avatar.json was not found: ${avatarJsonPath}`);
} else {
  try {
    avatar = JSON.parse(fs.readFileSync(avatarJsonPath, "utf8"));
  } catch (error) {
    fail(`avatar.json is not valid JSON: ${messageOf(error)}`);
  }
}

// ルール (d): AVATAR.md 行数上限
if (!isRegularFile(avatarMdPath)) {
  fail(`AVATAR.md was not found: ${avatarMdPath}`);
} else {
  const content = fs.readFileSync(avatarMdPath, "utf8");
  const lineCount = countLines(content);
  if (lineCount > AVATAR_MD_MAX_LINES) {
    fail(
      `AVATAR.md exceeds the ${AVATAR_MD_MAX_LINES}-line limit (measured ${lineCount} lines as by wc -l; internal contract §3)`,
    );
  }
}

if (avatar !== undefined) {
  validateAvatar(avatar);
}

finish();

function validateAvatar(value) {
  if (!isPlainObject(value)) {
    fail("avatar.json root must be an object");
    return;
  }

  if (!hasOwn(value, "version")) {
    fail("version is required");
  } else if (Number.isInteger(value.version) && value.version > 0) {
    fail(
      `version ${value.version} is too new to validate. This file uses a newer format. Update the skill / app`,
    );
    return;
  } else if (value.version !== 0) {
    fail("version must be 0");
  }

  if (!hasOwn(value, "id")) {
    fail("id is required");
  } else if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) {
    fail(`id must be a kebab-case string (lowercase letters, digits, and hyphens): ${JSON.stringify(value.id)}`);
  }

  if (!hasOwn(value, "display_name")) {
    fail("display_name is required");
  } else if (!isNonEmptyString(value.display_name)) {
    fail("display_name must be a non-empty string");
  }

  if (!hasOwn(value, "variants")) {
    fail("variants is required");
  } else {
    validateStringArray(value.variants, "variants", ID_PATTERN, "kebab-case");
  }

  if (!hasOwn(value, "persona")) {
    fail("persona is required");
  } else {
    validatePersona(value.persona);
  }

  if (!hasOwn(value, "voice")) {
    fail("voice is required");
  } else {
    validateVoiceRef(value.voice);
  }

  let renditionIds = null;
  if (!hasOwn(value, "renditions")) {
    fail("renditions is required");
  } else {
    renditionIds = validateRenditionSummaries(value.renditions);
  }

  if (!hasOwn(value, "default_rendition")) {
    fail("default_rendition is required");
  } else if (value.default_rendition !== null) {
    if (typeof value.default_rendition !== "string" || !ID_PATTERN.test(value.default_rendition)) {
      fail("default_rendition must be null or a kebab-case string");
    } else if (renditionIds && !renditionIds.has(value.default_rendition)) {
      fail(`default_rendition ${value.default_rendition} does not exist in renditions[]`);
    }
  }

  // ルール (a): rights 欄必須
  if (!hasOwn(value, "rights")) {
    fail("rights is required (a missing rights field fails; internal contract §6-3)");
  } else {
    validateRights(value.rights);
  }

  if (renditionIds) {
    for (const renditionId of renditionIds) {
      validateRenditionFile(renditionId);
    }
  }
}

function validatePersona(value) {
  if (!isPlainObject(value)) {
    fail("persona must be an object");
    return;
  }
  if (!hasOwn(value, "first_person")) {
    fail("persona.first_person is required");
  } else if (!isNonEmptyString(value.first_person)) {
    fail("persona.first_person must be a non-empty string");
  }
  if (!hasOwn(value, "tone")) {
    fail("persona.tone is required");
  } else if (!isNonEmptyString(value.tone)) {
    fail("persona.tone must be a non-empty string");
  }
  if (!hasOwn(value, "speech_style")) {
    fail("persona.speech_style is required");
  } else if (!isNonEmptyString(value.speech_style)) {
    fail("persona.speech_style must be a non-empty string");
  }
  if (!hasOwn(value, "verbal_tics")) {
    fail("persona.verbal_tics is required");
  } else {
    validateStringArray(value.verbal_tics, "persona.verbal_tics");
  }
  if (!hasOwn(value, "energy")) {
    fail("persona.energy is required");
  } else if (!Number.isInteger(value.energy) || value.energy < 0 || value.energy > 100) {
    fail("persona.energy must be an integer from 0 to 100 (character energy, a separate axis from dopamine level; contract §4)");
  }
  if (!hasOwn(value, "ng")) {
    fail("persona.ng is required");
  } else {
    validateStringArray(value.ng, "persona.ng");
  }
  if (!hasOwn(value, "default_role")) {
    fail("persona.default_role is required");
  } else if (!DEFAULT_ROLES.has(value.default_role)) {
    fail("persona.default_role must be one of explainer / listener / tsukkomi / narrator / guest");
  }
}

function validateVoiceRef(value) {
  if (!isPlainObject(value)) {
    fail("voice must be an object");
    return;
  }
  if (!hasOwn(value, "lane")) {
    fail("voice.lane is required");
  } else if (!VOICE_LANES.has(value.lane)) {
    fail("voice.lane must be one of voicevox / fal-clone / recorded");
  }
  if (!hasOwn(value, "ref")) {
    fail("voice.ref is required");
  } else if (!isNonEmptyString(value.ref)) {
    fail("voice.ref must be a non-empty string");
  }
  if (!hasOwn(value, "credit")) {
    fail("voice.credit is required");
  } else if (value.credit !== null && !isNonEmptyString(value.credit)) {
    fail("voice.credit must be null or a non-empty string");
  }
}

function validateRenditionSummaries(value) {
  if (!Array.isArray(value)) {
    fail("renditions must be an array");
    return null;
  }
  // 0 件 = voice-only アバター（声のみ登録。S2 改訂 2026-07-26 で minItems 1→0 へ緩和）。
  const ids = new Set();
  for (const [index, rendition] of value.entries()) {
    const label = `renditions[${index}]`;
    if (!isPlainObject(rendition)) {
      fail(`${label} must be an object`);
      continue;
    }
    if (!hasOwn(rendition, "id") || !isNonEmptyString(rendition.id) || !ID_PATTERN.test(rendition.id)) {
      fail(`${label}.id must be a kebab-case string`);
    } else {
      if (ids.has(rendition.id)) fail(`renditions id is duplicated: ${rendition.id}`);
      ids.add(rendition.id);
    }
    if (!hasOwn(rendition, "kind") || !RENDITION_KINDS.has(rendition.kind)) {
      fail(`${label}.kind must be one of 2d / 3d / photo`);
    }
    if (!hasOwn(rendition, "capabilities")) {
      fail(`${label}.capabilities is required`);
    } else {
      validateCapabilities(rendition.capabilities, `${label}.capabilities`);
    }
  }
  return ids;
}

function validateCapabilities(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  if (!hasOwn(value, "lipsync") || typeof value.lipsync !== "boolean") {
    fail(`${label}.lipsync must be a boolean`);
  }
  if (!hasOwn(value, "expressions")) {
    fail(`${label}.expressions is required`);
  } else {
    validateStringArray(value.expressions, `${label}.expressions`);
  }
  if (!hasOwn(value, "framing")) {
    fail(`${label}.framing is required`);
  } else {
    validateStringArray(value.framing, `${label}.framing`);
  }
}

function validateRights(value) {
  if (!isPlainObject(value)) {
    fail("rights must be an object");
    return;
  }
  if (!hasOwn(value, "subject") || !RIGHTS_SUBJECTS.has(value.subject)) {
    fail("rights.subject must be one of person / original / third_party");
  }
  if (!hasOwn(value, "consent")) {
    fail("rights.consent is required");
  } else if (!isValidConsent(value.consent)) {
    fail("rights.consent must be one of self / signed:<path> / terms:<url>");
  }
  if (!hasOwn(value, "credit_required") || typeof value.credit_required !== "boolean") {
    fail("rights.credit_required must be a boolean");
  }
  if (!hasOwn(value, "distribution") || !RIGHTS_DISTRIBUTIONS.has(value.distribution)) {
    fail("rights.distribution must be one of private / org / sellable");
  }

  // ルール (b): person × sellable
  if (value.subject === "person" && value.distribution === "sellable") {
    fail(
      "An avatar with rights.subject person cannot set rights.distribution to sellable (real people cannot be sold; internal contract §6-3)",
    );
  }

  // ルール (c): person アバターが公開リポ catalog/avatars/ 配下にある
  if (value.subject === "person" && isUnderPublicCatalogAvatars(avatarDir)) {
    fail(
      `An avatar with rights.subject person cannot be placed under the public repo catalog/avatars/ (keep the actual files in a personal scope; internal contract §1): ${avatarDir}`,
    );
  }
}

function isValidConsent(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return value === "self" || /^signed:\S+$/.test(value) || /^terms:https?:\/\/\S+$/.test(value);
}

function isUnderPublicCatalogAvatars(dir) {
  const normalized = dir.split(path.sep).join("/");
  return /(^|\/)catalog\/avatars(\/|$)/.test(normalized);
}

function validateRenditionFile(renditionId) {
  const renditionDir = path.join(avatarDir, "renditions", renditionId);
  const renditionJsonPath = path.join(renditionDir, "rendition.json");
  if (!isRegularFile(renditionJsonPath)) {
    fail(`rendition.json was not found: ${renditionJsonPath}`);
    return;
  }
  let rendition;
  try {
    rendition = JSON.parse(fs.readFileSync(renditionJsonPath, "utf8"));
  } catch (error) {
    fail(`${renditionJsonPath} is not valid JSON: ${messageOf(error)}`);
    return;
  }
  if (!isPlainObject(rendition)) {
    fail(`${renditionJsonPath} root must be an object`);
    return;
  }
  if (!hasOwn(rendition, "version") || rendition.version !== 0) {
    fail(`${renditionJsonPath}: version must be 0`);
  }
  if (!hasOwn(rendition, "id") || rendition.id !== renditionId) {
    fail(`${renditionJsonPath}: id must match the directory name ${renditionId}`);
  }
  if (!hasOwn(rendition, "kind") || !RENDITION_KINDS.has(rendition.kind)) {
    fail(`${renditionJsonPath}: kind must be one of 2d / 3d / photo`);
  }
  if (!hasOwn(rendition, "capabilities")) {
    fail(`${renditionJsonPath}: capabilities is required`);
  } else {
    validateCapabilities(rendition.capabilities, `${renditionJsonPath} capabilities`);
  }
  if (!hasOwn(rendition, "assets")) {
    fail(`${renditionJsonPath}: assets is required`);
    return;
  }
  validateAssetsResolve(rendition.assets, renditionDir, renditionJsonPath);
}

// ルール (e): アセット参照の実ファイル解決（欠落は全数列挙）
function validateAssetsResolve(assets, renditionDir, renditionJsonPath) {
  if (!isPlainObject(assets)) {
    fail(`${renditionJsonPath}: assets must be an object`);
    return;
  }
  let sawAny = false;
  for (const group of ["expressions", "lipsync"]) {
    if (!hasOwn(assets, group)) continue;
    const map = assets[group];
    if (!isPlainObject(map)) {
      fail(`${renditionJsonPath}: assets.${group} must be an object`);
      continue;
    }
    for (const [key, filename] of Object.entries(map)) {
      sawAny = true;
      if (!isNonEmptyString(filename)) {
        fail(`${renditionJsonPath}: assets.${group}.${key} must be a non-empty string`);
        continue;
      }
      const resolved = path.join(renditionDir, filename);
      if (!isRegularFile(resolved)) {
        fail(
          `Asset reference does not resolve to a real file: ${renditionJsonPath} assets.${group}.${key} = "${filename}"(resolved to ${resolved})`,
        );
      }
    }
  }
  if (!sawAny) {
    fail(`${renditionJsonPath}: at least one entry is required in assets.expressions or assets.lipsync`);
  }
}

function checkSchemaId(schemaPath, expectedId, label) {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${messageOf(error)}`);
    finish();
    return;
  }
  if (schema.$id !== expectedId) {
    fail(`${label} $id does not match the v0 contract`);
    finish();
  }
}

function validateStringArray(value, label, pattern, patternLabel) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
    return;
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    if (!isNonEmptyString(item)) {
      fail(`${itemLabel} must be a non-empty string`);
      continue;
    }
    if (pattern && !pattern.test(item)) {
      fail(`${itemLabel} must be ${patternLabel}: ${item}`);
    }
    if (seen.has(item)) {
      fail(`${label} is duplicated: ${item}`);
    } else {
      seen.add(item);
    }
  }
}

function countLines(content) {
  return (content.match(/\n/g) || []).length;
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isRegularFile(targetPath) {
  try {
    return fs.statSync(targetPath).isFile();
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
    console.error(`NG: ${avatarDir}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${avatarDir}`);
  process.exit(0);
}
