import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFlyToSelector,
  FLY_TO_ATTRIBUTES,
  isFlyToTargetKind,
  resolveFlyToMatch
} from '../lib/common/companion-fly-to-targets.js';

test('Fix attribute mappings for six target types', () => {
  assert.deepEqual(Object.keys(FLY_TO_ATTRIBUTES).sort(), [
    'catalogCard', 'daihonRow', 'inspectorField', 'menuSection', 'previewItem', 'timelineItem'
  ]);
  assert.deepEqual(FLY_TO_ATTRIBUTES.previewItem, []);
  assert.equal(isFlyToTargetKind('daihonRow'), true);
  assert.equal(isFlyToTargetKind('unknown'), false);
});

test('Build exact attribute-value selectors', () => {
  assert.equal(buildFlyToSelector('daihonRow', 'row-1', value => value), '[data-caption-id="row-1"]');
  const selector = buildFlyToSelector('catalogCard', 'asset-1', value => `escaped-${value}`);
  for (const attribute of FLY_TO_ATTRIBUTES.catalogCard) {
    assert.match(selector, new RegExp(`\\[${attribute}="escaped-asset-1"\\]`));
  }
  assert.equal(selector.split(', ').length, 5);
});

test('Resolve only when exactly one match is visible', () => {
  assert.equal(resolveFlyToMatch([]), false);
  assert.equal(resolveFlyToMatch([{ visible: true }]), true);
  assert.equal(resolveFlyToMatch([{ visible: false }]), false);
  assert.equal(resolveFlyToMatch([{ visible: true }, { visible: true }]), false);
  assert.equal(resolveFlyToMatch([{ visible: true }, { visible: false }]), false);
});
