import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const checker = path.join(repoRoot, 'scripts', 'check-english-wording.mjs');

function run(root) {
  return spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
}

function tree(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'en-wording-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(root, rel, text) {
  const abs = path.join(root, ...rel.split('/'));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

function assertOk(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.replace(/\r\n/g, '\n'), 'english-wording ok\n');
}

function assertHit(result, pattern) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, pattern);
  assert.equal(result.stdout.includes('english-wording ok'), false);
}

test('a halfwidth katakana literal fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'half.js', 'const label = "ｱ";\n');
  assertHit(run(root), /^half\.js$/m);
});

test('a kana string literal fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'literal.js', 'const label = "あ";\n');
  assertHit(run(root), /^literal\.js$/m);
});

test('kana only in a line comment passes', (t) => {
  const root = tree(t);
  write(root, 'comment.js', 'const label = "ok"; // あ\n');
  assertOk(run(root));
});

test('notes.ja.md is ignored', (t) => {
  const root = tree(t);
  write(root, 'notes.ja.md', 'これは日本語のノート\n');
  assertOk(run(root));
});

test('kana in guide.md fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'guide.md', 'これはガイド\n');
  assertHit(run(root), /^guide\.md$/m);
});

test('a kanji-only literal 地図 fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'kanji.js', 'const label = "地図";\n');
  assertHit(run(root), /^kanji\.js$/m);
});

test('an HTML text node fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'page.html', '<p>あ</p>\n');
  assertHit(run(root), /^page\.html$/m);
});

test('a budget max below the live count names the budget id', (t) => {
  const root = tree(t);
  write(root, 'scripts/english-wording/EN-7.json', `${JSON.stringify({
    id: 'EN-7',
    glob: '**/*.js',
    max: 0,
  }, null, 2)}\n`);
  write(root, 'app.js', 'const label = "あ";\n');
  const result = run(root);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^EN-7 /m);
  assert.equal(result.stdout.includes('english-wording ok'), false);
});

test('kana under evidence/ passes', (t) => {
  const root = tree(t);
  write(root, 'evidence/note.js', 'const label = "あ";\n');
  assertOk(run(root));
});

test('a string nested in a template counts', (t) => {
  const root = tree(t);
  write(root, 'nested.js', 'const label = `ok ${"あ"}`;\n');
  assertHit(run(root), /^nested\.js$/m);
});

test('kana only inside a regex literal passes', (t) => {
  const root = tree(t);
  write(root, 're.js', 'const pattern = /["あ"]/;\n');
  assertOk(run(root));
});

test('a json value counts and a json key does not', (t) => {
  const root = tree(t);
  write(root, 'keys.json', '{"地図": "Map"}\n');
  assertOk(run(root));
  write(root, 'values.json', '{"label": "地図"}\n');
  assertHit(run(root), /^values\.json$/m);
});

test('an HTML comment is ignored and a script string counts', (t) => {
  const root = tree(t);
  write(root, 'comment.html', '<!-- あ --><script>// い\nconst label = "ok";</script>\n');
  assertOk(run(root));
  write(root, 'script.html', '<script>const label = "あ";</script>\n');
  assertHit(run(root), /^script\.html$/m);
});

test('two budgets on one file name both ids', (t) => {
  const root = tree(t);
  const budget = (id, glob) => `${JSON.stringify({ id, glob, max: 0 }, null, 2)}\n`;
  write(root, 'scripts/english-wording/EN-4.json', budget('EN-4', '**/*.js'));
  write(root, 'scripts/english-wording/EN-12.json', budget('EN-12', 'app.js'));
  write(root, 'app.js', 'const label = "ok";\n');
  const result = run(root);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^EN-4 EN-12 app\.js$/m);
});

test('a decoded unicode escape counts', (t) => {
  const root = tree(t);
  write(root, 'escape.js', 'const label = "\\u5730\\u56f3";\n');
  assertHit(run(root), /^escape\.js$/m);
});

test('a string after a JSX close tag counts', (t) => {
  const root = tree(t);
  write(root, 'view.tsx', 'const view = <span>ok</span>; const label = "あ";\n');
  assertHit(run(root), /^view\.tsx$/m);
});

test('kana only inside a regex after if passes', (t) => {
  const root = tree(t);
  write(root, 're.js', 'if (ok) /["あ"]/.test(value);\n');
  assertOk(run(root));
});

test('kana outside a budget glob passes', (t) => {
  const root = tree(t);
  write(root, 'scripts/english-wording/EN-9.json', `${JSON.stringify({
    id: 'EN-9',
    glob: 'docs/**/*.md',
    max: 0,
  }, null, 2)}\n`);
  write(root, 'app.js', 'const label = "あ";\n');
  assertOk(run(root));
});

test('JSX text fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'text.tsx', 'const view = <span>あ</span>;\n');
  assertHit(run(root), /^text\.tsx$/m);
});

test('a JSX attribute string fails and names the file', (t) => {
  const root = tree(t);
  write(root, 'attr.tsx', 'const view = <span title="あ" />;\n');
  assertHit(run(root), /^attr\.tsx$/m);
});

test('a comparison is not JSX', (t) => {
  const root = tree(t);
  write(root, 'cmp.tsx', 'const n = a < b; // あ\n');
  assertOk(run(root));
});

test('a generic is not JSX and a later string counts', (t) => {
  const root = tree(t);
  write(root, 'generic.tsx', 'const xs: Array<string> = []; const label = "あ";\n');
  assertHit(run(root), /^generic\.tsx$/m);
});

test('a typescript generic arrow is not JSX', (t) => {
  const root = tree(t);
  write(root, 'clone.ts', 'const clone = <T>(value: T): T => value; // あ\n');
  assertOk(run(root));
});

test('an optional type argument is not JSX', (t) => {
  const root = tree(t);
  write(root, 'row.ts', 'const row = target?.closest?.<HTMLElement>(selector); // あ\n');
  assertOk(run(root));
});
