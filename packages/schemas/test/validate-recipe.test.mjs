import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(packageRoot, "bin", "validate-recipe.mjs");
const fixtureRoot = join(packageRoot, "fixtures", "recipe");
const exampleRoot = join(packageRoot, "examples", "recipe-v0-sample");

function run(fixture) {
  return spawnSync(process.execPath, [cliPath, join(fixtureRoot, fixture, "recipe.json")], {
    encoding: "utf8",
  });
}

test("example recipe-v0-sample passes", () => {
  const executed = spawnSync(
    process.execPath,
    [cliPath, join(exampleRoot, "product-demo-quick-cuts.json")],
    { encoding: "utf8" },
  );
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("valid recipe passes without findings", () => {
  const executed = run("valid");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("unknown top-level and confirmed fields still pass when provenance still matches (tolerant reader)", () => {
  const executed = run("valid-unknown-fields");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("missing version fails", () => {
  const executed = run("invalid-missing-version");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /version is required/);
});

test("newer recipe.json version stops honestly", () => {
  const executed = run("unsupported-version");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /This file uses a newer format\. Update the skills or the app\./);
});

test("empty confirmed fails (nothing confirmed means no reason to freeze)", () => {
  const executed = run("invalid-empty-confirmed");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /confirmed must have at least 1 confirmed field/);
});

test("unknown aspect value fails", () => {
  const executed = run("invalid-bad-aspect");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /confirmed\.aspect must be one of 16:9 \/ 9:16 \/ 1:1/);
});

test("unknown workflow value fails", () => {
  const executed = run("invalid-bad-workflow");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /workflow must be one of edit \/ research/);
});

test("path-like source_project fails", () => {
  const executed = run("invalid-source-project-path");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /source_project must be a "project name \+ date" name, not a path/);
});

test("confirmed/provenance key mismatch fails in both directions", () => {
  const executed = run("invalid-provenance-mismatch");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /provenance\.bgm_profile is missing/);
  assert.match(executed.stderr, /provenance\.caption_style_ref has no matching confirmed\.caption_style_ref/);
});

test("non-kebab-case name fails", () => {
  const executed = run("invalid-bad-name-casing");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /name must be a non-empty kebab-case/);
});

test("unknown confirmed_by value fails", () => {
  const executed = run("invalid-bad-confirmed-by");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /confirmed_by must be one of intake \/ structure-confirm \/ edit-approval \/ render-approval/);
});

test("empty narration object fails", () => {
  const executed = run("invalid-empty-narration");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /confirmed\.narration must have at least one of engine or voice/);
});

test("duplicate overlay_kinds entry fails", () => {
  const executed = run("invalid-duplicate-overlay-kind");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /confirmed\.overlay_kinds has a duplicate value: telop/);
});
