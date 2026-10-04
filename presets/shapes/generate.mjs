import { writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import catalog from './shape-catalog.mjs';
import { bubblePath } from './bubble-path.mjs';

const rounded = {
  'basic-rounded-square': ['basic-square', 36],
  'basic-pill': ['basic-square', 100],
  'flow-alt-process': ['flow-process', 36],
  'flow-terminator': ['flow-process', 100],
  'polygon-hexagon-rounded': ['polygon-hexagon', 28],
  'polygon-octagon-rounded': ['polygon-octagon', 30],
  'star-5-rounded': ['star-5', 18],
  'abstract-plus-rounded': ['basic-cross-thick', 20],
  'abstract-rounded-triangle': ['basic-triangle', 28],
};
const shapeDefaults = { fill: '#a6a6a6', stroke: 'none', strokeWidth: 0 };
const lineDefaults = {
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 4,
  dash: 'solid',
  startCap: 'none',
  endCap: 'none',
  lineCap: 'butt',
};
const bubbleDefaults = { fill: '#ffffff', stroke: '#000000', strokeWidth: 5 };
export function generateIndexText() {
  const records = [];
  for (const category of catalog.categories) {
    for (const item of category.items) {
      const alias = rounded[item.id];
      const row = {
        id: item.id,
        category: category.key,
        name: item.name,
        vb: item.vb,
        d: item.d,
        kind: item.kind,
      };
      if (item.rule) row.rule = item.rule;
      if (alias) row.rounded_from = { base: alias[0], radius: alias[1] };
      row.defaults = {
        ...(item.kind === 'stroke' ? { fill: 'none', stroke: '#a6a6a6', strokeWidth: 4 } : shapeDefaults),
        ...(alias ? { cornerRadius: alias[1] } : {}),
      };
      records.push(row);
    }
  }

  const caps = [
    ['none', 'None', true],
    ['triangle', 'Triangle', true],
    ['chevron', 'Arrow', false],
    ['bar', 'Bar', false],
    ['square', 'Square', true],
    ['circle', 'Circle', true],
    ['diamond', 'Diamond', true],
    ['square', 'Open square', false],
    ['circle', 'Open circle', false],
    ['diamond', 'Open diamond', false],
  ];
  const capCodes = ['none', 'tri', 'open', 'bar', 'sq', 'circ', 'dia', 'sqo', 'circo', 'diao'];
  const pairs = [
    ['none', 'none'],
    ['none', 'tri'],
    ['none', 'open'],
    ['tri', 'tri'],
    ['open', 'open'],
    ['bar', 'bar'],
    ['sq', 'sq'],
    ['circ', 'circ'],
    ['dia', 'dia'],
    ['sqo', 'sqo'],
    ['circo', 'circo'],
    ['diao', 'diao'],
    ['none', 'circ'],
    ['circ', 'tri'],
    ['bar', 'open'],
  ];
  for (const dash of ['solid', 'dash', 'dot']) {
    for (const [start, end] of pairs) {
      const a = caps[capCodes.indexOf(start)];
      const b = caps[capCodes.indexOf(end)];
      records.push({
        id: `line-${dash}-${start}-${end}`,
        category: 'line',
        name: `${{ solid: 'Solid', dash: 'Dashed', dot: 'Dotted' }[dash]}, ${a[1]}, ${b[1]}`,
        vb: [100, 20],
        d: 'M0 10L100 10',
        kind: 'line',
        defaults: {
          ...lineDefaults,
          dash,
          startCap: a[0],
          endCap: b[0],
          startCapFilled: a[2],
          endCapFilled: b[2],
        },
      });
    }
  }

  const bubble = (id, name, change) => {
    const params = {
      style: 'ellipse',
      count: 16,
      depth: 40,
      jitter: 25,
      seed: 1,
      tail: 'point',
      tailAngle: 210,
      tailLength: 45,
      tailWidth: 30,
      tailCurve: 0,
      dash: 'solid',
      ...change,
    };
    records.push({
      id: `manga-${id}`,
      category: 'manga',
      name,
      vb: [100, 100],
      d: bubblePath(100, 100, params),
      kind: 'bubble',
      defaults: { ...bubbleDefaults, ...params },
    });
  };
  bubble('ellipse', 'Ellipse', {});
  bubble('round', 'Rounded', { style: 'rounded', tailAngle: 200, tailLength: 40, tailWidth: 28 });
  bubble('narration', 'Narration', { style: 'rect', tail: 'none' });
  bubble('shout', 'Shout', {
    style: 'jagged',
    count: 22,
    depth: 42,
    jitter: 25,
    seed: 3,
    tailAngle: 215,
    tailLength: 40,
    tailWidth: 26,
  });
  bubble('burst', 'Burst', { style: 'burst', count: 15, depth: 62, jitter: 70, seed: 7, tail: 'none' });
  bubble('cloud', 'Billowing', {
    style: 'cloud',
    count: 11,
    depth: 45,
    jitter: 30,
    seed: 5,
    tail: 'dots',
    tailAngle: 215,
    tailLength: 50,
    tailWidth: 40,
  });
  bubble('tremble', 'Tremble', {
    style: 'wobble',
    count: 36,
    depth: 35,
    jitter: 20,
    seed: 2,
    tailAngle: 200,
    tailLength: 40,
    tailWidth: 28,
    tailCurve: -30,
  });
  bubble('whisper', 'Whisper', {
    dash: 'dash',
    tailAngle: 150,
    tailLength: 40,
    tailWidth: 22,
    tailCurve: 30,
  });
  bubble('upright', 'Tail up right', { tailAngle: 45, tailLength: 45, tailWidth: 30, tailCurve: 20 });
  bubble('spiky-soft', 'Soft spikes', {
    style: 'jagged',
    count: 13,
    depth: 30,
    jitter: 12,
    seed: 4,
    tailAngle: 200,
    tailLength: 40,
    tailWidth: 28,
  });
  bubble('thought', 'Thinking', { tail: 'dots', tailAngle: 200, tailLength: 50, tailWidth: 35 });
  bubble('rect-tail', 'Square with tail', { style: 'rect', tailAngle: 195, tailLength: 42, tailWidth: 26 });

  if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error('duplicate shape ID');
  return records.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

export const indexText = generateIndexText();
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  await writeFile(new URL('./index.jsonl', import.meta.url), indexText);
}
