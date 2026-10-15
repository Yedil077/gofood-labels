import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  enqueue, claimNext, progress, complete, cancel, retry, hideFinished, listQueue,
  recoverStale, recoverAgent, pendingCount, getJob, voidBrowser, STALE_MS, MAX_AUTO_ATTEMPTS,
} from '../printQueue.js';

/** Минимальный адаптер node:sqlite → API Cloudflare D1. */
function d1() {
  const sq = new DatabaseSync(':memory:');
  return {
    prepare(sql) {
      const st = sq.prepare(sql);
      const make = (args) => ({
        run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
        first: async () => st.get(...args) ?? null,
        all: async () => ({ results: st.all(...args) }),
      });
      return { bind: (...args) => make(args), ...make([]) };
    },
  };
}
const T0 = Date.parse('2026-10-15T09:00:00Z');
const job = (name, filled = 1) => ({ dishId: 1, dishName: name, filled, blank: filled >= 4 ? 1 : 0, user: 'm' });

test('FIFO: три менеджера — задания печатаются строго по очереди, по одному', async () => {
  const db = d1();
  const a = await enqueue(db, job('Салат', 20), T0);
  const b = await enqueue(db, job('Суп', 50), T0 + 1000);
  const c = await enqueue(db, job('Сырники', 100), T0 + 2000);
  assert.equal(await pendingCount(db), 3);

  const r1 = await claimNext(db, 'agent', T0 + 3000);
  assert.equal(r1.job.id, a.id);
  // пока первое в работе — второе не выдаётся никому
  const busy = await claimNext(db, 'agent', T0 + 4000);
  assert.equal(busy.busy.id, a.id);
  assert.ok(await progress(db, a.id, 'agent', 'submitted', T0 + 5000));
  assert.ok(await progress(db, a.id, 'agent', 'printing', T0 + 6000));
  assert.equal((await complete(db, a.id, 'agent', { result: 'done' }, T0 + 7000)).status, 'done');

  assert.equal((await claimNext(db, 'agent', T0 + 8000)).job.id, b.id);
  await complete(db, b.id, 'agent', { result: 'done' }, T0 + 9000);
  assert.equal((await claimNext(db, 'agent', T0 + 10000)).job.id, c.id);
  await complete(db, c.id, 'agent', { result: 'done' }, T0 + 11000);
  assert.ok((await claimNext(db, 'agent', T0 + 12000)).empty);
});

test('два агента: задание достаётся только одному, второй ждёт', async () => {
  const db = d1();
  await enqueue(db, job('A'), T0);
  await enqueue(db, job('B'), T0 + 1);
  const [x, y] = await Promise.all([claimNext(db, 'pc-1', T0 + 10), claimNext(db, 'pc-2', T0 + 10)]);
  const got = [x, y].filter((r) => r.job);
  assert.equal(got.length, 1, 'одновременно в работе только одно задание');
  // чужой агент не может завершить или продвигать чужое задание
  const other = got[0].job.agent === 'pc-1' ? 'pc-2' : 'pc-1';
  assert.equal(await progress(db, got[0].job.id, other, 'submitted', T0 + 20), false);
  assert.equal((await complete(db, got[0].job.id, other, { result: 'done' }, T0 + 30)).ok, false);
});

test('двойное завершение и повторный захват невозможны', async () => {
  const db = d1();
  const a = await enqueue(db, job('A'), T0);
  await claimNext(db, 'agent', T0 + 1);
  assert.equal((await complete(db, a.id, 'agent', { result: 'done' }, T0 + 2)).ok, true);
  assert.equal((await complete(db, a.id, 'agent', { result: 'done' }, T0 + 3)).ok, false);
  assert.ok((await claimNext(db, 'agent', T0 + 4)).empty);
});

test('зависание ДО отправки принтеру → задание возвращается в очередь', async () => {
  const db = d1();
  const a = await enqueue(db, job('A', 20), T0);
  await claimNext(db, 'agent', T0 + 1);
  const r = await recoverStale(db, T0 + 1 + STALE_MS + 1);
  assert.equal(r.requeued, 1);
  assert.equal((await getJob(db, a.id)).status, 'queued');
});

test('зависание ПОСЛЕ отправки → «неизвестно», автоматически не печатается снова', async () => {
  const db = d1();
  const a = await enqueue(db, job('A', 20), T0);
  await claimNext(db, 'agent', T0 + 1);
  await progress(db, a.id, 'agent', 'submitted', T0 + 2);
  await recoverStale(db, T0 + 2 + STALE_MS + 1);
  assert.equal((await getJob(db, a.id)).status, 'uncertain');
  assert.ok((await claimNext(db, 'agent', T0 + STALE_MS * 3)).empty, 'не берётся в печать сама');
  // только ручной повтор
  assert.equal(await retry(db, a.id, T0 + STALE_MS * 4), true);
  assert.equal((await claimNext(db, 'agent', T0 + STALE_MS * 5)).job.id, a.id);
});

test('перезапуск агента: неотправленное — в очередь, отправленное — «неизвестно»', async () => {
  const db = d1();
  const a = await enqueue(db, job('A'), T0);
  await claimNext(db, 'pc', T0 + 1);
  assert.deepEqual(await recoverAgent(db, 'pc', T0 + 2), { requeued: 1, uncertain: 0 });
  await claimNext(db, 'pc', T0 + 3);
  await progress(db, a.id, 'pc', 'submitted', T0 + 4);
  assert.deepEqual(await recoverAgent(db, 'pc', T0 + 5), { requeued: 0, uncertain: 1 });
});

test('безопасная ошибка до отправки — автоповтор, но не больше лимита', async () => {
  const db = d1();
  const a = await enqueue(db, job('A'), T0);
  for (let i = 1; i <= MAX_AUTO_ATTEMPTS; i++) {
    const c = await claimNext(db, 'agent', T0 + i * 10);
    assert.equal(c.job.id, a.id);
    await complete(db, a.id, 'agent', { result: 'error', error: 'render', retryable: true }, T0 + i * 10 + 1);
  }
  assert.equal((await getJob(db, a.id)).status, 'error', 'после лимита — ошибка, без бесконечного цикла');
});

test('ошибка после отправки не повторяется автоматически', async () => {
  const db = d1();
  const a = await enqueue(db, job('A'), T0);
  await claimNext(db, 'agent', T0 + 1);
  await progress(db, a.id, 'agent', 'submitted', T0 + 2);
  await complete(db, a.id, 'agent', { result: 'error', error: 'spooler', retryable: true }, T0 + 3);
  assert.equal((await getJob(db, a.id)).status, 'error');
});

test('отмена — только ожидающих; очистка скрывает завершённые', async () => {
  const db = d1();
  const a = await enqueue(db, job('A'), T0);
  const b = await enqueue(db, job('B'), T0 + 1);
  await claimNext(db, 'agent', T0 + 2); // A в работе
  assert.equal(await cancel(db, a.id, T0 + 3), false, 'переданное агенту не отменяется');
  assert.equal(await cancel(db, b.id, T0 + 3), true);
  await complete(db, a.id, 'agent', { result: 'done' }, T0 + 4);
  assert.equal(await hideFinished(db), 2);
  assert.equal((await listQueue(db, T0 + 5)).length, 0);
});

test('рулон: берутся только задания под установленный рулон, по порядку; остальные ждут', async () => {
  const db = d1();
  const a = await enqueue(db, { ...job('Салат 80×50', 20), labelSize: '80x50' }, T0);
  const b = await enqueue(db, { ...job('Суп круг 60', 50), labelSize: 'r60' }, T0 + 1);
  const c = await enqueue(db, { ...job('Сырники 80×50', 10), labelSize: '80x50' }, T0 + 2);
  const old = await enqueue(db, job('Старая запись без размера'), T0 + 3); // считается 80×50

  const r1 = await claimNext(db, 'agent', T0 + 10, { labelSize: '80x50' });
  assert.equal(r1.job.id, a.id);
  await complete(db, a.id, 'agent', { result: 'done' }, T0 + 11);
  const r2 = await claimNext(db, 'agent', T0 + 12, { labelSize: '80x50' });
  assert.equal(r2.job.id, c.id, 'суп на круг 60 пропущен — ждёт свой рулон');
  await complete(db, c.id, 'agent', { result: 'done' }, T0 + 13);
  assert.equal((await claimNext(db, 'agent', T0 + 14, { labelSize: '80x50' })).job.id, old.id);
  await complete(db, old.id, 'agent', { result: 'done' }, T0 + 15);
  assert.ok((await claimNext(db, 'agent', T0 + 16, { labelSize: '80x50' })).empty, 'суп не печатается на 80×50');
  assert.equal((await getJob(db, b.id)).status, 'queued');
  // поставили рулон круг 60 — суп пошёл
  assert.equal((await claimNext(db, 'agent', T0 + 17, { labelSize: 'r60' })).job.id, b.id);
});

test('запись о печати через браузер не попадает в очередь', async () => {
  const db = d1();
  await enqueue(db, { ...job('A'), status: 'browser' }, T0);
  assert.ok((await claimNext(db, 'agent', T0 + 1)).empty);
  assert.equal(await pendingCount(db), 0);
});

test('«не печаталось»: отменяется только запись «через браузер»', async () => {
  const db = d1();
  const b = await enqueue(db, { ...job('Каша', 39), status: 'browser' }, T0);
  const q = await enqueue(db, job('Суп'), T0 + 1);
  assert.equal(await voidBrowser(db, b.id, T0 + 2), true);
  assert.equal((await getJob(db, b.id)).status, 'cancelled');
  assert.equal(await voidBrowser(db, q.id, T0 + 3), false, 'задание очереди так не отменяется');
});
