import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayout } from '../labelDraw.js';
import { DEFAULTS } from '../defaults.js';
import { LABEL_SIZES, labelSizeById, labelSizeFor } from '../labelSizes.js';

test('размер этикетки по умолчанию — 80×50 мм', () => {
  assert.equal(DEFAULTS['label.widthMm'], 80);
  assert.equal(DEFAULTS['label.heightMm'], 50);
});

test('два размера на выбор: 80×50 и 100×70', () => {
  assert.deepEqual(LABEL_SIZES.map((s) => s.id), ['80x50', '100x70']);
  assert.equal(labelSizeById('100x70').heightMm, 70);
  assert.equal(labelSizeById('nope'), null);
  assert.equal(labelSizeFor(100, 70).id, '100x70');
  assert.equal(labelSizeFor(123, 45).id, '80x50'); // неизвестный — первый
});

test('pickLayout: 80×50 — Макет 1, 100×70 — классический', () => {
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: {} }), 1);
  assert.equal(pickLayout({ widthMm: 100, heightMm: 70, data: {} }), 0);
});
