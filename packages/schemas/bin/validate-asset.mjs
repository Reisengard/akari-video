#!/usr/bin/env node

// 素材ライブラリ契約 v0 の構造を、Node.js 組み込み機能だけで検証する。

import fs from "node:fs";
import { runtimes, validateRuntimeDeclarations } from "../../overlay-runtime/runtimes.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node packages/schemas/bin/validate-asset.mjs assets/<overlay|still|scene3d|audio|broll|font|textstyle>/<id>";
const assetArgument = process.argv[2];

if (!assetArgument || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

if (assetArgument === "--help" || assetArgument === "-h") {
  console.log(usage);
  process.exit(0);
}

const assetDir = path.resolve(assetArgument);
const metaPath = path.join(assetDir, "meta.json");
const previewPath = path.join(assetDir, "preview.png");
const errors = [];

if (!isDirectory(assetDir)) {
  fail(`Asset directory was not found: ${assetDir}`);
  finish();
}

if (!isRegularFile(metaPath)) {
  fail(`meta.json was not found: ${metaPath}`);
  finish();
}

let meta;
try {
  meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
} catch (error) {
  fail(`meta.json is not valid JSON: ${messageOf(error)}`);
  finish();
}

validateMeta(meta);
validateDirectoryContract(meta);
validateFiles();
finish();

function validateMeta(value) {
  if (!isPlainObject(value)) {
    fail("meta.json root must be an object");
    return;
  }

  const requiredFields = [
    "id",
    "category",
    "title",
    "description",
    "when_to_use",
    "tags",
    "knobs",
    "ai_usage",
    "requires",
    "provenance",
    "author",
    "license",
    "price",
  ];
  // source / remote / matched_by / version / min_app_version / min_overlay_runtime_version / motion_presets は
  // 任意フィールド。後方互換のため必須フィールドには加えない（version は 2026-07-30 導入で、既存エントリは未設定。
  // min_overlay_runtime_version は 2026-08-06 層ミラー規約の導入で新設。motion_presets は同日 laptop-live-asset
  // タスクで新設 — scene3d ライブ経路の glb 内蔵クリップ一覧を機械可読にする）。
  const optionalFields = [
    "source",
    "remote",
    "matched_by",
    "version",
    "min_app_version",
    "min_overlay_runtime_version",
    "motion_presets",
  ];
  const allowedFields = [...requiredFields, ...optionalFields];
  for (const field of requiredFields) {
    if (!hasOwn(value, field)) fail(`Required field is missing: ${field}`);
  }

  const unknownFields = Object.keys(value).filter((field) => !allowedFields.includes(field));
  for (const field of unknownFields) fail(`Unknown top-level field: ${field}`);

  validateNonEmptyString(value.id, "id");
  if (typeof value.id === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    fail("id must be kebab-case of lowercase letters and digits");
  }

  // 2026-07-29: 主題（3d/motion/telop/thumbnail）から配布物の形へ切り替え。主題は tags に逃がす。
  const categories = new Set(["overlay", "still", "scene3d", "audio", "broll", "font", "textstyle"]);
  if (typeof value.category !== "string" || !categories.has(value.category)) {
    fail("category must be one of overlay / still / scene3d / audio / broll / font / textstyle");
  }

  for (const field of ["title", "description", "when_to_use", "ai_usage", "author"]) {
    validateNonEmptyString(value[field], field);
  }

  validateStringArray(value.tags, "tags");
  validateStringArray(value.requires, "requires");
  validateKnobs(value.knobs);
  validateProvenance(value.provenance);
  validateLicense(value.license);

  if (value.price !== null && (!isFiniteNumber(value.price) || value.price < 0)) {
    fail("price must be null or a finite number >= 0");
  }

  if (hasOwn(value, "version")) {
    if (!Number.isInteger(value.version) || value.version < 1) {
      fail("version must be an integer >= 1");
    }
  }

  if (hasOwn(value, "min_app_version") && !/^\d+\.\d+\.\d+$/.test(String(value.min_app_version))) {
    fail("min_app_version must be x.y.z form");
  }

  if (
    hasOwn(value, "min_overlay_runtime_version") &&
    !/^\d+\.\d+\.\d+$/.test(String(value.min_overlay_runtime_version))
  ) {
    fail("min_overlay_runtime_version must be x.y.z form");
  }

  const matchedByValues = new Set(["title-normalized"]);
  if (hasOwn(value, "matched_by") && !matchedByValues.has(value.matched_by)) {
    fail(`matched_by must be one of ${[...matchedByValues].join(" / ")}`);
  }

  const isRemote = value.remote === true;
  if (hasOwn(value, "remote") && typeof value.remote !== "boolean") {
    fail("remote must be a boolean");
  }
  if (hasOwn(value, "source")) {
    validateSource(value.source);
  }
  if (isRemote && !hasOwn(value, "source")) {
    fail("An entry with remote: true requires a source block");
  }

  if (hasOwn(value, "motion_presets")) {
    validateMotionPresets(value.motion_presets);
  }
}

function validateMotionPresets(motionPresets) {
  if (!Array.isArray(motionPresets) || motionPresets.length === 0) {
    fail("motion_presets must be an array of at least 1 item");
    return;
  }

  const presetFields = ["clip", "label", "note"];
  motionPresets.forEach((preset, index) => {
    if (!isPlainObject(preset)) {
      fail(`motion_presets[${index}] must be an object`);
      return;
    }
    for (const field of presetFields) {
      if (!hasOwn(preset, field)) fail(`motion_presets[${index}].${field} is required`);
    }
    for (const field of Object.keys(preset)) {
      if (!presetFields.includes(field)) fail(`motion_presets[${index}].${field} is an unknown field`);
    }
    validateNonEmptyString(preset.clip, `motion_presets[${index}].clip`);
    validateNonEmptyString(preset.label, `motion_presets[${index}].label`);
    validateNonEmptyString(preset.note, `motion_presets[${index}].note`);
  });
}

function validateSource(source) {
  if (!isPlainObject(source)) {
    fail("source must be an object");
    return;
  }

  const sourceFields = ["url", "acquisition", "license_at_source", "attribution_required", "preview_url"];
  const requiredSourceFields = ["url", "acquisition", "license_at_source", "attribution_required"];
  for (const field of requiredSourceFields) {
    if (!hasOwn(source, field)) fail(`source.${field} is required`);
  }
  for (const field of Object.keys(source)) {
    if (!sourceFields.includes(field)) fail(`source.${field} is an unknown field`);
  }

  validateHttpUrl(source.url, "source.url");

  const acquisitionTypes = new Set(["direct", "login", "purchase"]);
  if (typeof source.acquisition !== "string" || !acquisitionTypes.has(source.acquisition)) {
    fail("source.acquisition must be one of direct / login / purchase");
  }

  validateNonEmptyString(source.license_at_source, "source.license_at_source");

  if (typeof source.attribution_required !== "boolean") {
    fail("source.attribution_required must be a boolean");
  }

  if (hasOwn(source, "preview_url")) {
    validateHttpUrl(source.preview_url, "source.preview_url");
  }
}

function validateHttpUrl(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid URL: ${value}`);
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`${label} must be an http(s) URL: ${value}`);
  }
}

function validateKnobs(knobs) {
  if (!Array.isArray(knobs)) {
    fail("knobs must be an array");
    return;
  }

  const knobTypes = new Set(["text", "color", "slider", "dropdown", "checkbox", "media"]);
  const cssVars = new Set();
  const params = new Set();
  for (const [index, knob] of knobs.entries()) {
    const label = `knobs[${index}]`;
    if (!isPlainObject(knob)) {
      fail(`${label} must be an object`);
      continue;
    }

    for (const field of ["type", "group"]) {
      if (!hasOwn(knob, field)) fail(`${label}.${field} is required`);
    }

    // バインド先は cssVar（オーバーレイ素材）か param（3D ベイクレシピ）のどちらか一方（2026-07-14 追記）
    const hasCssVar = hasOwn(knob, "cssVar");
    const hasParam = hasOwn(knob, "param");
    if (hasCssVar === hasParam) {
      fail(`${label} requires exactly one of cssVar or param`);
    }

    if (hasCssVar) {
      validateNonEmptyString(knob.cssVar, `${label}.cssVar`);
      if (typeof knob.cssVar === "string") {
        if (!/^--[A-Za-z_][A-Za-z0-9_-]*$/.test(knob.cssVar)) {
          fail(`${label}.cssVar must be a CSS custom property name`);
        }
        if (cssVars.has(knob.cssVar)) fail(`${label}.cssVar is duplicated: ${knob.cssVar}`);
        cssVars.add(knob.cssVar);
      }
    }

    if (hasParam) {
      validateNonEmptyString(knob.param, `${label}.param`);
      if (typeof knob.param === "string") {
        if (!/^[a-z_][a-z0-9_]*$/.test(knob.param)) {
          fail(`${label}.param must be snake_case (lowercase letters, digits, and underscores)`);
        }
        if (params.has(knob.param)) fail(`${label}.param is duplicated: ${knob.param}`);
        params.add(knob.param);
      }
    }

    if (typeof knob.type !== "string" || !knobTypes.has(knob.type)) {
      fail(`${label}.type must be one of ${[...knobTypes].join(" / ")}`);
    }
    validateNonEmptyString(knob.group, `${label}.group`);
    if (hasOwn(knob, "label")) validateNonEmptyString(knob.label, `${label}.label`);
    if (hasOwn(knob, "min") && !isFiniteNumber(knob.min)) {
      fail(`${label}.min must be a finite number`);
    }
    if (hasOwn(knob, "max") && !isFiniteNumber(knob.max)) {
      fail(`${label}.max must be a finite number`);
    }
    if (isFiniteNumber(knob.min) && isFiniteNumber(knob.max) && knob.min > knob.max) {
      fail(`${label}.min must be <= max`);
    }
    if (hasOwn(knob, "unit") && typeof knob.unit !== "string") {
      fail(`${label}.unit must be a string`);
    }
    if (hasOwn(knob, "default")) {
      const valid = knob.type === "slider"
        ? isFiniteNumber(knob.default)
        : typeof knob.default === "string";
      if (!valid) fail(`${label}.default must be ${knob.type === "slider" ? "a finite number" : "a string"}`);
    }
  }
}

function validateProvenance(provenance) {
  if (!isPlainObject(provenance)) {
    fail("provenance must be an object");
    return;
  }

  for (const field of ["origin", "generator"]) {
    if (!hasOwn(provenance, field)) fail(`provenance.${field} is required`);
  }
  for (const field of Object.keys(provenance)) {
    if (!["origin", "generator"].includes(field)) {
      fail(`provenance.${field} is an unknown field`);
    }
  }
  validateNonEmptyString(provenance.origin, "provenance.origin");
  if (provenance.generator !== null) {
    validateNonEmptyString(provenance.generator, "provenance.generator");
  }
}

function validateLicense(license) {
  if (!isPlainObject(license)) {
    fail("license must be an object");
    return;
  }

  const licenseFields = [
    "spdx",
    "scope",
    "attribution_required",
    "ai_training_allowed",
  ];
  for (const field of licenseFields) {
    if (!hasOwn(license, field)) fail(`license.${field} is required`);
  }
  for (const field of Object.keys(license)) {
    if (!licenseFields.includes(field)) fail(`license.${field} is an unknown field`);
  }

  validateNonEmptyString(license.spdx, "license.spdx");
  validateNonEmptyString(license.scope, "license.scope");
  if (typeof license.attribution_required !== "boolean") {
    fail("license.attribution_required must be a boolean");
  }
  if (typeof license.ai_training_allowed !== "boolean") {
    fail("license.ai_training_allowed must be a boolean");
  }
}

function validateDirectoryContract(value) {
  if (!isPlainObject(value)) return;

  const assetId = path.basename(assetDir);
  const categoryDir = path.basename(path.dirname(assetDir));
  if (typeof value.id === "string" && value.id !== assetId) {
    fail(`id does not match the asset directory name: ${value.id} != ${assetId}`);
  }
  if (typeof value.category === "string" && value.category !== categoryDir) {
    fail(`category does not match the parent directory name: ${value.category} != ${categoryDir}`);
  }
}

function validateFiles() {
  if (isPlainObject(meta) && meta.remote === true) {
    // remote: true のエントリは実体（fragment.html / preview.png / バイナリ等）を持たない。
    // source ブロックの妥当性は validateMeta 側（validateSource）で検証済み。
    return;
  }

  if (!isRegularFile(previewPath)) {
    fail(`preview.png was not found: ${previewPath}`);
  } else {
    validatePng(previewPath);
  }

  let payloadFiles;
  try {
    payloadFiles = listRegularFiles(assetDir).filter(
      (filePath) => filePath !== metaPath && filePath !== previewPath,
    );
  } catch (error) {
    fail(`Cannot list the asset directory: ${messageOf(error)}`);
    return;
  }
  const category = path.basename(path.dirname(assetDir));
  if (category === "textstyle") {
    const presetPath = path.join(assetDir, "preset.json");
    if (!isRegularFile(presetPath)) {
      fail(`A textstyle asset requires preset.json: ${presetPath}`);
    } else {
      try {
        const preset = JSON.parse(fs.readFileSync(presetPath, "utf8"));
        if (!isPlainObject(preset) || preset.format !== "akari-textstyle") {
          fail("preset.json format must be akari-textstyle");
        }
        if (!isPlainObject(preset) || preset.id !== meta.id) {
          fail("preset.json id must match the id in meta.json");
        }
      } catch (error) {
        fail(`preset.json is not valid JSON: ${messageOf(error)}`);
      }
    }
  }
  if (payloadFiles.length === 0) {
    fail("No content files found (at least one file other than meta.json / preview.png is required)");
    return;
  }
  if (["overlay", "still"].includes(category)) {
    const fragmentPath = path.join(assetDir, "fragment.html");
    if (!isRegularFile(fragmentPath)) {
      fail(`A ${category} asset requires fragment.html`);
    }
  }

  if (category === "scene3d") {
    // scene3d は fragment.html（経路 A: オーバーレイ）か scene.py（経路 B: ベイクレシピ）のどちらか一方
    // （契約: docs/contract-2026-07-14-3d-bake-recipe.md）
    const hasFragment = isRegularFile(path.join(assetDir, "fragment.html"));
    const hasScene = isRegularFile(path.join(assetDir, "scene.py"));
    if (hasFragment === hasScene) {
      fail("A scene3d asset must contain exactly one of fragment.html (overlay) or scene.py (bake recipe) as its content");
    }
  }

  for (const filePath of payloadFiles) {
    const name = relativeToAsset(filePath).replaceAll("\\", "/");
    if (name !== "fragment.html" && !/^variants\/[^/]+\.html$/i.test(name)) continue;
    let html;
    try { html = fs.readFileSync(filePath, "utf8"); }
    catch (error) { fail(`fragment.html could not be read: ${messageOf(error)}`); continue; }
    for (const error of validateRuntimeDeclarations(html, {
      meta, category, name, payloadFiles,
      validateReference: reference => validateReference(filePath, reference),
    })) fail(error);
  }

  for (const filePath of payloadFiles) {
    if (/\.(?:html?|css|svg|m?js|cjs)$/i.test(filePath)) validateLocalReferences(filePath);
    else if (/\.gltf$/i.test(filePath)) validateGltfReferences(filePath);
  }
}

function validatePng(filePath) {
  try {
    const header = fs.readFileSync(filePath).subarray(0, 24);
    if (
      header.length < 24 ||
      header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    ) {
      fail("preview.png must have a valid PNG signature");
    }
  } catch (error) {
    fail(`preview.png could not be read: ${messageOf(error)}`);
  }
}

function validateLocalReferences(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`Cannot read the referencing file: ${relativeToAsset(filePath)}: ${messageOf(error)}`);
    return;
  }

  const references = new Set();
  const patterns = [
    /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /@import\s+["']([^"']+)["']/gi,
    /\bfetch\s*\(\s*["']([^"']+)["']/gi,
    /\bnew\s+URL\s*\(\s*["']([^"']+)["']/gi,
    /\.load(?:Async)?\s*\(\s*["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      // new URL(url, base) is a dynamic JS constructor, not CSS url().
      // Manifest capabilities preserve the legacy dynamic-constructor exemption.
      if (pattern === patterns[1] && runtimes.some(entry => entry.skipDynamicNewUrl && entry.appliesTo(meta))
          && /\.(?:m?js|cjs)$/i.test(filePath) && match[0].startsWith("URL(")
          && /\bnew\s*$/u.test(source.slice(0, match.index))) continue;
      references.add(match[1].trim());
    }
  }

  for (const match of source.matchAll(/\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gi)) {
    if (isPathLikeReference(match[1])) references.add(match[1].trim());
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/gi)) {
    if (isPathLikeReference(match[1])) references.add(match[1].trim());
  }
  for (const match of source.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    if (match[1].trim().startsWith("data:")) continue;
    for (const candidate of match[1].split(",")) {
      const reference = candidate.trim().split(/\s+/, 1)[0];
      if (reference) references.add(reference);
    }
  }

  for (const reference of references) validateReference(filePath, reference);
}

function validateGltfReferences(filePath) {
  let gltf;
  try {
    gltf = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Cannot read ${relativeToAsset(filePath)} as glTF JSON: ${messageOf(error)}`);
    return;
  }

  if (!isPlainObject(gltf)) {
    fail(`${relativeToAsset(filePath)} root must be an object`);
    return;
  }

  for (const collectionName of ["buffers", "images"]) {
    const collection = gltf[collectionName];
    if (collection === undefined) continue;
    if (!Array.isArray(collection)) {
      fail(`${relativeToAsset(filePath)}.${collectionName} must be an array`);
      continue;
    }

    for (const [index, entry] of collection.entries()) {
      if (!isPlainObject(entry)) {
        fail(`${relativeToAsset(filePath)}.${collectionName}[${index}] must be an object`);
        continue;
      }
      if (!hasOwn(entry, "uri")) continue;
      if (typeof entry.uri !== "string" || entry.uri.trim().length === 0) {
        fail(`${relativeToAsset(filePath)}.${collectionName}[${index}].uri must be a non-empty string`);
        continue;
      }
      validateReference(filePath, entry.uri.trim());
    }
  }
}

function validateReference(sourcePath, reference) {
  if (isExternalReference(reference)) return;

  if (reference.startsWith("file:")) {
    let filePathReference;
    try {
      filePathReference = fileURLToPath(reference);
    } catch {
      fail(`${relativeToAsset(sourcePath)} has an invalid file: reference: ${reference}`);
      return;
    }
    validateReferenceTarget(sourcePath, reference, filePathReference);
    return;
  }

  const withoutSuffix = reference.split(/[?#]/, 1)[0];
  if (!withoutSuffix) return;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    fail(`Cannot URL-decode a reference in ${relativeToAsset(sourcePath)}: ${reference}`);
    return;
  }

  validateReferenceTarget(sourcePath, reference, path.resolve(path.dirname(sourcePath), decoded));
}

function validateReferenceTarget(sourcePath, reference, targetPath) {
  const relativeTarget = path.relative(assetDir, targetPath);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    fail(`${relativeToAsset(sourcePath)} references a path outside the asset directory: ${reference}`);
    return;
  }
  if (!isRegularFile(targetPath)) {
    fail(`Referenced file of ${relativeToAsset(sourcePath)} was not found: ${reference}`);
    return;
  }

  try {
    const realAssetDir = fs.realpathSync(assetDir);
    const realTargetPath = fs.realpathSync(targetPath);
    const realRelativeTarget = path.relative(realAssetDir, realTargetPath);
    if (realRelativeTarget.startsWith("..") || path.isAbsolute(realRelativeTarget)) {
      fail(`${relativeToAsset(sourcePath)} references a path outside the asset directory via a symlink: ${reference}`);
    }
  } catch (error) {
    fail(`Cannot resolve a reference target of ${relativeToAsset(sourcePath)}: ${reference}: ${messageOf(error)}`);
  }
}

function isExternalReference(reference) {
  return (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    reference.startsWith("var(") ||
    /^(?:https?|data|blob|mailto|javascript):/i.test(reference)
  );
}

function isPathLikeReference(reference) {
  return /^(?:\.{0,2}\/|file:)/.test(reference);
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

function listRegularFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listRegularFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function relativeToAsset(filePath) {
  return path.relative(assetDir, filePath) || ".";
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  errors.push(message);
}

function finish() {
  if (errors.length > 0) {
    console.error(`NG: ${assetDir}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`OK: ${assetDir}`);
  process.exit(0);
}
