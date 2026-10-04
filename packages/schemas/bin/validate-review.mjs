#!/usr/bin/env node

// review.json v1 注釈モデルの構造と、JSON Schema 単体では表せない範囲・整合制約を検証する。
// targetKind の型別期待フィールド（契約 §3）は助言レベルのため warning（stderr）に出し、
// exit code は errors のみで決定する。edit.json との参照整合（src 等）は edit-lint の責務。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-review.mjs <review.json>";
const reviewArgument = process.argv[2];

if (!reviewArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (reviewArgument === "--help" || reviewArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const reviewPath = path.resolve(reviewArgument);
const schemaPath = fileURLToPath(new URL("../review.schema.json", import.meta.url));
const errors = [];
const warnings = [];

const TARGET_KINDS = new Set(["instant", "range", "region", "asset", "insert"]);
const STATUSES = new Set(["open", "addressed", "resolved"]);
// ライダー r1（2026-07-26-canvas-surface 起票時点で回収）: review セッション契約 §6 で
// input: "session" が昇格済みだったが、この enum は追随していなかった（実データに 2 件エラー）。
const INPUTS = new Set(["typed", "voice", "session"]);
// review セッション契約 §4.2 で確定した annotation 着地型。space により frame / sessionRef(canvasRef) の
// 要否が変わる（content-rect = 動画面・録音セッション由来のみ / image-rect = 画像面・単発注釈可 /
// canvas-rect = キャンバス面・単発注釈可・contract-2026-07-26-canvas-surface §4）。
const STROKE_SPACES = new Set(["content-rect", "image-rect", "canvas-rect"]);
// contract-2026-07-26-doc-image-annotations §1: doc:<プロジェクト相対パス>#<block-id> / image:<プロジェクト相対パス>。
// contract-2026-07-26-canvas-surface §4: canvas:<c-NNNN>。この 3 種に限り §2 で sourceT: null を許容する。
const DOC_TARGET_PATTERN = /^doc:(.+)#(.+)$/;
const IMAGE_TARGET_PATTERN = /^image:(.+)$/;
const CANVAS_TARGET_PATTERN = /^canvas:(c-\d{4,})$/;

if (!isRegularFile(reviewPath)) {
  fail(`review.json was not found: ${reviewPath}`);
  finish();
}

let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (error) {
  fail(`review.schema.json is not valid JSON: ${messageOf(error)}`);
  finish();
}
if (schema.$id !== "urn:akari-video:schema:review:v1") {
  fail("review.schema.json $id does not match the v1 contract");
  finish();
}

let review;
try {
  review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
} catch (error) {
  fail(`review.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validateReview(review);
finish();

function validateReview(value) {
  if (!isPlainObject(value)) {
    fail("review.json root must be an object");
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
  if (!Array.isArray(value.annotations)) {
    fail("annotations must be an array");
    return;
  }
  const ids = new Set();
  for (const [index, annotation] of value.annotations.entries()) {
    validateAnnotation(annotation, index, ids);
  }
}

function validateAnnotation(value, index, ids) {
  const label = `annotations[${index}]`;
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  if (!isNonEmptyString(value.id)) {
    fail(`${label}.id must be a non-empty string`);
  } else {
    if (ids.has(value.id)) fail(`annotations[].id is duplicated: ${value.id}`);
    ids.add(value.id);
    if (!/^a-\d{4,}$/.test(value.id)) {
      warn(`${label}.id differs from the recommended format a-0000: ${value.id}`);
    }
  }
  if (typeof value.createdAt !== "string") {
    fail(`${label}.createdAt must be a string`);
  }
  const docOrImageTarget = isDocOrImageTarget(value.target);
  if (value.sourceT === null) {
    if (!docOrImageTarget) {
      fail(
        `${label}.sourceT may be null only when target is doc: / image: / canvas: (annotations on the video need a time)`,
      );
    }
  } else if (!isFiniteNumber(value.sourceT) || value.sourceT < 0) {
    fail(`${label}.sourceT must be a finite number >= 0 (source seconds)`);
  }
  validateTarget(value.target, label);
  if (typeof value.text !== "string") {
    fail(`${label}.text must be a string`);
  }
  if (!INPUTS.has(value.input)) {
    fail(`${label}.input must be one of typed / voice / session`);
  }
  if (!STATUSES.has(value.status)) {
    fail(`${label}.status must be one of open / addressed / resolved`);
  }
  validateSourceRange(value.sourceRange, label);
  validateOptionalNonEmptyString(value.src, `${label}.src`);
  validateOptionalNonEmptyString(value.audio, `${label}.audio`);
  validateOptionalNonEmptyString(value.intent, `${label}.intent`);
  if (hasOwn(value, "timelineT") && value.timelineT !== null) {
    if (!isFiniteNumber(value.timelineT)) {
      fail(`${label}.timelineT must be null or a finite number`);
    } else {
      warn(
        `${label}.timelineT is deprecated (the timeline position is derived by projection from cuts[]). Write null for new entries`,
      );
    }
  }
  const targetKind = validateTargetKind(value.targetKind, label);
  const region = validateRegion(value.region, label);
  const strokes = validateStrokes(value.strokes, label);
  const refs = validateRefs(value.refs, label);
  const insertPosition = validateInsertPosition(value.insertPosition, label);
  if (hasOwn(value, "poses") && value.poses !== null) {
    warn(`${label}.poses is a reserved field (ignored in this version)`);
  }
  validateResponse(value.response, label);

  if (region && strokes) {
    warn(`${label} has both region and strokes (region.box takes precedence)`);
  }
  if (targetKind === "range" && !Array.isArray(value.sourceRange)) {
    warn(`${label} has targetKind range but no sourceRange`);
  }
  if (targetKind === "region" && !region && !strokes) {
    warn(`${label} has targetKind region but neither region nor strokes`);
  }
  if (targetKind === "asset" && !refs) {
    warn(`${label} has targetKind asset but no refs`);
  }
  if (targetKind === "insert" && !insertPosition) {
    warn(`${label} has targetKind insert but no insertPosition`);
  }
}

function isDocOrImageTarget(value) {
  return typeof value === "string"
    && (DOC_TARGET_PATTERN.test(value) || IMAGE_TARGET_PATTERN.test(value) || CANVAS_TARGET_PATTERN.test(value));
}

function validateTarget(value, label) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || !value) {
    fail(`${label}.target must be null or a non-empty string`);
    return;
  }
  if (value.startsWith("doc:") && !DOC_TARGET_PATTERN.test(value)) {
    fail(`${label}.target must be in the form doc:<project-relative-path>#<block-id>: ${value}`);
  } else if (value.startsWith("image:") && !IMAGE_TARGET_PATTERN.test(value)) {
    fail(`${label}.target must be in the form image:<project-relative-path>: ${value}`);
  } else if (value.startsWith("canvas:") && !CANVAS_TARGET_PATTERN.test(value)) {
    fail(`${label}.target must be in the form canvas:<c-NNNN>: ${value}`);
  }
}

function validateTargetKind(value, label) {
  if (value === undefined || value === null) return null;
  if (!TARGET_KINDS.has(value)) {
    fail(
      `${label}.targetKind must be one of instant / range / region / asset / insert, or null`,
    );
    return null;
  }
  return value;
}

function validateSourceRange(value, label) {
  if (value === undefined || value === null) return;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1])
  ) {
    fail(`${label}.sourceRange must be null or a numeric [start, end] pair`);
    return;
  }
  if (value[0] < 0 || value[1] <= value[0]) {
    fail(`${label}.sourceRange must satisfy 0 <= start < end`);
  }
}

function validateRegion(value, label) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value) || !Array.isArray(value.box) || value.box.length !== 4) {
    fail(`${label}.region must be null or { box: [x, y, w, h] }`);
    return null;
  }
  const [x, y, w, h] = value.box;
  const finite = value.box.every((entry) => isFiniteNumber(entry) && entry >= 0 && entry <= 1);
  if (!finite || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) {
    fail(
      `${label}.region.box must use normalized 0-1 coordinates with x+w<=1 and y+h<=1 (relative to the source frame)`,
    );
    return null;
  }
  return value;
}

function validateStrokes(value, label) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label}.strokes must be null or an array of at least 1 stroke`);
    return null;
  }
  for (const [strokeIndex, stroke] of value.entries()) {
    if (!validateStroke(stroke, `${label}.strokes[${strokeIndex}]`)) {
      return null;
    }
  }
  return value;
}

function validateStroke(stroke, label) {
  if (!isPlainObject(stroke) || stroke.tool !== "pen") {
    fail(`${label} must be an object { tool: "pen", space, points,... }`);
    return false;
  }
  if (!STROKE_SPACES.has(stroke.space)) {
    fail(`${label}.space must be one of content-rect / image-rect / canvas-rect`);
    return false;
  }
  if (!validateStrokePoints(stroke.points, label)) {
    return false;
  }
  if (stroke.space === "content-rect") {
    if (!isPlainObject(stroke.frame) || !isFiniteNumber(stroke.frame.sourceT) || stroke.frame.sourceT < 0) {
      fail(`${label}.frame must be { sourceT, cutIndex } (frame is required for content-rect)`);
      return false;
    }
    if (
      hasOwn(stroke.frame, "cutIndex") &&
      stroke.frame.cutIndex !== null &&
      !Number.isInteger(stroke.frame.cutIndex)
    ) {
      fail(`${label}.frame.cutIndex must be null or an integer`);
      return false;
    }
    if (!isNonEmptyString(stroke.sessionRef)) {
      fail(`${label}.sessionRef must be a non-empty string (required for content-rect)`);
      return false;
    }
    return true;
  }
  if (stroke.space === "image-rect") {
    // frame は動画フレームアンカーが存在しないため省略必須・sessionRef は単発注釈では省略可
    // （contract-2026-07-26-doc-image-annotations §3）。
    if (hasOwn(stroke, "frame")) {
      fail(`${label}.frame must be omitted for image-rect (there is no video frame anchor)`);
      return false;
    }
    if (hasOwn(stroke, "sessionRef") && !isNonEmptyString(stroke.sessionRef)) {
      fail(`${label}.sessionRef, when present, must be a non-empty string`);
      return false;
    }
    return true;
  }
  // space === "canvas-rect"（contract-2026-07-26-canvas-surface §4）: image-rect と同型だが
  // 出所参照フィールド名が canvasRef（c-0001/st-0003 形式）。frame は同じ理由で省略必須・canvasRef は任意。
  if (hasOwn(stroke, "frame")) {
    fail(`${label}.frame must be omitted for canvas-rect (there is no video frame anchor)`);
    return false;
  }
  if (hasOwn(stroke, "canvasRef") && !isNonEmptyString(stroke.canvasRef)) {
    fail(`${label}.canvasRef, when present, must be a non-empty string`);
    return false;
  }
  return true;
}

function validateStrokePoints(points, label) {
  if (!Array.isArray(points) || points.length < 2) {
    fail(`${label}.points must be a sequence of at least 2 [x, y] points`);
    return false;
  }
  for (const point of points) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every((entry) => isFiniteNumber(entry) && entry >= 0 && entry <= 1)
    ) {
      fail(`${label}.points entries must be normalized 0-1 coordinates [x, y]`);
      return false;
    }
  }
  return true;
}

function validateRefs(value, label) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label}.refs must be null or an array of at least 1 item`);
    return null;
  }
  for (const [refIndex, ref] of value.entries()) {
    if (!isPlainObject(ref)) {
      fail(`${label}.refs[${refIndex}] must be an object`);
      return null;
    }
    const hasSrc = hasOwn(ref, "src");
    const hasPath = hasOwn(ref, "path");
    if (hasSrc === hasPath) {
      fail(`${label}.refs[${refIndex}] must have exactly one of src or path`);
      return null;
    }
    const reference = hasSrc ? ref.src : ref.path;
    if (!isNonEmptyString(reference)) {
      fail(`${label}.refs[${refIndex}].${hasSrc ? "src" : "path"} must be a non-empty string`);
      return null;
    }
  }
  return value;
}

function validateInsertPosition(value, label) {
  if (value === undefined || value === null) return null;
  if (value !== "before" && value !== "after") {
    fail(`${label}.insertPosition must be before / after, or null`);
    return null;
  }
  return value;
}

function validateResponse(value, label) {
  if (value === undefined || value === null) return;
  if (
    !isPlainObject(value) ||
    typeof value.summary !== "string" ||
    (value.action !== "edited" && value.action !== "declined") ||
    typeof value.respondedAt !== "string"
  ) {
    fail(`${label}.response must be null or { summary, action, respondedAt }`);
  }
}

function validateOptionalNonEmptyString(value, label) {
  if (value === undefined || value === null) return;
  if (!isNonEmptyString(value)) {
    fail(`${label} must be null or a non-empty string`);
  }
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
    console.error(`NG: ${reviewPath}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`OK: ${reviewPath}${warnings.length > 0 ? ` (${warnings.length} warnings)` : ""}`);
  process.exit(0);
}
