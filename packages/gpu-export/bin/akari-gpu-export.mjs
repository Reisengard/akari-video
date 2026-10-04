#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveFfprobe } from "../../media-bin/src/index.mjs";
import { enumerateProjectRenderInputs, withRenderMediaReferences } from "../../render-cut/src/render-cut.mjs";
import { loadAndBuildGpuPage } from "../src/page-builder.mjs";
import { exportWithGpu, resolveGpuRuntimeOptions } from "../src/index.mjs";

export const USAGE = `Usage: akari-gpu-export <project-dir> --out <path> --duration <seconds> [options]

  --out <path>             output MP4 path (required)
  --fps <number>           frame rate (default: 30)
  --width <pixels>         output width (default: 1920)
  --height <pixels>        output height (default: 1080)
  --duration <seconds>     output duration (required)
  --frames <count>         output frame count (default: duration x fps)
  --queue-depth <count>    encode queue depth (default: 4)
  --quality <name>         quality preset (default: high)
  --bitrate <bps>          video bitrate
  --audio <path>           source of the audio stream to copy
  --soft                   use the software preference
  --trap-readback          reject pixel readback on the product path
  --verify-frames          enable raw frame hashes for verification
  --help, -h               show this usage

Note: the product path that mixes edit.json audio is render-cut --engine gpu.`;

export class CliArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliArgumentError";
    this.exitCode = 2;
  }
}

export async function runCli(argv = process.argv.slice(2), deps = {}) {
  const io = deps.io ?? console;
  try {
    const options = parse(argv);
    if (options.help) {
      io.log?.(USAGE);
      return 0;
    }
    if (options.audioSourcePath === null) {
      io.error?.("akari-gpu-export: --audio was omitted, so this exports video only (no audio track). Pass --audio <path> to include audio");
    } else {
      const exists = deps.exists ?? existsSync;
      const audioProbe = deps.probeAudioStream ?? probeAudioStream;
      const ffprobeResolver = deps.resolveFfprobe ?? resolveFfprobe;
      const hasAudio = exists(options.audioSourcePath)
        && await audioProbe({ ffprobeCommand: ffprobeResolver({ env: deps.env ?? process.env }), path: options.audioSourcePath });
      if (!hasAudio) {
        io.error?.("akari-gpu-export: --audio <path> has no audio stream. Stopping without a silent track");
        return 2;
      }
    }
    const pageBuilder = deps.loadAndBuildGpuPage ?? loadAndBuildGpuPage;
    const exporter = deps.exportWithGpu ?? exportWithGpu;
    const runtimeOptionsResolver = deps.resolveGpuRuntimeOptions ?? resolveGpuRuntimeOptions;
    const inputsResolver = deps.enumerateProjectRenderInputs ?? enumerateProjectRenderInputs;
    const mediaReferences = deps.withRenderMediaReferences ?? withRenderMediaReferences;
    const projectRoot = resolve(options.projectRoot);
    const built = await pageBuilder({ ...options, projectRoot });
    // 製品経路（render-cut --engine gpu）と同じ宣言済み入力を列挙し、同じ媒体表で子を走らせる。
    // これが無いと、プロジェクト内に実体の無い素材ライブラリ参照（assets/still/<id>/… 等）を
    // 静的サーバーが 404 にし、その層が描かれないまま書き出しが進む。
    const declaredInputs = await inputsResolver({ projectRoot, env: deps.env ?? process.env });
    await mediaReferences(projectRoot, declaredInputs, () => exporter({
      ...options,
      projectRoot,
      ...runtimeOptionsResolver(options),
      eligibility: built.eligibility,
    }));
    return 0;
  } catch (error) {
    if (error instanceof CliArgumentError) {
      io.error?.(`${error.message}\n${USAGE}`);
      return 2;
    }
    io.error?.(String(error?.stack ?? error));
    return 1;
  }
}

export function parse(argv) {
  const result = {
    projectRoot: null,
    out: null,
    audioSourcePath: null,
    fps: 30,
    width: 1920,
    height: 1080,
    duration: null,
    frames: null,
    soft: false,
    queueDepth: 4,
    quality: "high",
    bitrate: undefined,
    trapReadback: false,
    verifyFrames: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      if (index + 1 >= argv.length) throw new CliArgumentError(`${argument} requires a value`);
      return argv[++index];
    };
    if (argument === "--out") result.out = value();
    else if (argument === "--fps") result.fps = positive(value(), "--fps");
    else if (argument === "--width") result.width = positive(value(), "--width");
    else if (argument === "--height") result.height = positive(value(), "--height");
    else if (argument === "--duration") result.duration = positive(value(), "--duration");
    else if (argument === "--frames") result.frames = positive(value(), "--frames");
    else if (argument === "--queue-depth") result.queueDepth = positive(value(), "--queue-depth");
    else if (argument === "--quality") result.quality = value();
    else if (argument === "--bitrate") result.bitrate = positive(value(), "--bitrate");
    else if (argument === "--audio") result.audioSourcePath = value();
    else if (argument === "--soft") result.soft = true;
    else if (argument === "--trap-readback") result.trapReadback = true;
    else if (argument === "--verify-frames") result.verifyFrames = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else if (!argument.startsWith("-") && result.projectRoot === null) result.projectRoot = argument;
    else throw new CliArgumentError(`unknown argument: ${argument}`);
  }
  if (result.help) return result;
  if (!result.projectRoot || !result.out || !(result.duration > 0)) {
    throw new CliArgumentError("project-dir, --out, and --duration are required");
  }
  if (result.frames === null) result.frames = Math.round(result.duration * result.fps);
  return result;
}

export function probeAudioStream({ ffprobeCommand, path }) {
  const result = spawnSync(ffprobeCommand, [
    "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", path,
  ], { encoding: "utf8", windowsHide: true });
  return result.error === undefined && result.status === 0 && result.stdout.trim() !== "";
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new CliArgumentError(`${label} must be a positive number`);
  return number;
}

const invoked = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (invoked) process.exitCode = await runCli();
