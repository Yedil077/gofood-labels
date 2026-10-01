import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayout } from '../labelDraw.js';
import { DEFAULTS } from '../defaults.js';

test('размер этикетки по умолчанию — 80×50 мм', () => {
  assert.equal(DEFAULTS['label.widthMm'], 80);
  assert.equal(DEFAULTS['label.heightMm'], 50);
});

test('pickLayout: 80×50 — Макет 1 по умолчанию, Макет 2 по выбору', () => {
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: {} }), 1);
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: { layout: 1 } }), 1);
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: { layout: 2 } }), 2);
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: { layout: '2' } }), 2);
  assert.equal(pickLayout({ widthMm: 80, heightMm: 50, data: { layout: 7 } }), 1);
});

test('pickLayout: старый носитель 100×70 — классический макет', () => {
  assert.equal(pickLayout({ widthMm: 100, heightMm: 70, data: { layout: 2 } }), 0);
});
