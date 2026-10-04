#!/usr/bin/env node

// body_pose_3d の 2D projection からアルファ付きスケルトンを事前ベイクし、
// render-cut 既存の kind:"baked" layers[] へ決定論的に変換する。

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { printJson, summarize } from "../src/common/json-output.mjs";
import { checkMediaAvailability } from "../src/common/media-availability.mjs";
import { stampSavedBy } from "../src/common/writer-stamp.mjs";
import { appendLayersAdditive, loadEditJson } from "../src/eye-bar/edit-apply.mjs";
import { resolveTargetSourceId } from "../src/eye-bar/resolve-source.mjs";
import { probeSourceDisplaySize } from "../src/eye-bar/source-probe.mjs";
import { bakeSkeletonClip } from "./pose-skeleton/bake.mjs";
import { buildSkeletonPlan } from "./pose-skeleton/plan.mjs";
import { parseColor } from "./pose-skeleton/skeleton.mjs";

const summary = (value, fallback) => summarize(value, fallback, 1000);

function parseArguments(argv) {
  const options = {
    check: false,
    apply: false,
    analysis: null,
    edit: null,
    sourceId: null,
    strokeWidth: 4,
    color: "#00e5ff",
    jointRadius: 6,
    smoothing: 5,
    minConfidence: 0.3,
    outDir: null,
    layerIdPrefix: "pose-skeleton",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") { options.check = true; continue; }
    if (argument === "--apply") { options.apply = true; continue; }
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    if (argument === "--analysis") options.analysis = resolve(value);
    else if (argument === "--edit") options.edit = resolve(value);
    else if (argument === "--source-id") options.sourceId = value;
    else if (argument === "--stroke-width") options.strokeWidth = Number(value);
    else if (argument === "--color") options.color = parseColor(value).css;
    else if (argument === "--joint-radius") options.jointRadius = Number(value);
    else if (argument === "--smoothing") options.smoothing = Number(value);
    else if (argument === "--min-confidence") options.minConfidence = Number(value);
    else if (argument === "--out-dir") options.outDir = resolve(value);
    else if (argument === "--layer-id-prefix") options.layerIdPrefix = value;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!(options.strokeWidth > 0)) throw new Error("--stroke-width must be a px value greater than 0");
  if (!(options.jointRadius > 0)) throw new Error("--joint-radius must be a px value greater than 0");
  if (!Number.isInteger(options.smoothing) || options.smoothing < 1) {
    throw new Error("--smoothing must be an integer >= 1 (moving-average window; 1 means no smoothing)");
  }
  if (!(options.minConfidence >= 0 && options.minConfidence <= 1)) {
    throw new Error("--min-confidence must be between 0 and 1");
  }
  return options;
}

function loadTrack(analysisPath) {
  const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
  const pointer = analysis?.tracks?.body_pose_3d;
  if (!pointer?.path) throw new Error("analysis.json has no tracks.body_pose_3d");
  const trackPath = isAbsolute(pointer.path) ? pointer.path : resolve(dirname(analysisPath), pointer.path);
  if (!existsSync(trackPath)) throw new Error(`body-pose-3d track was not found: ${trackPath}`);
  const track = JSON.parse(readFileSync(trackPath, "utf8"));
  if (track?.kind !== "body-pose-3d") throw new Error("track.kind is not body-pose-3d");
  return { trackPath, track };
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) {
    printJson({ ok: false, reason: summary(error.message, "Invalid arguments") });
    process.exitCode = 2;
    return;
  }
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
    const sourceResolution = resolveTargetSourceId(
      trackPath, track, options.edit, edit, options.sourceId,
    );
    if (!sourceResolution.ok) throw new Error(sourceResolution.reason);
    const sourcePath = resolve(dirname(trackPath), track.source.path);
    const probed = probeSourceDisplaySize(sourcePath);
    if (!probed.ok) throw new Error(`Could not read the source dimensions: ${probed.reason}`);
    const canvasWidth = Number(edit?.output?.width);
    const canvasHeight = Number(edit?.output?.height);
    const fps = Number(edit?.output?.fps || 30);
    if (!(canvasWidth > 0 && canvasHeight > 0 && fps > 0)) {
      throw new Error("edit.json output width/height/fps is invalid");
    }
    const projectRoot = dirname(options.edit);
    const outDir = options.outDir ?? join(projectRoot, ".akari", "cache", "pose-skeleton");
    mkdirSync(outDir, { recursive: true });
    const plan = buildSkeletonPlan({
      track,
      cuts: edit.cuts,
      sourceId: sourceResolution.sourceId,
      sourceWidth: probed.width,
      sourceHeight: probed.height,
      canvasWidth,
      canvasHeight,
      fps,
      strokeWidth: options.strokeWidth,
      color: options.color,
      jointRadius: options.jointRadius,
      smoothing: options.smoothing,
      minConfidence: options.minConfidence,
      layerIdPrefix: options.layerIdPrefix,
      outPathFor: (index) => join(outDir, `${options.layerIdPrefix}-${index}.mov`),
    });
    if (!plan.ok) { printJson(plan); process.exitCode = 1; return; }

    const assets = [];
    for (let index = 0; index < plan.jobs.length; index += 1) {
      const baked = bakeSkeletonClip(plan.jobs[index]);
      if (!baked.ok) throw new Error(`Baking clip ${index} failed: ${baked.reason}`);
      plan.layers[index].src = relative(projectRoot, baked.outPath).split(sep).join("/");
      assets.push({
        path: baked.outPath,
        width: plan.jobs[index].cropWidth,
        height: plan.jobs[index].cropHeight,
        frames: baked.frameCount,
      });
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
    printJson({ ok: false, reason: summary(error.message, "pose-skeleton Generation failed") });
    process.exitCode = 1;
  }
}

await main();
