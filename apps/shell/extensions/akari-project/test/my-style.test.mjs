import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMyStyle, defaultMyStyleParts, ignoredMyStyleParts, myStyleLook, myStylePartLabel, myStyleSamplePresentation, myStyleAppliesTo, parseMyStyle } from '../lib/common/my-style.js';
import { AkariProjectServiceImpl } from '../lib/node/akari-project-service.js';

test('saved format preserves unknown components, omits position, and rejects absolute paths', () => {
  const now = '2026-09-24T00:00:00.000Z';
  const style = createMyStyle({ id: 'my-sample', name: 'Emphasis', when_to_use: 'When surprised',
    sample_text: 'Text', parts: [{ kind: 'look', text_style: { color: '#ff1744',
      position: { y: 0.8 }, text_anchor: 'tc', zone: 'top', layout: {}, animation: { in: { id: 'pop' } },
      reference_height_px: 1920 } , scope: 'caption', mode: 'modify' },
    { kind: 'motion', scope: 'caption', mode: 'modify', animation: { in: { id: 'pop' } } },
    { kind: 'future', scope: 'scene', mode: 'attach', attach: { at: 'in', offset_frames: 2 } }] }, now);
  const roundtrip = parseMyStyle(JSON.parse(JSON.stringify(style)));
  assert.deepEqual(myStyleLook(roundtrip), { color: '#ff1744', reference_height_px: 1920 });
  assert.deepEqual(ignoredMyStyleParts(roundtrip), ['future']);
  assert.equal(roundtrip.license.scope, 'private-owned');
  assert.deepEqual(myStyleAppliesTo(roundtrip), ['caption', 'scene']);
  assert.equal('applies_to' in parseMyStyle({ ...roundtrip, applies_to: ['clip'] }), false);
  assert.match(roundtrip.uid, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(roundtrip.version, 1);
  assert.equal(roundtrip.revision, 1);
  const reserved = { ...roundtrip, tags: ['Emphasis'], requires: [{ category: 'font', id: 'sample', version: 1 }],
    provenance: { origin: 'own' }, price: null, visibility: 'shared' };
  assert.deepEqual(parseMyStyle(JSON.parse(JSON.stringify(reserved))), reserved);
  assert.throws(() => parseMyStyle({ ...style, parts: [{ kind: 'sfx', path: '/tmp/sound.wav' }] }), /Absolute paths/);
  assert.equal(parseMyStyle({ ...style, when_to_use: 'Morning / evening routine' }).when_to_use, 'Morning / evening routine');
  assert.equal(parseMyStyle({ ...style, parts: [{ kind: 'sfx', url: 'https://example.com/sound.wav' }] }).parts[0].kind, 'sfx');
  for (const path of ['~/sound.wav', 'C:\\sound.wav', '\\\\server\\share\\sound.wav', 'file:///tmp/sound.wav']) {
    assert.throws(() => parseMyStyle({ ...style, parts: [{ kind: 'sfx', path }] }), /Absolute paths/);
  }
  assert.throws(() => parseMyStyle({ ...style, id: '../escape' }), /saved .*format/);
  assert.throws(() => parseMyStyle({ ...style, schema: 'akari-style/v0' }), /saved .*format/);
  assert.throws(() => parseMyStyle({ ...style, parts: [{ kind: 'look', text_style: { color: '#fff' } }] }), /reference output height/);
  assert.throws(() => parseMyStyle({ ...style, parts: [{ kind: 'look', text_style: { color: 42,
    reference_height_px: 1920 } }] }), /appearance value/);
});

test('validates motion shape and selection defaults', () => {
  const style = createMyStyle({ id: 'motion', name: 'Motion', when_to_use: 'Emphasis', sample_text: 'Text',
    parts: [{ kind: 'look', scope: 'caption', mode: 'modify', text_style: { reference_height_px: 1080 } },
      { kind: 'motion', scope: 'caption', mode: 'modify', animation: {
        in: { id: 'fade-up', duration_sec: 0.4, ease: 'ease-out', amp: 8 }, loop: { id: 'float' } } },
      { kind: 'sfx' }] }, '2026-09-24T00:00:00.000Z');
  assert.deepEqual(parseMyStyle(JSON.parse(JSON.stringify(style))), style);
  const motionOnly = createMyStyle({ id: 'motion-only', name: 'Motion only', when_to_use: 'Entrance', sample_text: 'Text',
    parts: [style.parts[1]] }, '2026-09-24T00:00:00.000Z');
  assert.deepEqual(motionOnly.parts, [style.parts[1]]);
  assert.equal(myStyleLook(motionOnly), undefined);
  assert.deepEqual(defaultMyStyleParts(style.parts), ['look', 'motion']);
  assert.deepEqual(defaultMyStyleParts(style.parts, ['motion']), ['motion']);
  assert.deepEqual(defaultMyStyleParts(style.parts, ['sfx']), []);
  for (const animation of [{ spin: { id: 'pop' } }, { in: {} }, { in: { id: '/tmp/pop' } }, []]) {
    assert.throws(() => parseMyStyle({ ...style, parts: [{ kind: 'motion', scope: 'caption', mode: 'modify', animation }] }));
  }
  assert.throws(() => parseMyStyle({ ...style,
    parts: [{ kind: 'motion', scope: 'clip', mode: 'modify', animation: { in: { id: 'pop' } } }] }), /motion/);
});

test('linked components retain only asset IDs and can be selected', () => {
  const style = createMyStyle({ id: 'attach', name: 'Entrance', when_to_use: 'Emphasis', sample_text: 'Text', parts: [
    { kind: 'sfx', scope: 'caption', mode: 'attach', attach: { at: 'in', offset_frames: 0 },
      asset: { category: 'audio', id: 'pop' }, file: 'pop.wav', duration_sec: .3 },
    { kind: 'decor', scope: 'caption', mode: 'attach', attach: { at: 'whole', offset_frames: 0 },
      asset: { category: 'overlay', id: 'frame' }, file: 'frame.html' },
    { kind: 'fx', scope: 'caption', mode: 'attach', attach: { at: 'whole', offset_frames: 0 },
      effect: { type: 'invert' } },
  ] }, '2026-09-24T00:00:00.000Z');
  assert.deepEqual(defaultMyStyleParts(style.parts), ['sfx', 'decor', 'fx']);
  assert.deepEqual(style.parts.map(part => defaultMyStyleParts([part]).length > 0), [true, true, true]);
  assert.deepEqual(ignoredMyStyleParts(style), []);
  assert.deepEqual(parseMyStyle(JSON.parse(JSON.stringify(style))), style);
  const reserved = { kind: 'sfx', mode: 'attach', asset: { category: 'audio', id: 'pop' } };
  const future = { kind: 'decor', mode: 'attach', attach: { at: 'burst', offset_frames: 0 },
    asset: { category: 'overlay', id: 'frame' }, file: 'frame.html' };
  const malformed = { ...style.parts[0], file: '../bad.wav' };
  const extended = { ...style.parts[1], timeline: 'future' };
  const mixed = parseMyStyle({ ...style, parts: [...style.parts, reserved, future, malformed, extended] });
  assert.deepEqual(mixed.parts.slice(3), [reserved, future, malformed, extended]);
  assert.deepEqual(defaultMyStyleParts(mixed.parts), ['sfx', 'decor', 'fx']);
  assert.deepEqual(ignoredMyStyleParts(mixed), ['sfx', 'decor']);
  assert.deepEqual(mixed.parts.map(part => defaultMyStyleParts([part]).length > 0),
    [true, true, true, false, false, false, false]);
});

test('reads motion without scope / mode by filling defaults', () => {
  const style = createMyStyle({ id: 'legacy-motion', name: 'Motion', when_to_use: 'Emphasis', sample_text: 'Text',
    parts: [{ kind: 'motion', scope: 'caption', mode: 'modify', animation: { in: { id: 'fade-up' } } }] },
  '2026-09-24T00:00:00.000Z');
  const parsed = parseMyStyle({ ...style, parts: [{ kind: 'motion', animation: { in: { id: 'fade-up' } } }] });
  assert.deepEqual(parsed.parts, [{ kind: 'motion', scope: 'caption', mode: 'modify',
    animation: { in: { id: 'fade-up' } } }]);
});

test('component chips show English names for known kinds and apply stroke, background, and shadow to samples', () => {
  assert.deepEqual(['look', 'motion', 'sfx', 'fx', 'decor', 'camera', 'future'].map(myStylePartLabel),
    ['Appearance', 'Motion', 'Sound effects', 'Visual effects', 'Decoration', 'Camera', 'future']);
  const style = createMyStyle({ id: 'my-look', name: 'Sample', when_to_use: 'Emphasis', sample_text: 'Text',
    parts: [{ kind: 'look', text_style: { color: '#ff1744', reference_height_px: 1920, stroke: { color: '#ffffff', width_px: 6 },
      background: { color: '#111111', opacity: 0.5, radius_px: 8 },
      shadow: { color: '#000000', opacity: 0.8, blur_px: 4 } } }] }, '2026-09-24T00:00:00.000Z');
  const css = myStyleSamplePresentation(style);
  assert.equal(css.color, '#ff1744');
  assert.match(css.WebkitTextStroke, /#ffffff/);
  assert.match(css.backgroundColor, /#111111 50%/);
  assert.equal(css.borderRadius, '3.4px');
  assert.match(css.textShadow, /#000000 80%/);
});

test('80px Captions sample scales stroke, shadow, and background with text and draws fill above', () => {
  const style = createMyStyle({ id: 'my-variety', name: 'Variety', when_to_use: 'Emphasis', sample_text: 'Yellow',
    parts: [{ kind: 'look', text_style: { size_px: 80, reference_height_px: 1920, color: '#ffeb3b',
      stroke: { color: '#1a1a1a', width_px: 9 },
      shadow: { color: '#000000', blur_px: 8, distance_px: 6, angle_deg: 90 },
      background: { color: '#222222', padding_px: 12, radius_px: 8 } } }] },
  '2026-09-24T00:00:00.000Z');
  const css = myStyleSamplePresentation(style);
  assert.equal(css.fontSize, 22);
  assert.equal(css.WebkitTextStroke, '2.5px #1a1a1a');
  assert.equal(css.paintOrder, 'stroke fill');
  assert.equal(css.textShadow, '0px 1.7px 2.2px color-mix(in srgb, #000000 100%, transparent)');
  assert.equal(css.padding, '3.3px');
  assert.equal(css.borderRadius, '2.2px');
});

test('small positive dimensions retain 0.5px in samples', () => {
  const style = createMyStyle({ id: 'my-thin', name: 'Thin', when_to_use: 'Subtle', sample_text: 'Text',
    parts: [{ kind: 'look', text_style: { size_px: 80, reference_height_px: 1920, stroke: { color: '#000000', width_px: 1 },
      shadow: { color: '#000000', blur_px: 1, distance_px: 1, angle_deg: 90 },
      background: { padding_px: 1, radius_px: 1 } } }] }, '2026-09-24T00:00:00.000Z');
  const css = myStyleSamplePresentation(style);
  assert.equal(css.WebkitTextStroke, '0.5px #000000');
  assert.equal(css.padding, '0.5px');
  assert.equal(css.borderRadius, '0.5px');
  assert.match(css.textShadow, /^0px 0.5px 0.5px /);
});

test('explicit no-effect values round-trip through saved format', () => {
  const style = createMyStyle({ id: 'none', name: 'None', when_to_use: 'Subtle', sample_text: 'Text',
    parts: [{ kind: 'look', text_style: { reference_height_px: 1920,
      stroke: { width_px: 0 }, background: { opacity: 0 },
      shadow: { color: '#000000', opacity: 0 }, glow: { color: '#000000', density: 0 } } }] },
  '2026-09-24T00:00:00.000Z');
  assert.deepEqual(parseMyStyle(JSON.parse(JSON.stringify(style))), style);
});

test('writes style.json and supports reload, rename, and delete', async t => {
  const root = await mkdtemp(join(tmpdir(), 'akari-my-style-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = new AkariProjectServiceImpl();
  service.myStylesDirectory = async () => join(root, 'styles');
  const style = createMyStyle({ id: 'my-one', name: 'First', when_to_use: 'Emphasis',
    sample_text: 'Text', parts: [{ kind: 'look', text_style: { color: '#ffffff', reference_height_px: 1920 } }] },
    '2026-09-24T00:00:00.000Z');
  await service.saveMyStyle(style);
  await mkdir(join(root, 'styles', 'broken'));
  await writeFile(join(root, 'styles', 'broken', 'style.json'), '{}');
  const raw = await readFile(join(root, 'styles', 'my-one', 'style.json'), 'utf8');
  assert.equal(raw.includes(root), false);
  assert.deepEqual(await service.listMyStyles(), [style]);
  await service.renameMyStyle(style.id, 'Updated');
  assert.equal((await service.listMyStyles())[0].name, 'Updated');
  assert.equal((await service.listMyStyles())[0].uid, style.uid);
  assert.equal((await service.listMyStyles())[0].revision, 2);
  await assert.rejects(service.saveMyStyle({ ...style, uid: createMyStyle({ ...style, id: 'other' }, style.created_at).uid }), /conflict/);
  await assert.rejects(service.saveMyStyle({ ...style, id: 'other' }), /UID/);
  await writeFile(join(root, 'styles', 'my-one', 'thumbnail.png'), 'fixture');
  await service.deleteMyStyle(style.id);
  assert.deepEqual(await service.listMyStyles(), []);
});
