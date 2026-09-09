import test from 'node:test';
import assert from 'node:assert/strict';
import { kcalFromMacros, hoursWord } from '../kbju.js';

test('Ккал по формуле Атуотера (Б×4 + У×4 + Ж×9)', () => {
  assert.equal(kcalFromMacros(6, 14, 41), 314); // 24 + 164 + 126
  assert.equal(kcalFromMacros(0, 0, 0), 0);
  assert.equal(kcalFromMacros(10, 5, 20), 165);
  assert.equal(kcalFromMacros('12.4', '9.1', '28'), 244); // строки тоже (49.6+112+81.9=243.5→244)
});

test('Ккал: не хватает данных -> null', () => {
  assert.equal(kcalFromMacros(6, null, 41), null);
  assert.equal(kcalFromMacros(6, '', 41), null);
  assert.equal(kcalFromMacros(undefined, undefined, undefined), null);
});

test('склонение «час»', () => {
  assert.equal(hoursWord(1), 'час');
  assert.equal(hoursWord(2), 'часа');
  assert.equal(hoursWord(24), 'часа');
  assert.equal(hoursWord(42), 'часа');
  assert.equal(hoursWord(48), 'часов');
  assert.equal(hoursWord(72), 'часа');
  assert.equal(hoursWord(11), 'часов');
  assert.equal(hoursWord(5), 'часов');
});
