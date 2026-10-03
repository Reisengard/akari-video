#!/usr/bin/env node
// Rebuild the English and Japanese generation-model guides from packages/schemas/gen-models.json.
// Replace only the text between the marker comments. With --check, report drift and write nothing.
// Japanese labels live in docs/guides/generation-models.ja.md. This script is an English wording
// budget, so those labels cannot be string literals here.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCK_START = '<!-- BEGIN GENERATED generation-models';
export const BEGIN = '<!-- BEGIN GENERATED generation-models. scripts/gen-generation-models-doc.mjs generates this block. Do not edit it by hand. -->';
export const END = '<!-- END GENERATED generation-models -->';
const WORDS_START = '<!-- BEGIN generation-model-words';
const WORDS_END = 'END generation-model-words -->';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const markerPattern = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(END)}`);
const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const list = (values, empty) => values === null ? empty : values.join(', ');
const number = (value) => String(value);
// A Windows checkout rewrites the working copy as CRLF. That is not drift.
const lf = (text) => text.replace(/\r\n/g, '\n');

const JA_STRING_KEYS = [
  'videoHeading', 'imageHeading', 'format', 'default', 'noDefault', 'integer', 'string',
  'stringSuffix', 'stringAuto', 'resolutions', 'aspects', 'notSpecified', 'audioTrue',
  'audioAlways', 'audioFalse', 'yes', 'no', 'audioMultiplier', 'calibrationUnit',
  'calibrationSeparator', 'rangeDash', 'rangeOpen', 'rangeClose'
];

const englishWords = {
  videoHeading: 'Video models', imageHeading: 'Image models',
  videoHeaders: ['id', 'family', 'provider', 'First frame', 'Last frame', 'Reference images max', 'Reference videos max', 'Reference audio max', 'Duration', 'Resolution', 'Audio output', 'seed', 'Price', 'as_of', 'verified', 'Calibration'],
  imageHeaders: ['id', 'family', 'provider', 'Reference images max', 'Resolution', 'Price', 'as_of', 'verified'],
  format: 'format', default: 'default', noDefault: 'no default', integer: 'integer', string: 'string', stringSuffix: 'string (8s format)', stringAuto: 'string (auto allowed)',
  resolutions: 'resolutions', aspects: 'aspects', notSpecified: 'not specified',
  audioTrue: 'switchable', audioAlways: 'always included', audioFalse: 'none', yes: 'yes', no: 'no',
  units: { usd_per_second: '$/second', usd_per_image: '$/image', usd_per_clip: '$/clip' },
  audioMultiplier: 'audio', calibrationUnits: ['entry', 'entries'], calibrationSeparator: ', ',
  rangeDash: '-', rangeOpen: ' (step ', rangeClose: ')'
};

const needString = (words, key) => {
  if (typeof words[key] !== 'string' || words[key].length === 0) {
    throw new Error(`Japanese generation-model words missing ${key}`);
  }
};

const loadJaWords = (markdown) => {
  const start = markdown.indexOf(WORDS_START);
  const end = markdown.indexOf(WORDS_END);
  if (start < 0 || end < start) throw new Error('Japanese generation-model words are missing');
  let words;
  try {
    words = JSON.parse(markdown.slice(start + WORDS_START.length, end).trim());
  } catch (error) {
    throw new Error(`Japanese generation-model words are not JSON: ${error.message}`);
  }
  if (!words || typeof words !== 'object' || Array.isArray(words)) {
    throw new Error('Japanese generation-model words must be an object');
  }
  for (const key of JA_STRING_KEYS) needString(words, key);
  for (const key of ['videoHeaders', 'imageHeaders']) {
    if (!Array.isArray(words[key]) || words[key].some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new Error(`Japanese generation-model words missing ${key}`);
    }
  }
  const units = words.units;
  if (!units || typeof units !== 'object' || Array.isArray(units)) {
    throw new Error('Japanese generation-model words missing units');
  }
  for (const key of ['usd_per_second', 'usd_per_image', 'usd_per_clip']) {
    if (typeof units[key] !== 'string' || units[key].length === 0) {
      throw new Error(`Japanese generation-model words missing units.${key}`);
    }
  }
  return words;
};

const wordsFor = (current, locale) => {
  if (locale === 'en') return englishWords;
  if (locale === 'ja') return loadJaWords(current);
  throw new Error(`unsupported locale: ${locale}`);
};

const frame = (value) => ({ required: '○', optional: '△', none: '−' })[value];
const referenceMax = (reference) => reference.max === null ? '?' : number(reference.max);

const durationFormat = (format, w) => {
  if (format.type === 'integer') return w.integer;
  if (format.suffix === 's') return w.stringSuffix;
  if (format.auto === true) return w.stringAuto;
  return w.string;
};

const duration = (value, w) => {
  const range = value.kind === 'enum'
    ? value.values.map(number).join('/')
    : `${number(value.min)}${w.rangeDash}${number(value.max)}${w.rangeOpen}${number(value.step)}${w.rangeClose}`;
  const defaultValue = value.default === null ? w.noDefault : `${w.default}: ${number(value.default)}`;
  return `${range}; ${w.format}: ${durationFormat(value.format, w)}; ${defaultValue}`;
};

const resolution = (model, w) => {
  const resolutions = list(model.resolutions, w.notSpecified);
  const aspects = list(model.aspects, w.notSpecified);
  return `${w.resolutions}: ${resolutions}; ${w.aspects}: ${aspects}`;
};

const price = (value, w) => {
  if (value === null) return '—';
  const unit = w.units[value.unit];
  const amounts = Object.entries(value.by_resolution).map(([resolutionName, amount]) =>
    resolutionName === '' ? `${number(amount)} ${unit}` : `${resolutionName}: ${number(amount)} ${unit}`
  );
  if (value.audio_multiplier !== null) amounts.push(`${w.audioMultiplier} ×${number(value.audio_multiplier)}`);
  return amounts.join('; ');
};

const calibration = (values, w) => {
  const unit = w.calibrationUnits ? w.calibrationUnits[values.length === 1 ? 0 : 1] : w.calibrationUnit;
  const label = `${values.length} ${unit}`;
  return values.length === 0 ? label : `${label}: ${values.join(w.calibrationSeparator)}`;
};

const markdownTable = (headers, rows) => [
  `| ${headers.map(cell).join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)
].join('\n');

export const buildGeneratedBlock = (models, w) => {
  const videos = models.filter((model) => model.kind === 'video').map((model) => [
    model.id,
    model.family,
    model.provider,
    frame(model.inputs.first_frame),
    frame(model.inputs.last_frame),
    referenceMax(model.inputs.reference_images),
    referenceMax(model.inputs.reference_videos),
    referenceMax(model.inputs.reference_audios),
    duration(model.duration, w),
    resolution(model, w),
    model.audio_out === 'always' ? w.audioAlways : model.audio_out ? w.audioTrue : w.audioFalse,
    model.seed ? w.yes : w.no,
    price(model.price, w),
    model.as_of,
    model.verified,
    calibration(model.calibration, w)
  ]);
  const images = models.filter((model) => model.kind === 'image').map((model) => [
    model.id,
    model.family,
    model.provider,
    referenceMax(model.inputs.reference_images),
    resolution(model, w),
    price(model.price, w),
    model.as_of,
    model.verified
  ]);
  return [
    BEGIN,
    '',
    `## ${w.videoHeading}`,
    '',
    markdownTable(w.videoHeaders, videos),
    '',
    `## ${w.imageHeading}`,
    '',
    markdownTable(w.imageHeaders, images),
    '',
    END
  ].join('\n');
};

export const renderDocument = (current, models, locale) => {
  if (!markerPattern.test(current)) throw new Error('generation-models markers not found');
  return `${current.replace(markerPattern, buildGeneratedBlock(models, wordsFor(current, locale))).replace(/\n*$/, '')}\n`;
};

const fail = (msg) => { console.error(`gen-generation-models-doc: ${msg}`); process.exit(1); };

const main = () => {
  try {
    const catalog = JSON.parse(readFileSync(join(root, 'packages/schemas/gen-models.json'), 'utf8'));
    const targets = [
      { path: join(root, 'docs/guides/generation-models.ja.md'), locale: 'ja' },
      { path: join(root, 'docs/guides/generation-models.md'), locale: 'en' }
    ];
    const results = targets.map((target) => {
      const current = lf(readFileSync(target.path, 'utf8'));
      return { ...target, current, next: renderDocument(current, catalog.models, target.locale) };
    });
    if (process.argv.includes('--check')) {
      if (results.some(({ current, next }) => current !== next)) {
        fail('generation model list drifted. Run `npm run gen:generation-models` and commit the result');
      }
      console.log(`gen-generation-models-doc: no drift (${catalog.models.length} models)`);
      return;
    }
    for (const { path, current, next } of results) {
      if (current !== next) writeFileSync(path, next);
    }
    console.log(`gen-generation-models-doc: regenerated ${catalog.models.length} models`);
  } catch (error) {
    fail(error.message);
  }
};

if (realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) main();
