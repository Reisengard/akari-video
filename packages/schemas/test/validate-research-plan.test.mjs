import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(packageRoot, "bin", "validate-research-plan.mjs");
const fixtureRoot = join(packageRoot, "test", "fixtures", "research-plan");

function run(fixture) {
  return spawnSync(process.execPath, [cliPath, join(fixtureRoot, fixture, "research-plan.json")], {
    encoding: "utf8",
  });
}

test("valid research-plan passes without findings", () => {
  const executed = run("valid");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
  assert.equal(executed.stderr.trim(), "");
});

test("legacy research-plan without shot ids stays valid", () => {
  const executed = run("valid-legacy-without-shot-ids");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("storyboard fields including two cutaways and camera hints are valid", () => {
  const executed = run("valid-visual-storyboard");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /^OK: /);
});

test("newer research-plan.json version stops honestly", () => {
  const executed = run("unsupported-version");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /This file uses a newer format\. Update the skills or the app\./);
});

test("empty sources warns without failing (byDefault-style advisory, not a hard stop)", () => {
  const executed = run("warns-empty-sources");
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stderr, /sources is empty/);
  assert.match(executed.stdout, /warnings\)/);
});

test("duplicate candidate ids fail", () => {
  const executed = run("invalid-duplicate-candidate-id");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /topic\.candidates\[\]\.id is duplicated: idea-ramen-broth/);
});

test("missing required shot field fails", () => {
  const executed = run("invalid-missing-required-field");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /structure\.shots\[0\]\.description is required/);
});

test("unknown candidate category fails", () => {
  const executed = run("invalid-bad-category-enum");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /category must be one of hub \/ hero \/ help/);
});

test("topic.selected referencing a missing candidate fails", () => {
  const executed = run("invalid-selected-missing-candidate");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /topic\.selected does not reference a topic\.candidates\[\]\.id: idea-not-exists/,
  );
});

test("selected without decided_at fails (decision-cards commit time must be recorded)", () => {
  const executed = run("invalid-decided-at-mismatch");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /topic\.decided_at is null/);
});

test("empty japan_sns notes fails (required research axis)", () => {
  const executed = run("invalid-japan-sns-notes-empty");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /target\.japan_sns\.notes must be a non-empty string/);
});

test("shot referencing a missing chapter fails", () => {
  const executed = run("invalid-dangling-chapter-ref");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /structure\.shots\[0\]\.chapter_id does not reference a structure\.chapters\[\]\.id: ch-nope/,
  );
});

test("nested cutaway fails because v1 supports one level only", () => {
  const executed = run("invalid-nested-cutaway");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /cutaways are one level only/);
});

test("structure.confirmed true without confirmed_at fails", () => {
  const executed = run("invalid-structure-confirmed-mismatch");
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /structure\.confirmed_at is null/);
});

test("shot_list referencing a missing shot fails", () => {
  const executed = run("invalid-dangling-shot-list-ref");
  assert.equal(executed.status, 1);
  assert.match(
    executed.stderr,
    /shot_list\[0\]\.ref_shot_id does not reference a structure\.shots\[\]\.id: sh-nope/,
  );
});
