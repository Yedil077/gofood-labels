import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRows } from '../importParse.js';

const rows = [
  ['Блюда'],
  ['Название', null, null, null, 'Артикул', 'Код', 'Тип', 'Метод списания', 'Ед. измерения', 'Цена, тнг'],
  [null, '2-этаж Каспий', null, null, '0165', '1964', 'Группа'],
  [null, null, 'Горячее из говядины', null, '0168', '1972', 'Группа'],
  [null, null, null, 'Бефстроганов из телятины', '89988', '3425', 'Блюдо', 'Ингредиенты', 'порц', 1390],
  [null, null, null, 'Азу по-татарски', '54752', '3648', 'Блюдо', 'Ингредиенты', 'порц', 1390],
  [null, null, 'Салаты', null, '0169', '1979', 'Группа'],
  [null, null, null, 'Цезарь с курицей', '11111', '2222', 'Блюдо', null, 'порц', null],
  [null, null, null, null, null, null, null],
  ['   ', 'Приборы', null, null, '99999', '2886', 'Блюдо'],
];

test('parseRows: блюда/группы/категории/пропуски', () => {
  const r = parseRows(rows);
  assert.equal(r.dishes.length, 4);
  assert.equal(r.groups.length, 3);
  assert.equal(r.skipped, 1); // пустая строка

  const bef = r.dishes.find((d) => d.code === '3425');
  assert.equal(bef.name, 'Бефстроганов из телятины');
  assert.equal(bef.category, 'Горячее из говядины');
  assert.equal(bef.category_source, 'excel');
  assert.equal(bef.price, 1390);

  const cezar = r.dishes.find((d) => d.code === '2222');
  assert.equal(cezar.category, 'Салаты');

  const pribory = r.dishes.find((d) => d.code === '2886');
  assert.equal(pribory.category, null); // нет группы левее кол.1
  assert.equal(pribory.category_source, 'none');
});

test('parseRows: пустые ячейки не ломают', () => {
  const r = parseRows(rows);
  const cezar = r.dishes.find((d) => d.code === '2222');
  assert.equal(cezar.price, null);
  assert.equal(cezar.unit, 'порц');
});

test('parseRows: нет заголовка -> ошибка', () => {
  assert.throws(() => parseRows([['a', 'b'], ['c', 'd']]));
});
