import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTicketRule, ticketDate, DEFAULT_SHELF_HOURS } from '../priceTicket.js';

test('таблица категория → вес / время (совпадает с iiko-ценником)', () => {
  assert.deepEqual(resolveTicketRule('Горячее из говядины'), { weight: '340 г', time: '00:05', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Горячее из индейки'), { weight: '360 г', time: '00:10', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Горячие из курицы'), { weight: '340 г', time: '00:25', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Горячие  из рыбы'), { weight: '320 г', time: '00:15', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Десерты'), { weight: '170 г', time: '00:45', shelfHours: 72 });
  assert.deepEqual(resolveTicketRule('Завтраки'), { weight: '150 г', time: '01:00', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Напитки'), { weight: '500 мл', time: '01:10', shelfHours: 72 });
  assert.deepEqual(resolveTicketRule('Перекусы'), { weight: '140 г', time: '01:15', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Салаты'), { weight: '160 г', time: '02:05', shelfHours: 42 });
  assert.deepEqual(resolveTicketRule('Супы'), { weight: '400 г', time: '00:40', shelfHours: 42 });
});

test('срок хранения: Десерты и Напитки — 72, остальное — 42', () => {
  assert.equal(resolveTicketRule('Десерты').shelfHours, 72);
  assert.equal(resolveTicketRule('Напитки холодные').shelfHours, 72);
  assert.equal(resolveTicketRule('Горячее из говядины').shelfHours, 42);
  assert.equal(DEFAULT_SHELF_HOURS, 42);
});

test('совпадение по подстроке и через группу', () => {
  assert.equal(resolveTicketRule('Горячее из говядины / 2 этаж').time, '00:05');
  assert.equal(resolveTicketRule('', 'Напитки').time, '01:10'); // по группе
});

test('категория вне таблицы -> null', () => {
  assert.equal(resolveTicketRule('Гарниры'), null);
  assert.equal(resolveTicketRule(''), null);
  assert.equal(resolveTicketRule(null), null);
});

test('ticketDate = дата + 1 день', () => {
  assert.equal(ticketDate(new Date(2026, 8, 9, 14, 0)), '10.09.2026');
  assert.equal(ticketDate('2026-09-30 23:00'), '01.10.2026');
  assert.equal(ticketDate('2026-12-31 10:00'), '01.01.2027');
  assert.match(ticketDate(), /^\d{2}\.\d{2}\.\d{4}$/); // без аргумента — от текущей даты
});
