import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  describeGenerationChip, generationChipLabel, resolveGenerationState, sidecarPathFor
} from '../lib/common/generation-sidecar.js';

const startedAt = Date.parse('2026-09-13T00:00:00.000Z');
const cases = [
  ['none', undefined, startedAt, 'none', 'Still'],
  ['empty', { kind: 'still', status: 'planned' }, startedAt, 'planned', 'Empty slot'],
  ['planned', { kind: 'still', status: 'planned', inputs: { prompt: '朝の海' } }, startedAt, 'planned', 'Planned'],
  ['generating', { kind: 'still', status: 'generating', progress: 62,
    job: { started_at: '2026-09-13T00:00:00.000Z', stale_after_s: 900 } }, startedAt + 1000,
  'generating', 'Generating 62%'],
  ['stale', { kind: 'still', status: 'generating',
    job: { started_at: '2026-09-13T00:00:00.000Z', stale_after_s: 900 } }, startedAt + 901000,
  'stale', 'No response · retry'],
  ['done', { kind: 'video', status: 'done' }, startedAt, 'done', 'Generated'],
  ['failed', { kind: 'still', status: 'failed' }, startedAt, 'failed', 'Failed']
];

test('6 状態を契約語彙と表示文言へ写像する', () => {
  for (const [name, meta, now, expectedState, badge] of cases) {
    const state = resolveGenerationState(meta, now);
    assert.equal(state, expectedState, name);
    assert.equal(describeGenerationChip(state, meta).badge, badge, name);
  }
  assert.equal(sidecarPathFor('assets/generated/a.mp4'), 'assets/generated/a.mp4.meta.json');
});

test('stale は stale_after_s を超えたときだけ成立する', () => {
  const meta = { status: 'generating', job: {
    started_at: '2026-09-13T00:00:00.000Z', stale_after_s: 900
  } };
  assert.equal(resolveGenerationState(meta, startedAt + 899000), 'generating', '境界 -1 秒');
  assert.equal(resolveGenerationState(meta, startedAt + 900000), 'generating', '境界ちょうど');
  assert.equal(resolveGenerationState(meta, startedAt + 901000), 'stale', '境界 +1 秒');
});

test('progress が無い generating は不定バー用に undefined を返す', () => {
  const description = describeGenerationChip('generating', { status: 'generating' });
  assert.equal(description.badge, 'Generating');
  assert.equal(description.progress, undefined);
});

test('候補の札は進捗と完了数を示す', () => {
  assert.equal(describeGenerationChip('generating', { job: { provider: 'compare', routes: ['codex', 'grok', 'fal'], completed: 1 } }).badge,
    '3 options · 1/3');
  assert.match(describeGenerationChip('generating', { job: { provider: 'fal', routes: ['a', 'b'],
    started_at: '2026-09-13T00:00:00.000Z' } }, startedAt + 1000).badge, /Generating · 1s/u);
  assert.equal(describeGenerationChip('planned', { job: { routes: ['codex', 'grok', 'fal'], candidates: 2 } }).badge,
    'Candidates: 2');
});

test('札は幅に応じて全文・記号と数・記号だけにし、400% では全文を戻す', () => {
  const progress = '3 options · 1/3';
  assert.equal(generationChipLabel(progress, 101), progress);
  assert.equal(generationChipLabel(progress, 64), '✦ 1/3');
  assert.equal(generationChipLabel(progress, 25.2), '✦');
  assert.equal(generationChipLabel('Candidates: 3', 101), 'Candidates: 3');
  assert.equal(generationChipLabel('Candidates: 3', 25.2), '✦');
  assert.equal(generationChipLabel('Generating · 12s', 64), '✦ 12s');
});

test('planned は空白だけ・欠落・不正型の prompt でも空の枠、文字があれば予定', () => {
  for (const prompt of [undefined, null, '', ' \n\t　', 42, {}, ' 朝の海 ']) {
    const meta = { kind: 'still', status: 'planned', inputs: { prompt } };
    assert.equal(describeGenerationChip('planned', meta).badge, prompt === ' 朝の海 ' ? 'Planned' : 'Empty slot');
  }
});

test('stale_after_s 未指定では helper の既定 900 秒を使う', () => {
  const meta = { version: 1, kind: 'still', status: 'generating', job: {
    started_at: '2026-09-13T00:00:00.000Z'
  } };
  for (const [seconds, expected] of [[899, 'generating'], [900, 'generating'], [901, 'stale']]) {
    assert.equal(resolveGenerationState(meta, startedAt + seconds * 1000), expected, `${seconds} 秒`);
  }
});

test('orphan は v1 タイムラインでは none に潰す', () => {
  assert.equal(resolveGenerationState({
    version: 1, kind: 'still', status: 'orphan'
  }, startedAt), 'none');
});

test('binding 不一致は orphan、binding 一致と省略は素の状態になる', () => {
  const meta = { version: 1, kind: 'video', status: 'done' };
  assert.equal(resolveGenerationState(meta, startedAt, {
    expected: 'a', actual: 'b', matches: false, source: 'result'
  }), 'orphan');
  assert.equal(resolveGenerationState(meta, startedAt, {
    expected: 'a', actual: 'a', matches: true, source: 'result'
  }), 'done');
  assert.equal(resolveGenerationState(meta, startedAt), 'done');
});

test('orphan は専用の見た目になり none とは異なる', () => {
  const description = describeGenerationChip('orphan');
  assert.deepEqual(description, {
    badge: 'Orphaned',
    className: 'akari-generation-orphan',
    title: 'The footage changed (does not match the sha256 in meta)'
  });
  assert.notDeepEqual(description, describeGenerationChip('none'));
});

for (const [name, variety] of [['next-first-last', 'first to last'], ['next-first', 'from image'], ['next-prompt', 'prompt only'], ['next-narrow', 'from image']]) {
  test(`${name}: 動画予定の class / badge / title`, async () => {
    const meta = JSON.parse(await readFile(new URL(`./fixtures/generation-states/assets/generated/${name}.png.meta.json`, import.meta.url)));
    const state = resolveGenerationState(meta, startedAt);
    assert.equal(state, 'planned-video');
    assert.deepEqual(describeGenerationChip(state, meta), {
      className: 'akari-generation-planned-video', badge: '▶ Planned video', title: `Planned video (${variety})`
    });
  });
}

test('next なしの静止画は完成品、title に仮枠を付けない', () => {
  for (const meta of [undefined, { version: 1, kind: 'still', status: 'done' }]) {
    const description = describeGenerationChip(resolveGenerationState(meta, startedAt), meta);
    assert.equal(description.badge, 'Still');
    assert.equal(description.title, 'Still');
  }
});
