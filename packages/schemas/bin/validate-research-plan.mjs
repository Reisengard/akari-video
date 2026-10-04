#!/usr/bin/env node

// research-plan.json v0（企画・調査工程の SSOT）の構造と、JSON Schema 単体では表せない
// 参照・一貫性制約を検証する。sources 未記載など助言レベルの所見は warning（stderr）に
// 出し、exit code は errors のみで決定する（packages/schemas/bin/validate-plan.mjs と同じ規律）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-research-plan.mjs <research-plan.json>";
const planArgument = process.argv[2];

if (!planArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (planArgument === "--help" || planArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const planPath = path.resolve(planArgument);
const planDirectory = path.dirname(planPath);
const schemaPath = fileURLToPath(new URL("../research-plan.schema.json", import.meta.url));
const errors = [];
const warnings = [];

const CATEGORIES = new Set(["hub", "hero", "help"]);
const MONETIZATION_POTENTIALS = new Set(["high", "medium", "low"]);
const SHOT_LIST_STATUSES = new Set(["planned", "ok", "ng"]);
const SOURCE_COSTS = new Set(["free", "paid"]);

if (!isRegularFile(planPath)) {
  fail(`research-plan.json was not found: ${planPath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`research-plan.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:research-plan:v0") {
  fail("research-plan.schema.json $id does not match the v0 contract");
  finish();
}

let plan;
try {
  plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
} catch (error) {
  fail(`research-plan.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validatePlan(plan);
finish();

function validatePlan(value) {
  if (!isPlainObject(value)) {
    fail("research-plan.json root must be an object");
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

  const candidateIds = validateTopic(value.topic);
  validateTarget(value.target);
  const chapterIds = validateStructureChapters(value.structure);
  const shotIds = validateStructureShots(value.structure, chapterIds);
  validateStructureRoot(value.structure);
  validateShotList(value.shot_list, shotIds);
  const sourceCount = validateSources(value.sources);
  validateFeedback(value.feedback);

  if (isPlainObject(value.topic) && isNonEmptyString(value.topic.selected) && sourceCount === 0) {
    warn("sources is empty (the plan is finalized without any provenance record)");
  }
  if (
    isPlainObject(value.topic) &&
    isNonEmptyString(value.topic.selected) &&
    candidateIds.size > 0 &&
    !candidateIds.has(value.topic.selected)
  ) {
    // すでに validateTopic 内で fail 済み（ここには到達しない防御的記述）。
  }
}

function validateTopic(value) {
  const ids = new Set();
  if (!isPlainObject(value)) {
    fail("topic must be an object");
    return ids;
  }
  for (const field of ["candidates", "selected", "decided_at"]) {
    if (!hasOwn(value, field)) fail(`topic.${field} is required (the value may be null, but the key must not be omitted)`);
  }

  if (value.candidates !== undefined) {
    if (!Array.isArray(value.candidates)) {
      fail("topic.candidates must be an array");
    } else {
      for (const [index, candidate] of value.candidates.entries()) {
        const label = `topic.candidates[${index}]`;
        if (!isPlainObject(candidate)) {
          fail(`${label} must be an object`);
          continue;
        }
        for (const field of ["id", "title", "category", "monetization_potential", "rationale"]) {
          if (!hasOwn(candidate, field)) fail(`${label}.${field} is required`);
        }
        if (!isNonEmptyString(candidate.id)) {
          fail(`${label}.id must be a non-empty string`);
        } else if (ids.has(candidate.id)) {
          fail(`topic.candidates[].id is duplicated: ${candidate.id}`);
        } else {
          ids.add(candidate.id);
        }
        if (hasOwn(candidate, "title") && !isNonEmptyString(candidate.title)) {
          fail(`${label}.title must be a non-empty string`);
        }
        if (hasOwn(candidate, "category") && !CATEGORIES.has(candidate.category)) {
          fail(`${label}.category must be one of hub / hero / help`);
        }
        if (
          hasOwn(candidate, "monetization_potential") &&
          !MONETIZATION_POTENTIALS.has(candidate.monetization_potential)
        ) {
          fail(`${label}.monetization_potential must be one of high / medium / low`);
        }
        if (hasOwn(candidate, "rationale") && !isNonEmptyString(candidate.rationale)) {
          fail(`${label}.rationale must be a non-empty string`);
        }
      }
    }
  }

  if (hasOwn(value, "selected")) {
    if (value.selected !== null && !isNonEmptyString(value.selected)) {
      fail("topic.selected must be null or a non-empty string");
    } else if (isNonEmptyString(value.selected) && !ids.has(value.selected)) {
      fail(`topic.selected does not reference a topic.candidates[].id: ${value.selected}`);
    }
  }

  if (hasOwn(value, "selected") && hasOwn(value, "decided_at")) {
    const selected = isNonEmptyString(value.selected) ? value.selected : null;
    if (selected !== null && value.decided_at === null) {
      fail("topic.selected is set but topic.decided_at is null (fill in the decision-cards decision time)");
    }
    if (selected === null && value.decided_at !== null) {
      fail("topic.selected is null (undecided) but topic.decided_at is not null");
    }
    if (value.decided_at !== null && typeof value.decided_at !== "string") {
      fail("topic.decided_at must be null or an ISO-8601 string");
    }
  }

  return ids;
}

function validateTarget(value) {
  if (!isPlainObject(value)) {
    fail("target must be an object");
    return;
  }
  for (const field of ["audience", "competitors", "japan_sns"]) {
    if (!hasOwn(value, field)) fail(`target.${field} is required (the value may be null, but the key must not be omitted)`);
  }
  validateNullableNonEmptyString(value.audience, "target.audience");

  if (value.competitors !== undefined) {
    if (!Array.isArray(value.competitors)) {
      fail("target.competitors must be an array");
    } else {
      for (const [index, competitor] of value.competitors.entries()) {
        const label = `target.competitors[${index}]`;
        if (!isPlainObject(competitor)) {
          fail(`${label} must be an object`);
          continue;
        }
        for (const field of ["name", "url", "notes", "gap"]) {
          if (!hasOwn(competitor, field)) fail(`${label}.${field} is required`);
        }
        if (hasOwn(competitor, "name") && !isNonEmptyString(competitor.name)) {
          fail(`${label}.name must be a non-empty string`);
        }
        if (
          competitor.url !== null &&
          competitor.url !== undefined &&
          (!isNonEmptyString(competitor.url) || !/^https?:\/\//.test(competitor.url))
        ) {
          fail(`${label}.url must be null or a string that starts with http:// or https://`);
        }
        if (competitor.notes !== undefined && competitor.notes !== null && typeof competitor.notes !== "string") {
          fail(`${label}.notes must be null or a string`);
        }
        if (competitor.gap !== undefined && competitor.gap !== null && typeof competitor.gap !== "string") {
          fail(`${label}.gap must be null or a string`);
        }
      }
    }
  }

  if (!isPlainObject(value.japan_sns)) {
    fail("target.japan_sns must be an object (Japanese social media conditions are a required research axis)");
  } else {
    for (const field of ["platforms", "notes"]) {
      if (!hasOwn(value.japan_sns, field)) fail(`target.japan_sns.${field} is required`);
    }
    if (value.japan_sns.platforms !== undefined && !Array.isArray(value.japan_sns.platforms)) {
      fail("target.japan_sns.platforms must be an array");
    }
    if (hasOwn(value.japan_sns, "notes") && !isNonEmptyString(value.japan_sns.notes)) {
      fail(
        "target.japan_sns.notes must be a non-empty string (required research axis; if it cannot be checked by free means, say so and give the reason)",
      );
    }
  }
}

function validateStructureChapters(value) {
  const ids = new Set();
  if (!isPlainObject(value)) return ids;
  if (value.chapters === undefined) return ids;
  if (!Array.isArray(value.chapters)) {
    fail("structure.chapters must be an array");
    return ids;
  }
  for (const [index, chapter] of value.chapters.entries()) {
    const label = `structure.chapters[${index}]`;
    if (!isPlainObject(chapter)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of ["id", "title", "duration_estimate_seconds", "notes"]) {
      if (!hasOwn(chapter, field)) fail(`${label}.${field} is required`);
    }
    if (!isNonEmptyString(chapter.id)) {
      fail(`${label}.id must be a non-empty string`);
    } else if (ids.has(chapter.id)) {
      fail(`structure.chapters[].id is duplicated: ${chapter.id}`);
    } else {
      ids.add(chapter.id);
    }
    if (hasOwn(chapter, "title") && !isNonEmptyString(chapter.title)) {
      fail(`${label}.title must be a non-empty string`);
    }
    if (
      hasOwn(chapter, "duration_estimate_seconds") &&
      chapter.duration_estimate_seconds !== null &&
      (!isFiniteNumber(chapter.duration_estimate_seconds) || chapter.duration_estimate_seconds <= 0)
    ) {
      fail(`${label}.duration_estimate_seconds must be null or a finite number > 0 (seconds)`);
    }
    if (chapter.notes !== undefined && chapter.notes !== null && typeof chapter.notes !== "string") {
      fail(`${label}.notes must be null or a string`);
    }
  }
  return ids;
}

function validateStructureShots(value, chapterIds) {
  const ids = new Set();
  const cutawayReferences = [];
  if (!isPlainObject(value)) return ids;
  if (value.shots === undefined) return ids;
  if (!Array.isArray(value.shots)) {
    fail("structure.shots must be an array");
    return ids;
  }
  for (const [index, shot] of value.shots.entries()) {
    const label = `structure.shots[${index}]`;
    if (!isPlainObject(shot)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of ["chapter_id", "shot_type", "description", "duration_estimate_seconds", "image_path"]) {
      if (!hasOwn(shot, field)) fail(`${label}.${field} is required`);
    }
    if (hasOwn(shot, "id")) {
      if (!isNonEmptyString(shot.id)) {
        fail(`${label}.id must be a non-empty string when set`);
      } else if (ids.has(shot.id)) {
        fail(`structure.shots[].id is duplicated: ${shot.id}`);
      } else {
        ids.add(shot.id);
      }
    }
    if (hasOwn(shot, "sequence")) {
      if (!isNonEmptyString(shot.sequence)) {
        fail(`${label}.sequence must be a non-empty string when set`);
      } else if (!chapterIds.has(shot.sequence)) {
        fail(`${label}.sequence does not reference a structure.chapters[].id: ${shot.sequence}`);
      }
    }
    if (hasOwn(shot, "cutaway_of")) {
      if (!isNonEmptyString(shot.cutaway_of)) {
        fail(`${label}.cutaway_of must be a non-empty string when set`);
      } else {
        cutawayReferences.push({ index, id: shot.id, target: shot.cutaway_of });
      }
    }
    if (hasOwn(shot, "camera")) validateCamera(shot.camera, `${label}.camera`);
    if (hasOwn(shot, "chapter_id")) {
      if (shot.chapter_id !== null && !isNonEmptyString(shot.chapter_id)) {
        fail(`${label}.chapter_id must be null or a non-empty string`);
      } else if (isNonEmptyString(shot.chapter_id) && !chapterIds.has(shot.chapter_id)) {
        fail(`${label}.chapter_id does not reference a structure.chapters[].id: ${shot.chapter_id}`);
      }
    }
    validateNullableNonEmptyString(shot.shot_type, `${label}.shot_type`);
    if (hasOwn(shot, "description") && !isNonEmptyString(shot.description)) {
      fail(`${label}.description must be a non-empty string`);
    }
    if (
      hasOwn(shot, "duration_estimate_seconds") &&
      shot.duration_estimate_seconds !== null &&
      (!isFiniteNumber(shot.duration_estimate_seconds) || shot.duration_estimate_seconds <= 0)
    ) {
      fail(`${label}.duration_estimate_seconds must be null or a finite number > 0 (seconds)`);
    }
    validateNullableNonEmptyString(shot.image_path, `${label}.image_path`);
    if (isNonEmptyString(shot.image_path)) {
      requireRegularFile(shot.image_path, `${label}.image_path`);
    }
  }
  for (const reference of cutawayReferences) {
    const label = `structure.shots[${reference.index}]`;
    if (!ids.has(reference.target)) {
      fail(`${label}.cutaway_of does not reference a structure.shots[].id: ${reference.target}`);
      continue;
    }
    if (reference.id === reference.target) {
      fail(`${label}.cutaway_of cannot reference itself: ${reference.target}`);
    }
    const target = value.shots.find((shot) => isPlainObject(shot) && shot.id === reference.target);
    if (target && hasOwn(target, "cutaway_of")) {
      fail(`${label}.cutaway_of must reference a main-axis shot (cutaways are one level only): ${reference.target}`);
    }
  }
  return ids;
}

function validateCamera(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  if (
    hasOwn(value, "movement") &&
    (!Array.isArray(value.movement) || value.movement.some((item) => typeof item !== "string"))
  ) {
    fail(`${label}.movement must be an array of strings`);
  }
  if (hasOwn(value, "path_hint") && typeof value.path_hint !== "string") {
    fail(`${label}.path_hint must be a string`);
  }
}

function validateStructureRoot(value) {
  if (!isPlainObject(value)) {
    fail("structure must be an object");
    return;
  }
  for (const field of ["chapters", "shots", "opening_hook", "confirmed", "confirmed_at"]) {
    if (!hasOwn(value, field)) fail(`structure.${field} is required (the value may be null, but the key must not be omitted)`);
  }
  validateNullableNonEmptyString(value.opening_hook, "structure.opening_hook");

  if (hasOwn(value, "confirmed") && typeof value.confirmed !== "boolean") {
    fail("structure.confirmed must be a boolean");
  }
  if (hasOwn(value, "confirmed") && hasOwn(value, "confirmed_at")) {
    if (value.confirmed === true && value.confirmed_at === null) {
      fail("structure.confirmed is true but structure.confirmed_at is null (fill in the decision-cards decision time)");
    }
    if (value.confirmed === false && value.confirmed_at !== null) {
      fail("structure.confirmed is false (unconfirmed) but structure.confirmed_at is not null");
    }
    if (value.confirmed_at !== null && typeof value.confirmed_at !== "string") {
      fail("structure.confirmed_at must be null or an ISO-8601 string");
    }
  }
}

function validateShotList(value, shotIds) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    fail("shot_list must be an array");
    return;
  }
  const ids = new Set();
  for (const [index, entry] of value.entries()) {
    const label = `shot_list[${index}]`;
    if (!isPlainObject(entry)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of ["id", "ref_shot_id", "location", "equipment", "checklist", "status"]) {
      if (!hasOwn(entry, field)) fail(`${label}.${field} is required`);
    }
    if (!isNonEmptyString(entry.id)) {
      fail(`${label}.id must be a non-empty string`);
    } else if (ids.has(entry.id)) {
      fail(`shot_list[].id is duplicated: ${entry.id}`);
    } else {
      ids.add(entry.id);
    }
    if (hasOwn(entry, "ref_shot_id")) {
      if (entry.ref_shot_id !== null && !isNonEmptyString(entry.ref_shot_id)) {
        fail(`${label}.ref_shot_id must be null or a non-empty string`);
      } else if (isNonEmptyString(entry.ref_shot_id) && !shotIds.has(entry.ref_shot_id)) {
        fail(`${label}.ref_shot_id does not reference a structure.shots[].id: ${entry.ref_shot_id}`);
      }
    }
    validateNullableNonEmptyString(entry.location, `${label}.location`);
    if (hasOwn(entry, "equipment") && !isStringArray(entry.equipment)) {
      fail(`${label}.equipment must be an array of non-empty strings`);
    }
    if (hasOwn(entry, "checklist") && !isStringArray(entry.checklist)) {
      fail(`${label}.checklist must be an array of non-empty strings`);
    }
    if (hasOwn(entry, "status") && !SHOT_LIST_STATUSES.has(entry.status)) {
      fail(`${label}.status must be one of planned / ok / ng`);
    }
  }
}

function validateSources(value) {
  if (value === undefined) return 0;
  if (!Array.isArray(value)) {
    fail("sources must be an array");
    return 0;
  }
  const ids = new Set();
  for (const [index, source] of value.entries()) {
    const label = `sources[${index}]`;
    if (!isPlainObject(source)) {
      fail(`${label} must be an object`);
      continue;
    }
    for (const field of ["id", "url", "retrieved_at", "cost", "note"]) {
      if (!hasOwn(source, field)) fail(`${label}.${field} is required`);
    }
    if (!isNonEmptyString(source.id)) {
      fail(`${label}.id must be a non-empty string`);
    } else if (ids.has(source.id)) {
      fail(`sources[].id is duplicated: ${source.id}`);
    } else {
      ids.add(source.id);
    }
    validateNullableNonEmptyString(source.url, `${label}.url`);
    if (source.retrieved_at !== undefined && source.retrieved_at !== null && typeof source.retrieved_at !== "string") {
      fail(`${label}.retrieved_at must be null or an ISO-8601 string`);
    }
    if (hasOwn(source, "cost") && !SOURCE_COSTS.has(source.cost)) {
      fail(`${label}.cost must be one of free / paid`);
    }
    if (source.note !== undefined && source.note !== null && typeof source.note !== "string") {
      fail(`${label}.note must be null or a string`);
    }
  }
  return value.length;
}

function validateFeedback(value) {
  if (!isPlainObject(value)) {
    fail("feedback must be an object");
    return;
  }
  for (const field of ["reserved", "note"]) {
    if (!hasOwn(value, field)) fail(`feedback.${field} is required`);
  }
  if (hasOwn(value, "reserved") && value.reserved !== true) {
    fail("feedback.reserved must be true (feedback from 80 post-publication analysis is a reserved field, not implemented in v0)");
  }
  if (value.note !== undefined && value.note !== null && typeof value.note !== "string") {
    fail("feedback.note must be null or a string");
  }
}

function requireRegularFile(reference, label) {
  const filePath = path.isAbsolute(reference) ? reference : path.resolve(planDirectory, reference);
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

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
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
