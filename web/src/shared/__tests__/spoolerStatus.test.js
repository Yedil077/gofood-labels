import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSpoolJob, spoolVerdict } from '../spoolerStatus.js';

test('находит своё задание в списке спулера и его состояние', () => {
  const list = [
    { Id: 1, DocumentName: 'other.pdf', JobStatus: 'Printing' },
    { Id: 2, DocumentName: 'qab12cd34_2026.pdf', JobStatus: 'Printing, Retained' },
  ];
  assert.deepEqual(findSpoolJob(list, 'qab12cd34'), { found: true, printing: true, error: null, status: 'Printing, Retained' });
  assert.equal(findSpoolJob(list, 'qzzz').found, false);
  assert.equal(findSpoolJob({ DocumentName: 'qab12cd34.pdf', JobStatus: 'Error, Printing' }, 'qab12cd34').error, 'Error, Printing');
  assert.equal(findSpoolJob(null, 'x').found, false);
});

test('вердикт: видели и исчезло — передано принтеру полностью', () => {
  const v = spoolVerdict([{ found: true, printing: true }, { found: false }]);
  assert.equal(v.result, 'done');
});

test('вердикт: ни разу не видели — честно «передано в Windows», не «завершено»', () => {
  assert.equal(spoolVerdict([{ found: false }], {}), null, 'пока ждём');
  assert.equal(spoolVerdict([{ found: false }], { graceOver: true }).result, 'sent');
});

test('вердикт: висит в очереди до таймаута — «неизвестно»', () => {
  const v = spoolVerdict([{ found: true, error: 'Offline' }], { timedOut: true });
  assert.equal(v.result, 'uncertain');
  assert.match(v.note, /Offline/);
});
