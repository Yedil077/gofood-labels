import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLabelDateTime, DEFAULT_DATETIME_CONFIG } from '../labelDateTime.js';

/** Обязательные контрольные примеры из ТЗ п.6. */
const CASES = [
  ['2026-09-03 09:00', '04.09.2026', '00:12'],
  ['2026-09-03 23:59', '04.09.2026', '00:13'],
  ['2026-09-04 01:55', '04.09.2026', '01:01'],
  ['2026-09-04 01:56', '04.09.2026', '01:02'],
  ['2026-09-04 08:59', '04.09.2026', '01:30'],
  ['2026-09-04 09:00', '05.09.2026', '01:00'],
];

for (const [input, date, time] of CASES) {
  test(`контрольный пример: ${input} -> ${date} ${time}`, () => {
    const r = calculateLabelDateTime(input, DEFAULT_DATETIME_CONFIG);
    assert.equal(r.date, date);
    assert.equal(r.time, time);
    assert.equal(r.approximate, false);
    assert.equal(r.ruleId, 'control');
  });
}

test('правило ДАТЫ вне контрольных примеров: до 09:00 -> сегодня, время approximate', () => {
  const r = calculateLabelDateTime('2026-09-10 05:30');
  assert.equal(r.date, '10.09.2026');
  assert.equal(r.approximate, true);
});

test('ровно 09:00 -> следующий день', () => {
  assert.equal(calculateLabelDateTime('2026-09-10 09:00').date, '11.09.2026');
});
test('08:59 -> тот же день', () => {
  assert.equal(calculateLabelDateTime('2026-09-10 08:59').date, '10.09.2026');
});
test('переход года через смену', () => {
  assert.equal(calculateLabelDateTime('2026-12-31 22:00').date, '01.01.2027');
});
test('настраиваемый порог смены (06:00)', () => {
  const cfg = { ...DEFAULT_DATETIME_CONFIG, shiftCutoffMin: 360, controlExamples: [] };
  assert.equal(calculateLabelDateTime('2026-09-10 05:59', cfg).date, '10.09.2026');
  assert.equal(calculateLabelDateTime('2026-09-10 06:00', cfg).date, '11.09.2026');
});
test('timeFallback passthrough', () => {
  const cfg = { ...DEFAULT_DATETIME_CONFIG, controlExamples: [], timeFallback: { mode: 'passthrough' } };
  assert.equal(calculateLabelDateTime('2026-09-10 07:45', cfg).time, '07:45');
});
test('принимает Date', () => {
  const r = calculateLabelDateTime(new Date(2026, 8, 3, 9, 0, 0));
  assert.equal(r.date, '04.09.2026');
  assert.equal(r.time, '00:12');
});
