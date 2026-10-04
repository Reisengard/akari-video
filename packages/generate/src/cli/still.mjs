import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

import { generateCodexImages } from "./codex-image.mjs";
import { renderTextCard } from "./text-card.mjs";
import { hasGeneratedId, insertGeneratedStills, readEditForPlan, firstVisualTrack, endOfTrack } from "./edit-insert.mjs";
import { doneStillMeta, failedStillMeta, inspectPng, plannedStillMeta, readCodexModelAsOf, withNextVideoDraft } from "./meta-still.mjs";
import { makeReference } from "./media-ref.mjs";
import { validateGenerationMeta } from "./meta-validate.mjs";
import { STILL_USAGE } from "./usage.mjs";

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const parsed = { parallel: 4, placeholder: false, dryRun: false, json: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--spec") parsed.spec = argv[++index];
    else if (value === "--parallel") parsed.parallel = Number(argv[++index]);
    else if (value === "--placeholder") parsed.placeholder = true;
    else if (value === "--dry-run") parsed.dryRun = true;
    else if (value === "--json") parsed.json = true;
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else positional.push(value);
  }
  if (positional.length !== 1) throw new Error("Pass exactly one projectDir");
  if (!parsed.spec) throw new Error("--spec <beats.json> is required");
  if (!Number.isInteger(parsed.parallel) || parsed.parallel < 1 || parsed.parallel > 32) {
    throw new Error("--parallel must be an integer from 1 to 32");
  }
  parsed.projectDir = resolve(positional[0]);
  parsed.spec = isAbsolute(parsed.spec) ? parsed.spec : resolve(parsed.spec);
  return parsed;
}

async function loadSpec(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw) && raw?.style_suffix !== undefined && typeof raw.style_suffix !== "string") {
    throw new Error("style_suffix must be a string");
  }
  const styleSuffix = Array.isArray(raw) ? "" : raw?.style_suffix ?? "";
  const beats = Array.isArray(raw) ? raw : raw?.beats;
  if (!Array.isArray(beats) || beats.length === 0) throw new Error("spec needs a beats array with at least one beat");
  const ids = new Set();
  return {
    styleSuffix,
    beats: beats.map((beat, index) => {
      if (!beat || typeof beat !== "object") throw new Error(`beats[${index}] is not an object`);
      if (typeof beat.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(beat.id)) throw new Error(`beats[${index}].id must be kebab-case`);
      if (ids.has(beat.id)) throw new Error(`Duplicate beat id: ${beat.id}`);
      ids.add(beat.id);
      if (typeof beat.prompt !== "string") throw new Error(`beats[${index}].prompt must be a string`);
      if (typeof beat.duration_s !== "number" || !Number.isFinite(beat.duration_s) || beat.duration_s <= 0) throw new Error(`beats[${index}].duration_s must be a number greater than 0`);
      if (beat.video !== undefined) {
        const video = beat.video;
        if (!video || typeof video !== "object" || Array.isArray(video)
          || Object.keys(video).some((key) => !["prompt", "last"].includes(key))) {
          throw new Error(`beats[${index}].video must be an object with prompt and last`);
        }
        if (video.prompt !== undefined && typeof video.prompt !== "string") throw new Error(`beats[${index}].video.prompt must be a string`);
        if (video.last !== undefined && video.last !== null) {
          if (video.last === "next" && index === beats.length - 1) throw new Error("The last beat cannot set video.last to next");
          if (typeof video.last !== "string" || (video.last !== "next" && !beats.some((entry) => entry?.id === video.last))) {
            throw new Error(`beats[${index}].video.last does not name a beat`);
          }
        }
      }
      return { ...(beat.video === undefined ? {} : { video: beat.video }), id: beat.id, prompt: beat.prompt, duration_s: beat.duration_s, ...(typeof beat.name === "string" ? { name: beat.name } : {}) };
    }),
  };
}

function sentPrompt(prompt, suffix) {
  return suffix ? `${prompt}\n\n${suffix}` : prompt;
}

function sanitizeEvidenceText(value, projectDir) {
  return String(value)
    .replaceAll(resolve(projectDir), "<WORKTREE>")
    .replaceAll(homedir(), "<HOME>")
    .replaceAll(tmpdir(), "<TMP>");
}

function printPlan(rows, json, log) {
  if (json) {
    log(JSON.stringify({ planned: rows }, null, 2));
    return;
  }
  log("id\tduration_s\tat_frame\toutput\tmode");
  for (const row of rows) log(`${row.id}\t${row.duration_s}\t${row.at}\t${row.path}\t${row.mode}`);
}

export async function runStillCommand(argv, options = {}) {
  const log = options.log ?? ((line) => console.log(line));
  const logError = options.logError ?? ((line) => console.error(line));
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      log(STILL_USAGE);
      return { exitCode: 0 };
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    logError(STILL_USAGE);
    return { exitCode: 2 };
  }

  let spec;
  let edit;
  try {
    spec = await loadSpec(args.spec);
    edit = await (options.readEditForPlan ?? readEditForPlan)(args.projectDir);
  } catch (error) {
    logError(`Could not read the input: ${sanitizeEvidenceText(error instanceof Error ? error.message : String(error), args.projectDir)}`);
    return { exitCode: 2 };
  }
  const fps = Number(edit.output?.fps) || 30;
  let at = endOfTrack(firstVisualTrack(edit));
  const rows = [];
  let preSkipped = 0;
  for (const beat of spec.beats) {
    const frames = Math.round(beat.duration_s * fps);
    const path = `assets/generated/${beat.id}.png`;
    if (hasGeneratedId(edit, beat.id)) {
      logError(`WARN: gen-${beat.id} already exists, leaving it in place`);
      preSkipped += 1;
      continue;
    }
    rows.push({ ...beat, frames, at, path, mode: args.placeholder ? "text card" : "Codex" });
    at += frames;
  }
  if (args.dryRun) {
    printPlan(rows, args.json, log);
    return { exitCode: 0, planned: rows };
  }

  if (rows.length === 0) {
    const summary = { generated: 0, failed: 0, skipped: preSkipped };
    if (args.json) log(JSON.stringify(summary));
    else log(`Done: 0 generated, 0 failed, ${summary.skipped} skipped`);
    return { exitCode: 0, ...summary };
  }

  const now = options.now ?? (() => new Date());
  const asOf = await (options.readCodexModelAsOf ?? readCodexModelAsOf)();
  const writeMetaImpl = options.writeMeta ?? (async (path, value) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  });
  const writtenMetas = new Map();
  const writeMeta = async (path, value) => {
    const checked = validateGenerationMeta(value);
    if (!checked.ok) throw new Error(`Generation meta failed validation:\n- ${checked.errors.join("\n- ")}`);
    await writeMetaImpl(path, value);
    writtenMetas.set(path, value);
  };
  const successful = [];
  let failed = 0;
  if (args.placeholder) {
    const makeCard = options.renderTextCard ?? renderTextCard;
    for (const row of rows) {
      const absolute = join(args.projectDir, row.path);
      const createdAt = now().toISOString();
      const card = await makeCard({
        outPath: absolute,
        id: row.id,
        name: row.name ?? row.prompt,
        prompt: row.prompt,
        logRenderer: (line) => logError(sanitizeEvidenceText(line, args.projectDir)),
      });
      const meta = plannedStillMeta({
        prompt: row.prompt,
        duration_s: row.duration_s,
        at: createdAt,
        asOf,
      });
      meta.provenance.tool = `akari generate still --placeholder (${card.renderer ?? "solid"})`;
      await writeMeta(`${absolute}.meta.json`, meta);
      successful.push(row);
    }
  } else {
    const generate = options.generateImages ?? generateCodexImages;
    const generated = await generate({
      projectDir: args.projectDir,
      parallel: args.parallel,
      items: rows.map((row) => ({ id: row.id, path: row.path, prompt: sentPrompt(row.prompt, spec.styleSuffix) })),
      log: args.json ? logError : log,
      logError,
    });
    for (const row of rows) {
      const result = generated.find((entry) => entry.id === row.id);
      const absolute = join(args.projectDir, row.path);
      const createdAt = now().toISOString();
      const prompt = sentPrompt(row.prompt, spec.styleSuffix);
      if (!result?.ok) {
        const reason = sanitizeEvidenceText(result?.error ?? "Codex image generation returned no result", args.projectDir);
        await writeMeta(`${absolute}.meta.json`, failedStillMeta({ prompt, duration_s: row.duration_s, at: createdAt, asOf, reason }));
        failed += 1;
        continue;
      }
      try {
        const image = await (options.inspectPng ?? inspectPng)(absolute);
        await writeMeta(`${absolute}.meta.json`, doneStillMeta({ prompt, duration_s: row.duration_s, at: createdAt, asOf, path: row.path, image, elapsed_s: result.elapsed_s }));
        successful.push(row);
      } catch (error) {
        const reason = sanitizeEvidenceText(error instanceof Error ? error.message : String(error), args.projectDir);
        await writeMeta(`${absolute}.meta.json`, failedStillMeta({ prompt, duration_s: row.duration_s, at: createdAt, asOf, reason }));
        failed += 1;
      }
    }
  }

  let draftFailed = false;
  // 全ビートの生成後に結ぶ。並列生成の順序に依存せず次の絵を参照できる。
  for (const row of successful) {
    if (!row.video) continue;
    try {
      const lastId = row.video.last === "next"
        ? spec.beats[spec.beats.findIndex((beat) => beat.id === row.id) + 1].id : row.video.last;
      const firstFrame = makeReference(args.projectDir, row.path);
      const lastFrame = lastId ? makeReference(args.projectDir, `assets/generated/${lastId}.png`) : null;
      let modelId = "fal:h3-i2v";
      try {
        const connections = JSON.parse(await readFile(join(args.projectDir, ".akari", "connections.json"), "utf8"));
        modelId = connections?.defaults?.generate?.video ?? modelId;
      } catch { /* 接続未設定なら動画 CLI と同じ既定値。 */ }
      const metaPath = `${join(args.projectDir, row.path)}.meta.json`;
      await writeMeta(metaPath, withNextVideoDraft(writtenMetas.get(metaPath), {
        firstFrame, lastFrame, prompt: row.video.prompt ?? "", modelId, at: now().toISOString(),
      }));
    } catch (error) {
      draftFailed = true;
      logError(`Could not save the video plan (${row.id}): ${sanitizeEvidenceText(error.message, args.projectDir)}`);
    }
  }

  if (successful.length > 0) {
    await (options.insertGeneratedStills ?? insertGeneratedStills)({
      projectDir: args.projectDir,
      beats: successful,
      ...(options.editDependencies ?? {}),
    });
  }
  const summary = { generated: successful.length, failed, skipped: preSkipped + rows.length - successful.length - failed };
  if (args.json) log(JSON.stringify(summary));
  else log(`Done: ${summary.generated} generated, ${summary.failed} failed, ${summary.skipped} skipped`);
  return { exitCode: failed > 0 || draftFailed ? 1 : 0, ...summary };
}
