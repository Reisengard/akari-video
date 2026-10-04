#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, realpathSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_MANIFEST, VENDOR_ROOT, modelPath } from "../src/model-manifest.mjs";

const MAX_REDIRECTS = 5;

export function downloadModel(url, destination) {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl, redirectsLeft) => {
      const request = https.get(
        currentUrl,
        { headers: { "user-agent": "akari-video-rvm-model-fetch (+https://github.com)" } },
        (response) => {
          const { statusCode } = response;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirectsLeft <= 0) {
              reject(new Error(`too many redirects fetching ${url}`));
              return;
            }
            attempt(new URL(response.headers.location, currentUrl).toString(), redirectsLeft - 1);
            return;
          }
          if (statusCode !== 200) {
            response.resume();
            reject(new Error(`GET ${currentUrl} -> HTTP ${statusCode}`));
            return;
          }
          const file = createWriteStream(destination, { flags: "wx" });
          response.pipe(file);
          file.on("finish", () => file.close((error) => (error ? reject(error) : resolve())));
          file.on("error", reject);
        },
      );
      request.on("error", reject);
    };
    attempt(url, MAX_REDIRECTS);
  });
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function ensureModel(
  model = "mobilenetv3",
  { vendorRoot = VENDOR_ROOT, download = downloadModel, log = () => {} } = {},
) {
  const entry = MODEL_MANIFEST[model];
  if (!entry) throw new Error(`--model must be one of ${Object.keys(MODEL_MANIFEST).join(" / ")}`);
  const destination = modelPath(model, vendorRoot);
  await mkdir(vendorRoot, { recursive: true });

  if (existsSync(destination)) {
    const actual = await sha256File(destination);
    if (actual === entry.sha256) return destination;
    await rm(destination, { force: true });
    throw new Error(
      `sha256 mismatch: ${destination}\n  expected: ${entry.sha256}\n  actual: ${actual}\n` +
        "Deleted an invalid existing model. Stopping the fetch.",
    );
  }

  const partial = `${destination}.partial-${process.pid}-${Date.now()}`;
  try {
    log(`matte-rvm: fetching ${entry.url}`);
    await download(entry.url, partial);
    const actual = await sha256File(partial);
    if (actual !== entry.sha256) {
      throw new Error(
        `sha256 mismatch: ${entry.url}\n  expected: ${entry.sha256}\n  actual: ${actual}\n` +
          "The published file changed, or the download is corrupt. The fetch was stopped.",
      );
    }
    await rename(partial, destination);
    log(`matte-rvm: ${model} -> ${path.relative(VENDOR_ROOT, destination)}`);
    return destination;
  } finally {
    await rm(partial, { force: true });
  }
}

function parseModel(argv) {
  if (argv.length === 0) return "mobilenetv3";
  if (argv.length === 2 && argv[0] === "--model" && argv[1] && !argv[1].startsWith("--")) {
    return argv[1];
  }
  throw new Error("Usage: node scripts/fetch-models.mjs [--model mobilenetv3|resnet50]");
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  ensureModel(parseModel(process.argv.slice(2)), { log: (message) => console.log(message) })
    .then((destination) => console.log(`matte-rvm: done (${destination})`))
    .catch((error) => {
      console.error(`matte-rvm: model fetch failed: ${error.message}`);
      process.exitCode = 1;
    });
}
