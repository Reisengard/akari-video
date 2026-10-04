import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(packageRoot, "bin", "validate-interpretation.mjs");
const fixtureRoot = join(packageRoot, "test", "fixtures", "interpretation");

function run(caseName) {
  return spawnSync(process.execPath, [cliPath, join(fixtureRoot, caseName, "interpretation.json")], {
    encoding: "utf8",
  });
}

test("valid multi-asset interpretation.json passes", () => {
  const executed = run("valid");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("newer interpretation.json version stops honestly", () => {
  const executed = run("unsupported-version");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /uses a newer format\. Update the skill \/ app/);
});

test("missing arc[].evidence fails (evidence required for arc, per 司令塔裁定 8)", () => {
  const executed = run("invalid-missing-required-field");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /arc\[0\]\.evidence is required/);
});

test("dogfood-style underscore field is rejected at the root (裁定 7, additionalProperties: false)", () => {
  const executed = run("invalid-unknown-root-field");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /root\._dogfood_note is an unknown field/);
});

test("flags[].type outside the enum fails (裁定 1)", () => {
  const executed = run("invalid-flag-bad-type");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /assets\[0\]\.flags\[0\]\.type must be one of orphan \/ unclear \/ trouble_overlap/,
  );
});

test("flags[].evidence is required (裁定 1, 8)", () => {
  const executed = run("invalid-flag-missing-evidence");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /assets\[0\]\.flags\[0\]\.evidence is required/);
});

test("open_questions[].answer is required when status is answered (裁定 5)", () => {
  const executed = run("invalid-open-question-answered-without-answer");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /open_questions\[0\]\.answer is required when status is answered/);
});

test("open_questions[].answer must be omitted (not present) when status is open (裁定 2, 5)", () => {
  const executed = run("invalid-open-question-answer-present-when-open");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /open_questions\[1\]\.answer must be omitted when status is open \(do not set it to null\)/,
  );
});

test("arc[].refs requires at least one entry (裁定 8)", () => {
  const executed = run("invalid-arc-empty-refs");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /arc\[0\]\.refs must be an array of at least 1 item/);
});

test("arc[].refs[].asset must reference an existing assets[].ref", () => {
  const executed = run("invalid-dangling-arc-ref");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /arc\[0\]\.refs\[0\]\.asset does not reference assets\[\]\.ref: asset-does-not-exist/,
  );
});

test("inputs.analyses[].ref is required (2026-07-22 A3.2 swap 実証を受けた FK 化)", () => {
  const executed = run("invalid-analyses-missing-ref");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /inputs\.analyses\[0\]\.ref is required/);
});

test("inputs.analyses[].ref must correspond 1:1 with assets[].ref (no shortfall/surplus on either side)", () => {
  const executed = run("invalid-analyses-ref-mismatch");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /inputs\.analyses\[\]\.ref does not exist in assets\[\]\.ref: broll-park-typo/,
  );
  assert.match(
    executed.stderr,
    /No inputs\.analyses\[\]\.ref corresponds to assets\[\]\.ref: broll-park/,
  );
});

test("duplicate assets[].ref is rejected", () => {
  const executed = run("invalid-duplicate-asset-ref");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /assets\[\]\.ref is duplicated: interview-a/);
});

test("relations[].target must reference an existing assets[].ref", () => {
  const executed = run("invalid-relations-dangling-target");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /assets\[0\]\.relations\[0\]\.target does not reference assets\[\]\.ref: asset-does-not-exist/,
  );
});

test("relations[].target cannot self-reference its own asset", () => {
  const executed = run("invalid-relations-self-reference");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /assets\[0\]\.relations\[0\]\.target refers back to its own asset: interview-a/,
  );
});

test("optional context.intake must be omitted, not null (裁定 2)", () => {
  const executed = run("invalid-context-null-intake");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /inputs\.context\.intake must be an object \(optional; do not set it to null\)/,
  );
});

test("context.interview key is required whenever context is present (裁定 9)", () => {
  const executed = run("invalid-context-missing-interview");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /inputs\.context\.interview is required/);
});

test("sections[] start/end must both be present or both be omitted", () => {
  const executed = run("invalid-section-mismatched-start-end");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /assets\[0\]\.sections\[0\] must specify both start and end, or omit both/,
  );
});

test("sections[] end must be greater than start", () => {
  const executed = run("invalid-section-end-before-start");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /assets\[0\]\.sections\[0\] must satisfy end > start/);
});

test("missing input file fails with a clear message", () => {
  const executed = spawnSync(
    process.execPath,
    [cliPath, join(fixtureRoot, "does-not-exist", "interpretation.json")],
    { encoding: "utf8" },
  );
  assert.equal(executed.status, 1, executed.stdout);
  assert.match(executed.stderr, /interpretation\.json was not found/);
});
