import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(packageRoot, "bin", "validate-review.mjs");
const fixtureRoot = join(packageRoot, "fixtures", "review");
const sampleRoot = join(packageRoot, "examples", "review-v1-sample");

function run(fixture) {
  return spawnSync(process.execPath, [cliPath, join(fixtureRoot, fixture, "review.json")], {
    encoding: "utf8",
  });
}

test("valid review.json (video + doc: + image: targets) passes", () => {
  const executed = run("valid");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("example review-v1-sample still passes (regression, contract-2026-07-15 v0)", () => {
  const executed = spawnSync(process.execPath, [cliPath, join(sampleRoot, "review.json")], {
    encoding: "utf8",
  });
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("sourceT: null on a video-face annotation (no doc:/image: target) fails", () => {
  const executed = run("invalid-video-null-sourcet");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /sourceT may be null only when target is doc: \/ image: \/ canvas:/);
});

test("doc: target without #block-id fails", () => {
  const executed = run("invalid-malformed-doc-target");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /target must be in the form doc:<project-relative-path>#<block-id>/);
});

test("image: target without a path fails", () => {
  const executed = run("invalid-malformed-image-target");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /target must be in the form image:<project-relative-path>/);
});

test("strokes: content-rect (frame + sessionRef) and image-rect (frame omitted) both pass", () => {
  const executed = run("valid-strokes");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("strokes with an unrecognized space value fails", () => {
  const executed = run("invalid-strokes-bad-space");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /\.space must be one of content-rect \/ image-rect \/ canvas-rect/);
});

test("image-rect strokes with a frame present fails (frame is a content-rect-only field)", () => {
  const executed = run("invalid-strokes-image-rect-with-frame");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /must be omitted for image-rect/);
});

test("canvas: target with canvas-rect strokes (frame omitted, canvasRef optional) passes (contract-2026-07-26-canvas-surface §4)", () => {
  const executed = run("valid-canvas-target");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("canvas: target without a valid c-NNNN id fails", () => {
  const executed = run("invalid-malformed-canvas-target");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /target must be in the form canvas:<c-NNNN>/);
});

test("canvas-rect strokes with a frame present fails (frame is a content-rect-only field)", () => {
  const executed = run("invalid-strokes-canvas-rect-with-frame");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /must be omitted for canvas-rect/);
});

test("input: \"session\" passes (rider r1 — review セッション契約 §6 で昇格済みの enum を回収)", () => {
  const executed = run("valid-input-session");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("open / addressed / resolved lifecycle statuses all pass", () => {
  const executed = run("valid-status-lifecycle");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("unknown annotation input fails", () => {
  const executed = run("invalid-input-unknown");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /typed \/ voice \/ session/);
});

test("unknown annotation status fails", () => {
  const executed = run("invalid-status-unknown");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /open \/ addressed \/ resolved/);
});

test("rider r1 regression: skills/address-review dev-fixture (2 pre-existing input:\"session\" records) now passes", () => {
  const fixturePath = join(
    packageRoot, "..", "..", "skills", "address-review", "dev-fixtures", "fixture-project", "review.json",
  );
  const executed = spawnSync(process.execPath, [cliPath, fixturePath], { encoding: "utf8" });
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});
