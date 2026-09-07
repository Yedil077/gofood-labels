import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDietType, resolveDietType, dietTypeLabel } from '../dietType.js';

test('автоопределение: явные маркеры ПП', () => {
  assert.equal(detectDietType({ category: 'ПП-меню' }), 'pp');
  assert.equal(detectDietType({ category: 'Правильное питание' }), 'pp');
  assert.equal(detectDietType({ category: 'Горячее / П/П' }), 'pp');
  assert.equal(detectDietType({ name: 'Салат диетический' }), 'pp');
  assert.equal(detectDietType({ name: 'Боул фитнес' }), 'pp');
  assert.equal(detectDietType({ name: 'Ролл лайт' }), 'pp');
});

test('автоопределение: обычные блюда — классический', () => {
  assert.equal(detectDietType({ category: 'Горячие блюда', name: 'Плов с говядиной' }), 'classic');
  assert.equal(detectDietType({ category: 'Супы', name: 'Борщ' }), 'classic');
  assert.equal(detectDietType({ name: 'Каппучино' }), 'classic'); // «пп» внутри слова не считается
});

test('ручной выбор перекрывает автоопределение', () => {
  assert.equal(resolveDietType({ category: 'Правильное питание', diet_type: 'classic' }), 'classic');
  assert.equal(resolveDietType({ category: 'Горячие блюда', diet_type: 'pp' }), 'pp');
});

test('пустой / некорректный diet_type — откат на автоопределение', () => {
  assert.equal(resolveDietType({ category: 'ПП', diet_type: '' }), 'pp');
  assert.equal(resolveDietType({ category: 'Супы', diet_type: null }), 'classic');
  assert.equal(resolveDietType({ category: 'Супы', diet_type: 'garbage' }), 'classic');
});

test('подпись для этикетки', () => {
  assert.equal(dietTypeLabel({ diet_type: 'pp' }), 'ПП');
  assert.equal(dietTypeLabel({ category: 'Супы' }), 'Классический');
});
