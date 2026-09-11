import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTicketRule, ticketDate, DEFAULT_SHELF_HOURS } from '../priceTicket.js';

test('таблица категория → вес / время (реальные категории iiko)', () => {
  const pick = (c) => {
    const r = resolveTicketRule(c);
    return { weight: r.weight, time: r.time, shelfHours: r.shelfHours };
  };
  assert.deepEqual(pick('Горячее из говядины'), { weight: '340 г', time: '00:05', shelfHours: 48 });
  assert.deepEqual(pick('Горячее из индейки'), { weight: '360 г', time: '00:10', shelfHours: 48 });
  assert.deepEqual(pick('Горячее из курицы'), { weight: '340 г', time: '00:25', shelfHours: 48 });
  assert.deepEqual(pick('Горячее из рыбы'), { weight: '320 г', time: '00:15', shelfHours: 48 });
  assert.deepEqual(pick('Горячие из курицы'), { weight: '340 г', time: '00:25', shelfHours: 48 }); // и мн. число
  assert.deepEqual(pick('Десерты'), { weight: '170 г', time: '00:45', shelfHours: 72 });
  assert.deepEqual(pick('Завтраки'), { weight: '150 г', time: '01:00', shelfHours: 48 });
  assert.deepEqual(pick('Напитки'), { weight: '500 мл', time: '01:10', shelfHours: 72 });
  assert.deepEqual(pick('Перекусы'), { weight: '140 г', time: '01:15', shelfHours: 48 });
  assert.deepEqual(pick('Салаты'), { weight: '160 г', time: '02:05', shelfHours: 48 });
  assert.deepEqual(pick('Супы'), { weight: '400 г', time: '00:40', shelfHours: 48 });
});

test('срок хранения: Десерты/Напитки 72, остальное 48; у горячего строка скрыта', () => {
  assert.equal(resolveTicketRule('Десерты').shelfHours, 72);
  assert.equal(resolveTicketRule('Напитки холодные').shelfHours, 72);
  assert.equal(resolveTicketRule('Горячее из говядины').shelfHours, 48);
  assert.equal(resolveTicketRule('Горячее из курицы').hideShelf, true);
  assert.equal(resolveTicketRule('Десерты').hideShelf, false);
  assert.equal(DEFAULT_SHELF_HOURS, 48);
});

test('совпадение по подстроке и через группу', () => {
  assert.equal(resolveTicketRule('Горячее из говядины / 2 этаж').time, '00:05');
  assert.equal(resolveTicketRule('', 'Напитки').time, '01:10'); // по группе
});

test('категория вне таблицы -> null', () => {
  assert.equal(resolveTicketRule('Гарниры'), null);
  assert.equal(resolveTicketRule('2-этаж Каспий'), null);
  assert.equal(resolveTicketRule(''), null);
  assert.equal(resolveTicketRule(null), null);
});

test('ticketDate = дата + 1 день (по умолчанию, «Завтрашний день»)', () => {
  assert.equal(ticketDate(new Date(2026, 8, 9, 14, 0)), '10.09.2026');
  assert.equal(ticketDate('2026-09-30 23:00'), '01.10.2026');
  assert.equal(ticketDate('2026-12-31 10:00'), '01.01.2027');
  assert.match(ticketDate(), /^\d{2}\.\d{2}\.\d{4}$/); // без аргумента — от текущей даты
});

test('ticketDate с offsetDays=0 — «Сегодняшний день», дата не сдвигается', () => {
  assert.equal(ticketDate(new Date(2026, 8, 9, 14, 0), 0), '09.09.2026');
  assert.equal(ticketDate('2026-09-30 23:00', 0), '30.09.2026');
  assert.equal(ticketDate('2026-12-31 10:00', 0), '31.12.2026');
  assert.equal(ticketDate(new Date(2026, 8, 9, 14, 0), 1), '10.09.2026'); // явный +1 — как раньше
});
