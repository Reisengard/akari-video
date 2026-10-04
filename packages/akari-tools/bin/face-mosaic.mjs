#!/usr/bin/env node

// face_landmarks.face_contour と edit.json の cuts から、顔形マスク付きの真の
// ピクセル化 overlay を小領域 ProRes 4444 として事前ベイクする決定論変換器。
// render-cut は変更せず、既存 layers[kind=baked] + transform keyframes だけを出力する。

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { printJson, summarize } from "../src/common/json-output.mjs";
import { checkMediaAvailability } from "../src/common/media-availability.mjs";
import { stampSavedBy } from "../src/common/writer-stamp.mjs";
import { appendLayersAdditive, loadEditJson } from "../src/eye-bar/edit-apply.mjs";
import { resolveTargetSourceId } from "../src/eye-bar/resolve-source.mjs";
import { probeSourceDisplaySize } from "../src/eye-bar/source-probe.mjs";
import { bakeMosaicClip } from "./face-mosaic/bake.mjs";
import { buildMosaicPlan } from "./face-mosaic/plan.mjs";

const summary = (value, fallback) => summarize(value, fallback, 1000);

function parseArguments(argv) {
  const options = {
    check: false, apply: false, analysis: null, edit: null, sourceId: null, face: 0,
    blockSize: "0.08", strength: 0.82, feather: 8, smoothWindow: 9,
    outDir: null, layerIdPrefix: "face-mosaic",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") { options.check = true; continue; }
    if (arg === "--apply") { options.apply = true; continue; }
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--analysis") options.analysis = resolve(value);
    else if (arg === "--edit") options.edit = resolve(value);
    else if (arg === "--source-id") options.sourceId = value;
    else if (arg === "--face") options.face = Number(value);
    else if (arg === "--block-size") options.blockSize = value;
    else if (arg === "--strength") options.strength = Number(value);
    else if (arg === "--feather") options.feather = Number(value);
    else if (arg === "--smooth-window") options.smoothWindow = Number(value);
    else if (arg === "--out-dir") options.outDir = resolve(value);
    else if (arg === "--layer-id-prefix") options.layerIdPrefix = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.face) || options.face < 0) throw new Error("--face must be an integer >= 0");
  if (!(options.strength >= 0 && options.strength <= 1)) throw new Error("--strength must be between 0 and 1");
  if (!(options.feather >= 0)) throw new Error("--feather must be a px value >= 0");
  if (!Number.isInteger(options.smoothWindow) || options.smoothWindow < 1) throw new Error("--smooth-window must be a positive integer");
  return options;
}

function loadTrack(analysisPath) {
  const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
  const pointer = analysis?.tracks?.face_landmarks;
  if (!pointer?.path) throw new Error("analysis.json has no tracks.face_landmarks");
  const trackPath = isAbsolute(pointer.path) ? pointer.path : resolve(dirname(analysisPath), pointer.path);
  if (!existsSync(trackPath)) throw new Error(`face-landmarks track was not found: ${trackPath}`);
  return { trackPath, track: JSON.parse(readFileSync(trackPath, "utf8")) };
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) { printJson({ ok: false, reason: summary(error.message, "Invalid arguments") }); process.exitCode = 2; return; }
  if (options.check) { printJson(checkMediaAvailability()); return; }
  if (!options.analysis || !options.edit) {
    printJson({ ok: false, reason: "--analysis and --edit are required" });
    process.exitCode = 2;
    return;
  }
  if (!existsSync(options.analysis) || !existsSync(options.edit)) {
    printJson({ ok: false, reason: "analysis.json or edit.json was not found" });
    process.exitCode = 1;
    return;
  }
  const available = checkMediaAvailability();
  if (!available.available) { printJson({ ok: false, ...available }); process.exitCode = 1; return; }

  try {
    const { trackPath, track } = loadTrack(options.analysis);
    const edit = loadEditJson(options.edit);
    const sourceResolution = resolveTargetSourceId(trackPath, track, options.edit, edit, options.sourceId);
    if (!sourceResolution.ok) throw new Error(sourceResolution.reason);
    const sourcePath = resolve(dirname(trackPath), track.source.path);
    const probed = probeSourceDisplaySize(sourcePath);
    if (!probed.ok) throw new Error(`Could not read the source dimensions: ${probed.reason}`);
    const canvasWidth = Number(edit?.output?.width);
    const canvasHeight = Number(edit?.output?.height);
    const fps = Number(edit?.output?.fps || 30);
    if (!(canvasWidth > 0 && canvasHeight > 0 && fps > 0)) throw new Error("edit.json output width/height/fps is invalid");
    const projectRoot = dirname(options.edit);
    const outDir = options.outDir ?? join(projectRoot, ".akari", "cache", "face-mosaic");
    mkdirSync(outDir, { recursive: true });
    const plan = buildMosaicPlan({
      track, cuts: edit.cuts, sourceId: sourceResolution.sourceId, sourcePath,
      sourceWidth: probed.width, sourceHeight: probed.height,
      canvasWidth, canvasHeight, fps, faceIndex: options.face,
      smoothWindow: options.smoothWindow, blockSize: options.blockSize,
      strength: options.strength, feather: options.feather,
      layerIdPrefix: options.layerIdPrefix,
      outPathFor: (index) => join(outDir, `${options.layerIdPrefix}-face${options.face}-${index}.mov`),
    });
    if (!plan.ok) { printJson(plan); process.exitCode = 1; return; }

    const assets = [];
    for (let index = 0; index < plan.jobs.length; index += 1) {
      const baked = bakeMosaicClip(plan.jobs[index]);
      if (!baked.ok) throw new Error(`Baking clip ${index} failed: ${baked.reason}`);
      assets.push({ path: baked.outPath, width: plan.jobs[index].cropWidth, height: plan.jobs[index].cropHeight,
        frames: baked.frameCount, block_pixels: baked.blockPixels });
      plan.layers[index].src = relative(projectRoot, baked.outPath).split(sep).join("/");
    }
    const output = {
      ok: true,
      layers: plan.layers,
      warnings: [...(sourceResolution.warning ? [sourceResolution.warning] : []), ...plan.warnings],
      stats: { clips: assets.length, assets },
    };
    if (options.apply) {
      const applied = appendLayersAdditive(options.edit, plan.layers);
      if (!applied.ok) throw new Error(applied.reason);
      if (basename(options.edit) === "edit.json") await stampSavedBy(dirname(options.edit));
      output.applied = { addedIds: applied.addedIds };
    }
    printJson(output);
  } catch (error) {
    printJson({ ok: false, reason: summary(error.message, "face-mosaic Generation failed") });
    process.exitCode = 1;
  }
}

await main();
