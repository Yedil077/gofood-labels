import test from 'node:test';
import assert from 'node:assert/strict';
import { polishComposition } from '../iikoSync.js';

test('кластер зелени -> через запятую', () => {
  assert.equal(
    polishComposition('паста гранора, бефстроганов из курицы, черри, укроп петрушка кинза'),
    'паста, бефстроганов из курицы, черри, укроп, петрушка, кинза'
  );
});

test('грамматика и опечатки', () => {
  assert.equal(polishComposition('тесто для бельгийские вафли, сметана'), 'тесто для бельгийских вафель, сметана');
  assert.equal(polishComposition('грецский орех'), 'грецкий орех');
  assert.equal(polishComposition('сезоные фрукты'), 'сезонные фрукты');
  assert.equal(polishComposition('лук пассированный'), 'лук пассерованный');
  assert.equal(polishComposition('кукуруза консерв, сыр'), 'кукуруза консервированная, сыр');
  assert.equal(polishComposition('бефстроганов из говядины и грибами'), 'бефстроганов из говядины с грибами');
});

test('служебные хвосты убираются', () => {
  assert.equal(
    polishComposition('котлеты из говядины для бризоля каспи, соус для бризоля, мука'),
    'котлеты из говядины, соус, мука'
  );
  assert.equal(polishComposition('тесто, запеченная филе, лук, яйцо для смазки'), 'тесто, запечённое филе, лук, яйцо');
  assert.equal(polishComposition('запеченная кур филе- этаж').includes('этаж'), false);
});

test('дубли ингредиентов схлопываются', () => {
  assert.equal(polishComposition('черри, укроп петрушка кинза, черри'), 'черри, укроп, петрушка, кинза');
});

test('дубли «соус»', () => {
  assert.equal(polishComposition('гречка, соус сливочно-грибной соус'), 'гречка, сливочно-грибной соус');
  assert.equal(polishComposition('гречка, терияки соус, укроп'), 'гречка, соус терияки, укроп');
});

test('пунктуация нормализуется, не ломает нормальный состав', () => {
  assert.equal(polishComposition('клюква, вода, сахар'), 'клюква, вода, сахар');
  assert.equal(polishComposition('сыр моцарелла,  ,сливки'), 'сыр моцарелла, сливки');
  assert.equal(polishComposition(''), '');
  assert.equal(polishComposition(null), null);
});
