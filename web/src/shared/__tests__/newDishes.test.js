import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNewDishes } from '../iikoSync.js';

const dishes = [
  { name: 'Рисовая каша с ягодами', artikul: '41864', code: '2640', category: 'Завтраки' },
  { name: 'Вок с курицей', artikul: '11111', code: '1001', category: 'Горячее из курицы' },
];
const products = [
  // уже на сайте (группы g-breakfast, g-hot)
  { id: 'p1', type: 'DISH', num: '41864', code: '2640', name: 'Рисовая каша с ягодами', parent: 'g-breakfast' },
  { id: 'p2', type: 'DISH', num: '11111', code: '1001', name: 'Вок с курицей', parent: 'g-hot' },
  // новые
  { id: 'p3', type: 'DISH', num: '46545', code: '3878', name: 'Рисовая каша на миндальном молоке с ягодами', parent: 'g-breakfast' },
  { id: 'p4', type: 'DISH', num: '54135', code: '3843', name: 'Картофель по-деревенски с курицей и грибами', parent: 'g-hot' },
  // не берём: удалённое, полуфабрикат, чужая группа, совпадение по названию
  { id: 'p5', type: 'DISH', num: '99999', code: '9999', name: 'Старое блюдо', parent: 'g-hot', deleted: true },
  { id: 'p6', type: 'PREPARED', num: '88888', code: '8888', name: 'П/ф гуляш', parent: 'g-hot' },
  { id: 'p7', type: 'DISH', num: '77777', code: '7777', name: 'Блюдо другого ресторана', parent: 'g-other' },
  { id: 'p8', type: 'DISH', num: '66666', code: '6666', name: 'ВОК  с курицей', parent: 'g-hot' },
];
const items = [{ iikoId: 'p4', composition: 'картофель запеченный, гуляш из курицы' }];

test('находит новые блюда iiko с категорией по группе и составом из техкарты', () => {
  const r = findNewDishes({ products, items, dishes });
  assert.deepEqual(
    r.map((d) => [d.num, d.category, d.composition]),
    [
      ['54135', 'Горячее из курицы', 'картофель запеченный, гуляш из курицы'],
      ['46545', 'Завтраки', ''], // нет техкарты — состав пустой, не выдумываем
    ]
  );
});
