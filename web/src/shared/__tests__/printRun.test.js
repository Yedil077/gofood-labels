import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPrintRun, blankEnabledFrom } from '../printRun.js';

test('тираж: пустая в конце только при 4+ и включённой настройке', () => {
  const cases = [
    [1, { filled: 1, blank: 0, total: 1 }],
    [2, { filled: 2, blank: 0, total: 2 }],
    [3, { filled: 3, blank: 0, total: 3 }],
    [4, { filled: 4, blank: 1, total: 5 }],
    [20, { filled: 20, blank: 1, total: 21 }],
    [50, { filled: 50, blank: 1, total: 51 }],
    [100, { filled: 100, blank: 1, total: 101 }],
  ];
  for (const [q, want] of cases) assert.deepEqual(calcPrintRun(q, true), want, `кол-во ${q}`);
});

test('тираж: настройка выключена — пустой нет никогда', () => {
  assert.deepEqual(calcPrintRun(100, false), { filled: 100, blank: 0, total: 100 });
  assert.deepEqual(calcPrintRun(4, false), { filled: 4, blank: 0, total: 4 });
});

test('тираж: мусорный ввод', () => {
  assert.deepEqual(calcPrintRun(0, true), { filled: 1, blank: 0, total: 1 });
  assert.deepEqual(calcPrintRun('20', true), { filled: 20, blank: 1, total: 21 });
  assert.deepEqual(calcPrintRun(5000, true), { filled: 999, blank: 1, total: 1000 });
});

test('настройка по умолчанию — включена', () => {
  assert.equal(blankEnabledFrom({}), true);
  assert.equal(blankEnabledFrom(undefined), true);
  assert.equal(blankEnabledFrom({ 'print.blankAtEnd': false }), false);
});
