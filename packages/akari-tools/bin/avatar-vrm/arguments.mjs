import { resolve } from "node:path";

const POSITIONS = new Set(["right-bottom", "left-bottom", "right-top", "left-top", "center"]);
const FRAMINGS = new Set(["bust", "full"]);

function positiveNumber(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${option} must be a positive number`);
  return number;
}

function positiveInteger(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${option} must be a positive integer`);
  return number;
}

function unitNumber(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${option} must be from 0 to 1 inclusive`);
  }
  return number;
}

export function isPosition(value) {
  return POSITIONS.has(value)
    || /^\s*-?(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*-?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(value);
}

export function parseArguments(argv) {
  const options = {
    model: null,
    drive: null,
    out: null,
    project: null,
    framing: "bust",
    scale: 1,
    position: "right-bottom",
    outputWidth: 1920,
    outputHeight: 1080,
    layerId: "avatar-vrm-0",
    idle: true,
    idleIntensity: 0.35,
    idleSeed: null,
    headSource: "both",
    springbone: "on",
    apply: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--check") { options.check = true; continue; }
    if (arg === "--no-idle") { options.idle = false; continue; }
    if (!arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--model") options.model = resolve(value);
    else if (arg === "--drive") options.drive = resolve(value);
    else if (arg === "--out") options.out = resolve(value);
    else if (arg === "--project") options.project = resolve(value);
    else if (arg === "--framing") options.framing = value;
    else if (arg === "--scale") options.scale = positiveNumber(value, arg);
    else if (arg === "--position") options.position = value;
    else if (arg === "--output-width") options.outputWidth = positiveInteger(value, arg);
    else if (arg === "--output-height") options.outputHeight = positiveInteger(value, arg);
    else if (arg === "--layer-id") options.layerId = value;
    else if (arg === "--idle-intensity") options.idleIntensity = unitNumber(value, arg);
    else if (arg === "--idle-seed") options.idleSeed = value;
    else if (arg === "--head-source") options.headSource = value;
    else if (arg === "--springbone") options.springbone = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!FRAMINGS.has(options.framing)) throw new Error(`--framing is invalid: ${options.framing}`);
  if (!isPosition(options.position)) throw new Error(`--position is invalid: ${options.position}`);
  if (!/^[-A-Za-z0-9_.]+$/.test(options.layerId)) throw new Error("--layer-id contains characters that are not allowed");
  if (options.idleSeed !== null && options.idleSeed.length === 0) throw new Error("--idle-seed must not be empty");
  if (!new Set(["track", "idle", "both"]).has(options.headSource)) throw new Error(`--head-source is invalid: ${options.headSource}`);
  if (!new Set(["on", "off"]).has(options.springbone)) throw new Error(`--springbone is invalid: ${options.springbone}`);
  if (options.apply && !options.project) throw new Error("--apply requires --project <dir>");
  return options;
}
