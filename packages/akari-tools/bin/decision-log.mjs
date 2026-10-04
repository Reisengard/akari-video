#!/usr/bin/env node
import path from "node:path";
import { isMainModule } from "../src/common/main-module.mjs";
import { settleDecisionLog } from "../src/decision-log/settle.mjs";

const usage = [
  "Usage: akari decision-log <subcommand> <project-dir> [options]", "",
  "  settle              append result rows for prediction rows",
  "  --actor <name>      decision maker (default machine:render-cut)",
  "  --dry-run           print the result JSON without writing",
  "  --json", "  --help",
].join("\n");

export async function runDecisionLogCli(argv, options = {}) {
  const stdout = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = options.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    stdout(usage);
    return 0;
  }
  try {
    const [command, directory, ...rest] = argv;
    if (command !== "settle") throw new Error(`Unknown subcommand: ${command}`);
    if (!directory || directory.startsWith("-")) throw new Error("project-dir is required");
    const parsed = {};
    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      if (arg === "--dry-run") parsed.dryRun = true;
      else if (arg === "--json") continue;
      else if (arg === "--actor") {
        const value = rest[++index];
        if (!value?.trim() || value.startsWith("--")) throw new Error("--actor requires a value");
        parsed.actor = value;
      } else throw new Error(`Unknown option: ${arg}`);
    }
    const projectRoot = path.resolve(options.cwd ?? process.cwd(), directory);
    const result = await settleDecisionLog({ projectRoot, ...parsed });
    stdout(JSON.stringify({ ...result, results: result.results ?? [], path: path.join(projectRoot, "decision-log.md") }));
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exitCode = await runDecisionLogCli(process.argv.slice(2));
