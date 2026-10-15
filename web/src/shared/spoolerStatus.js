/**
 * Разбор очереди печати Windows (Get-PrintJob) для Print Agent.
 * Только спулер: он знает, что задание принято/печатается/передано принтеру.
 * Физический выход наклеек он НЕ подтверждает.
 */

const ERR_RX = /error|offline|paperout|paper ?out|blocked|usererror|intervention|deleted/i;

/** Сводка по нашему заданию в списке заданий спулера. */
export function findSpoolJob(list, tag) {
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const mine = arr.find((j) => String(j?.DocumentName || '').includes(tag));
  if (!mine) return { found: false };
  const st = String(mine.JobStatus ?? '');
  return {
    found: true,
    printing: /printing/i.test(st),
    error: ERR_RX.test(st) ? st : null,
    status: st,
  };
}

/**
 * Решение по истории наблюдений (массив результатов findSpoolJob по времени) и таймауту.
 * Возвращает null — ждать дальше; иначе { result: 'done'|'sent'|'uncertain', note }.
 */
export function spoolVerdict(observations, { timedOut = false, graceOver = false } = {}) {
  const seen = observations.some((o) => o.found);
  const last = observations[observations.length - 1] || { found: false };
  if (seen && !last.found) {
    const hadErr = observations.some((o) => o.error);
    return {
      result: 'done',
      note: hadErr
        ? 'Windows передал задание принтеру (по ходу были ошибки принтера — проверьте наклейки)'
        : 'Windows полностью передал задание принтеру',
    };
  }
  if (!seen && graceOver) {
    return { result: 'sent', note: 'Передано в Windows; отследить очередь печати не удалось' };
  }
  if (timedOut) {
    return {
      result: 'uncertain',
      note: last.error ? `Принтер сообщает: ${last.error}` : 'Задание долго не уходит из очереди Windows',
    };
  }
  return null;
}
