#!/usr/bin/env node
// Budgets live in scripts/english-wording/EN-*.json. A file outside every glob is ignored,
// which is why terms.json can keep Japanese keys. With no budget files, name each file
// whose counted text is non-zero so a fixture can fail on one literal.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'generated', 'evidence',
  '.git', // not source, and the object store makes the walk slow
]);
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
]);
const COUNTED_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.htm', '.md', '.json']);
const LICENSE_DIR = 'apps/shell/resources/scripts/license-texts';
const BEFORE_EXPR = new Set([
  'return', 'case', 'throw', 'typeof', 'void', 'delete', 'await', 'yield',
  'new', 'in', 'of', 'instanceof', 'else', 'do', 'default', 'extends',
]);
// `if (x) /a/` is a regex. `foo(x) / a` is division.
const REGEX_AFTER_PAREN = new Set(['if', 'while', 'for', 'with']);

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function isCounted(code) {
  return (code >= 0x3040 && code <= 0x309f)
    || (code >= 0x30a0 && code <= 0x30ff)
    || (code >= 0xff66 && code <= 0xff9d)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0xf900 && code <= 0xfaff);
}

function countText(source) {
  let count = 0;
  for (let i = 0; i < source.length; i++) {
    if (isCounted(source.charCodeAt(i))) count++;
  }
  return count;
}

function hexAt(source, i, length) {
  let value = 0;
  for (let k = 0; k < length; k++) {
    const code = source.charCodeAt(i + k);
    let digit;
    if (code >= 48 && code <= 57) digit = code - 48;
    else if (code >= 65 && code <= 70) digit = code - 55;
    else if (code >= 97 && code <= 102) digit = code - 87;
    else return -1;
    value = (value << 4) + digit;
  }
  return value;
}

function countEscape(source, i) {
  const end = source.length;
  if (i + 1 >= end) return { i: i + 1, count: 0 };
  const escaped = source.charCodeAt(i + 1);
  if (escaped === 13) {
    const step = i + 2 < end && source.charCodeAt(i + 2) === 10 ? 3 : 2;
    return { i: i + step, count: 0 };
  }
  if (escaped === 10) return { i: i + 2, count: 0 };
  if (escaped === 117) {
    if (source.charCodeAt(i + 2) === 123) {
      let j = i + 3;
      while (j < end && source.charCodeAt(j) !== 125 && j - (i + 3) < 6) j++;
      if (j < end && source.charCodeAt(j) === 125 && j > i + 3) {
        const code = hexAt(source, i + 3, j - (i + 3));
        return { i: j + 1, count: code >= 0 && isCounted(code) ? 1 : 0 };
      }
    }
    if (i + 6 <= end) {
      const code = hexAt(source, i + 2, 4);
      if (code >= 0) return { i: i + 6, count: isCounted(code) ? 1 : 0 };
    }
  }
  if (escaped === 120 && i + 4 <= end) {
    const code = hexAt(source, i + 2, 2);
    if (code >= 0) return { i: i + 4, count: isCounted(code) ? 1 : 0 };
  }
  const produced = escaped === 110 || escaped === 114 || escaped === 116 || escaped === 98
    || escaped === 102 || escaped === 118 || escaped === 48 || escaped === 39
    || escaped === 34 || escaped === 96 || escaped === 92 || escaped === 36
    ? 0
    : (isCounted(escaped) ? 1 : 0);
  return { i: i + 2, count: produced };
}

function readQuoted(source, i, quote) {
  const end = source.length;
  let count = 0;
  i++;
  while (i < end) {
    const code = source.charCodeAt(i);
    if (code === 92) {
      const escaped = countEscape(source, i);
      i = escaped.i;
      count += escaped.count;
      continue;
    }
    if (code === quote) return { i: i + 1, count };
    if (code === 10 || code === 13) return { i, count };
    if (isCounted(code)) count++;
    i++;
  }
  return { i, count };
}

function readRegex(source, i) {
  const end = source.length;
  i++;
  let inClass = false;
  while (i < end) {
    const code = source.charCodeAt(i);
    if (code === 10 || code === 13) return i;
    if (code === 92) {
      i += 2;
      continue;
    }
    if (code === 91) inClass = true;
    else if (code === 93) inClass = false;
    else if (code === 47 && !inClass) {
      i++;
      while (i < end) {
        const flag = source.charCodeAt(i);
        const letter = (flag >= 65 && flag <= 90) || (flag >= 97 && flag <= 122);
        if (!letter) break;
        i++;
      }
      return i;
    }
    i++;
  }
  return i;
}

function readNumber(source, i) {
  const end = source.length;
  const start = source.charCodeAt(i);
  if (start === 48) {
    const base = source.charCodeAt(i + 1);
    if (base === 120 || base === 88 || base === 98 || base === 66 || base === 111 || base === 79) {
      i += 2;
      while (i < end) {
        const code = source.charCodeAt(i);
        const hex = (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102) || code === 95;
        if (!hex) break;
        i++;
      }
      return i;
    }
  }
  while (i < end) {
    const code = source.charCodeAt(i);
    if ((code >= 48 && code <= 57) || code === 95) {
      i++;
      continue;
    }
    break;
  }
  if (source.charCodeAt(i) === 46 && source.charCodeAt(i + 1) >= 48 && source.charCodeAt(i + 1) <= 57) {
    i++;
    while (i < end) {
      const code = source.charCodeAt(i);
      if ((code >= 48 && code <= 57) || code === 95) i++;
      else break;
    }
  }
  const exponent = source.charCodeAt(i);
  if (exponent === 101 || exponent === 69) {
    let j = i + 1;
    if (source.charCodeAt(j) === 43 || source.charCodeAt(j) === 45) j++;
    if (source.charCodeAt(j) >= 48 && source.charCodeAt(j) <= 57) {
      i = j + 1;
      while (i < end) {
        const code = source.charCodeAt(i);
        if ((code >= 48 && code <= 57) || code === 95) i++;
        else break;
      }
    }
  }
  return i;
}

function isIdentStart(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36 || code >= 128;
}

function isIdentPart(code) {
  return isIdentStart(code) || (code >= 48 && code <= 57);
}

function readTemplate(source, i) {
  const end = source.length;
  let count = 0;
  while (i < end) {
    const code = source.charCodeAt(i);
    if (code === 92) {
      const escaped = countEscape(source, i);
      i = escaped.i;
      count += escaped.count;
      continue;
    }
    if (code === 96) return { i: i + 1, count };
    if (code === 36 && source.charCodeAt(i + 1) === 123) {
      const inner = scanJs(source, i + 2, true);
      i = inner.i;
      count += inner.count;
      continue;
    }
    if (isCounted(code)) count++;
    i++;
  }
  return { i, count };
}

function scanJs(source, i, stopBrace) {
  const end = source.length;
  let count = 0;
  let slashIsDivision = false;
  let lastWord = '';
  let lastNonWs = 0;
  const parenStack = [];
  let brace = 0;

  while (i < end) {
    const code = source.charCodeAt(i);
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11) {
      i++;
      continue;
    }
    if (code === 47) {
      const next = source.charCodeAt(i + 1);
      if (next === 47) {
        i += 2;
        while (i < end && source.charCodeAt(i) !== 10 && source.charCodeAt(i) !== 13) i++;
        continue;
      }
      if (next === 42) {
        i += 2;
        while (i < end && !(source.charCodeAt(i) === 42 && source.charCodeAt(i + 1) === 47)) i++;
        i = Math.min(end, i + 2);
        continue;
      }
      // A slash after `<` closes a JSX tag (`</div>`). It is not a regex.
      if (!slashIsDivision && lastNonWs !== 60) {
        i = readRegex(source, i);
        slashIsDivision = true;
        lastWord = '';
        lastNonWs = 47;
        continue;
      }
      i++;
      slashIsDivision = false;
      lastWord = '';
      lastNonWs = 47;
      continue;
    }
    if (code === 39 || code === 34) {
      const quoted = readQuoted(source, i, code);
      i = quoted.i;
      count += quoted.count;
      slashIsDivision = true;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 96) {
      const template = readTemplate(source, i + 1);
      i = template.i;
      count += template.count;
      slashIsDivision = true;
      lastWord = '';
      lastNonWs = 96;
      continue;
    }
    if (code === 123) {
      i++;
      brace++;
      slashIsDivision = false;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 125) {
      if (stopBrace && brace === 0) return { i: i + 1, count };
      i++;
      if (brace > 0) brace--;
      slashIsDivision = true;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (isIdentStart(code)) {
      const start = i;
      i++;
      while (i < end && isIdentPart(source.charCodeAt(i))) i++;
      const word = source.slice(start, i);
      slashIsDivision = !BEFORE_EXPR.has(word);
      lastWord = word;
      lastNonWs = code;
      continue;
    }
    if (code >= 48 && code <= 57) {
      i = readNumber(source, i);
      slashIsDivision = true;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 40) {
      parenStack.push(REGEX_AFTER_PAREN.has(lastWord));
      i++;
      slashIsDivision = false;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 41) {
      const regexAfter = parenStack.length ? parenStack.pop() : false;
      i++;
      slashIsDivision = !regexAfter;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 91) {
      i++;
      slashIsDivision = false;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 93) {
      i++;
      slashIsDivision = true;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if ((code === 43 || code === 45) && source.charCodeAt(i + 1) === code) {
      i += 2;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    if (code === 61 && source.charCodeAt(i + 1) === 62) {
      i += 2;
      slashIsDivision = false;
      lastWord = '';
      lastNonWs = code;
      continue;
    }
    i++;
    slashIsDivision = false;
    lastWord = '';
    lastNonWs = code;
  }
  return { i, count };
}

function countJs(source) {
  let start = 0;
  if (source.startsWith('#!')) {
    while (start < source.length && source.charCodeAt(start) !== 10) start++;
  }
  return scanJs(source, start, false).count;
}

function skipTag(source, i) {
  const end = source.length;
  let quote = 0;
  i++;
  while (i < end) {
    const code = source.charCodeAt(i);
    if (quote) {
      if (code === quote) quote = 0;
      i++;
      continue;
    }
    if (code === 34 || code === 39) {
      quote = code;
      i++;
      continue;
    }
    if (code === 62) return i + 1;
    i++;
  }
  return i;
}

function tagNameAt(source, i) {
  if (source.charCodeAt(i) === 47) i++;
  if (source.charCodeAt(i) === 33) return '';
  const start = i;
  while (i < source.length) {
    const code = source.charCodeAt(i);
    const ok = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || (code >= 48 && code <= 57);
    if (!ok) break;
    i++;
  }
  return source.slice(start, i).toLowerCase();
}

function indexOfClose(source, i, name) {
  const end = source.length;
  const target = `</${name}`;
  while (i < end) {
    if (source.charCodeAt(i) === 60 && source.charCodeAt(i + 1) === 47) {
      const slice = source.slice(i, i + target.length).toLowerCase();
      if (slice === target) {
        const after = source.charCodeAt(i + target.length);
        if (after === 62 || after === 32 || after === 9 || after === 10 || after === 13 || after === 47) return i;
      }
    }
    i++;
  }
  return end;
}

function countHtml(source) {
  const end = source.length;
  let i = 0;
  let count = 0;
  while (i < end) {
    if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4);
      i = close < 0 ? end : close + 3;
      continue;
    }
    if (source.charCodeAt(i) === 60) {
      const name = tagNameAt(source, i + 1);
      const openEnd = skipTag(source, i);
      if (name === 'script' || name === 'style') {
        const selfClose = openEnd >= 2 && source.charCodeAt(openEnd - 2) === 47;
        if (selfClose) {
          i = openEnd;
          continue;
        }
        const closeAt = indexOfClose(source, openEnd, name);
        if (name === 'script') count += countJs(source.slice(openEnd, closeAt));
        i = closeAt;
        if (source.charCodeAt(i) === 60) i = skipTag(source, i);
        continue;
      }
      i = openEnd;
      continue;
    }
    if (isCounted(source.charCodeAt(i))) count++;
    i++;
  }
  return count;
}

function countJsonValue(value) {
  if (typeof value === 'string') return countText(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (const item of value) count += countJsonValue(item);
    return count;
  }
  if (value && typeof value === 'object') {
    let count = 0;
    for (const key of Object.keys(value)) count += countJsonValue(value[key]);
    return count;
  }
  return 0;
}

function countJsonStrings(source) {
  let count = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) !== 34) continue;
    const quoted = readQuoted(source, i, 34);
    count += quoted.count;
    i = quoted.i - 1;
  }
  return count;
}

function countJson(source) {
  try {
    return countJsonValue(JSON.parse(source));
  } catch {
    return countJsonStrings(source);
  }
}

function countFile(root, rel) {
  let text = readFileSync(join(root, rel), 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const ext = extname(rel).toLowerCase();
  if (ext === '.md') return countText(text);
  if (ext === '.json') return countJson(text);
  if (ext === '.html' || ext === '.htm') return countHtml(text);
  return countJs(text);
}

function expandBraces(pattern) {
  const start = pattern.indexOf('{');
  if (start < 0) return [pattern];
  let depth = 0;
  let end = -1;
  for (let i = start; i < pattern.length; i++) {
    const code = pattern[i];
    if (code === '{') depth++;
    else if (code === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [pattern];
  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const body = pattern.slice(start + 1, end);
  const parts = [];
  let current = '';
  depth = 0;
  for (const code of body) {
    if (code === '{') depth++;
    else if (code === '}') depth--;
    if (code === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += code;
  }
  parts.push(current);
  const out = [];
  for (const part of parts) {
    for (const item of expandBraces(prefix + part + suffix)) out.push(item);
  }
  return out;
}

function globToRegExp(glob) {
  let body = '';
  for (let i = 0; i < glob.length; i++) {
    const code = glob[i];
    if (code === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          body += '(?:(?:[^/]+/)*)';
          i += 2;
          continue;
        }
        body += '.*';
        i += 1;
        continue;
      }
      body += '[^/]*';
      continue;
    }
    if (code === '?') {
      body += '[^/]';
      continue;
    }
    const plain = code === '/' || code === '_' || code === '-'
      || (code >= 'a' && code <= 'z') || (code >= 'A' && code <= 'Z') || (code >= '0' && code <= '9');
    body += plain ? code : `\\${code}`;
  }
  return new RegExp(`^${body}$`);
}

function compileGlob(glob) {
  return expandBraces(glob).map(globToRegExp);
}

function idNum(id) {
  return Number(id.slice(3));
}

function budgetError(rel, message) {
  return `${rel}: ${message}`;
}

function loadBudgets(root) {
  const dir = join(root, 'scripts', 'english-wording');
  if (!existsSync(dir)) return { budgets: [], errors: [] };
  const names = readdirSync(dir).filter((name) => /^EN-\d+\.json$/.test(name));
  names.sort((a, b) => idNum(a.slice(0, -5)) - idNum(b.slice(0, -5)));
  const budgets = [];
  const errors = [];
  const seen = new Set();
  for (const name of names) {
    const rel = `scripts/english-wording/${name}`;
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (error) {
      errors.push(budgetError(rel, error.message));
      continue;
    }
    const expected = name.slice(0, -5);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(budgetError(rel, 'expected an object'));
      continue;
    }
    if (raw.id !== expected) {
      errors.push(budgetError(rel, `id must be ${expected}`));
      continue;
    }
    if (seen.has(raw.id)) errors.push(budgetError(rel, `duplicate id ${raw.id}`));
    seen.add(raw.id);
    if (typeof raw.glob !== 'string' || raw.glob.length === 0) {
      errors.push(budgetError(rel, 'glob must be a non-empty string'));
      continue;
    }
    if (!Number.isInteger(raw.max) || raw.max < 0) {
      errors.push(budgetError(rel, 'max must be a non-negative integer'));
      continue;
    }
    let exclude = [];
    if (raw.exclude !== undefined) {
      if (!Array.isArray(raw.exclude) || raw.exclude.some((item) => typeof item !== 'string' || item.length === 0)) {
        errors.push(budgetError(rel, 'exclude must be an array of non-empty strings'));
        continue;
      }
      exclude = raw.exclude;
    }
    budgets.push({
      id: raw.id,
      max: raw.max,
      patterns: compileGlob(raw.glob),
      exclude: exclude.flatMap(compileGlob),
    });
  }
  return { budgets, errors };
}

function skippedPath(rel, name) {
  if (LOCKFILES.has(name)) return true;
  if (rel.endsWith('.ja.md')) return true;
  if (rel === LICENSE_DIR || rel.startsWith(`${LICENSE_DIR}/`)) return true;
  return !COUNTED_EXT.has(extname(name).toLowerCase());
}

function walk(root, visit) {
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? join(root, rel) : root;
    const entries = readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (child === LICENSE_DIR || child.startsWith(`${LICENSE_DIR}/`)) continue;
        stack.push(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (skippedPath(child, entry.name)) continue;
      visit(child);
    }
  }
}

function matches(regexes, rel) {
  for (const regex of regexes) {
    if (regex.test(rel)) return true;
  }
  return false;
}

function main() {
  const root = process.argv[2] ? resolve(process.argv[2]) : defaultRoot;
  if (!existsSync(root)) {
    console.log(`missing root ${root}`);
    process.exitCode = 1;
    return;
  }
  const { budgets, errors } = loadBudgets(root);
  if (errors.length) {
    for (const error of errors) console.log(error);
    process.exitCode = 1;
    return;
  }
  if (budgets.length === 0) {
    const hits = [];
    walk(root, (rel) => {
      if (countFile(root, rel) > 0) hits.push(rel);
    });
    if (hits.length === 0) {
      console.log('english-wording ok');
      return;
    }
    hits.sort();
    for (const hit of hits) console.log(hit);
    process.exitCode = 1;
    return;
  }

  const totals = new Map(budgets.map((budget) => [budget.id, 0]));
  const overlaps = [];
  walk(root, (rel) => {
    const matched = [];
    for (const budget of budgets) {
      if (matches(budget.exclude, rel)) continue;
      if (matches(budget.patterns, rel)) matched.push(budget);
    }
    if (matched.length > 1) {
      const ids = matched.map((budget) => budget.id).sort((a, b) => idNum(a) - idNum(b));
      overlaps.push(`${ids.join(' ')} ${rel}`);
      return;
    }
    if (matched.length === 0) return;
    const count = countFile(root, rel);
    totals.set(matched[0].id, totals.get(matched[0].id) + count);
  });
  if (overlaps.length) {
    overlaps.sort();
    for (const overlap of overlaps) console.log(overlap);
    process.exitCode = 1;
    return;
  }
  const overs = [];
  for (const budget of budgets) {
    const count = totals.get(budget.id);
    if (count > budget.max) overs.push(`${budget.id} ${count} > ${budget.max}`);
  }
  if (overs.length) {
    for (const over of overs) console.log(over);
    process.exitCode = 1;
    return;
  }
  console.log('english-wording ok');
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) main();
