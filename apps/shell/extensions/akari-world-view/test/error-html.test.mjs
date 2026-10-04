import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { errorHtml } = require('../lib/common/error-html.js');

test('errorHtml escapes tag delimiters', () => {
  assert.match(errorHtml('<b>broken</b>'), /&lt;b&gt;broken&lt;\/b&gt;/);
});

test('errorHtml escapes ampersands and quotes', () => {
  assert.match(errorHtml('a & "b"'), /a &amp; &quot;b&quot;/);
});

test('errorHtml contains no executable script element', () => {
  assert.doesNotMatch(errorHtml('<script>alert(1)</script>'), /<script/i);
});

test('errorHtml returns a complete static document for empty text', () => {
  assert.match(errorHtml(''), /^<!doctype html>[\s\S]*<pre><\/pre><\/html>$/);
});
