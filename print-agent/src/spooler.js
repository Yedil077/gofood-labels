/**
 * Наблюдение за очередью печати Windows (спулером) через PowerShell Get-PrintJob.
 * Это лучшее доступное подтверждение: Windows сообщает, что задание печатается и что
 * оно полностью передано принтеру. Физический выход наклеек принтер нам не сообщает.
 */
import { execFile } from 'node:child_process';
import { findSpoolJob, spoolVerdict } from '../../web/src/shared/spoolerStatus.js';

function ps(command, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout || '').trim()))
    );
  });
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Принтер по умолчанию в Windows. */
export async function defaultPrinter() {
  if (process.platform !== 'win32') return '';
  try {
    return await ps("(Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name");
  } catch {
    return '';
  }
}

async function listSpool(printer) {
  const out = await ps(
    `Get-PrintJob -PrinterName ${q(printer)} | Select-Object Id,DocumentName,@{n='JobStatus';e={[string]$_.JobStatus}} | ConvertTo-Json -Compress`
  );
  return out ? JSON.parse(out) : [];
}

/**
 * Ждать, пока задание с меткой `tag` пройдёт через спулер.
 * onPrinting() — один раз, когда Windows сообщит «Printing».
 * Возвращает { result: 'done'|'sent'|'uncertain', note }.
 */
export async function watchSpool({ printer, tag, pages, onPrinting, onTick }) {
  if (process.platform !== 'win32' || !printer) {
    return { result: 'sent', note: 'Передано в Windows; принтер не определён — очередь не отслеживается' };
  }
  const started = Date.now();
  const graceMs = 15000; // если за это время задание ни разу не появилось в спулере
  const timeoutMs = 3 * 60 * 1000 + pages * 4000; // ~4 с на этикетку с запасом
  const obs = [];
  let printingSent = false;
  let failures = 0;
  for (;;) {
    let o;
    try {
      o = findSpoolJob(await listSpool(printer), tag);
      failures = 0;
    } catch (e) {
      if (++failures >= 5) return { result: 'sent', note: 'Передано в Windows; очередь печати недоступна: ' + e.message };
      o = obs[obs.length - 1] || { found: false };
    }
    obs.push(o);
    if (o.printing && !printingSent) {
      printingSent = true;
      await onPrinting?.();
    }
    await onTick?.();
    const el = Date.now() - started;
    const v = spoolVerdict(obs, { graceOver: el > graceMs, timedOut: el > timeoutMs });
    if (v) return v;
    await new Promise((r) => setTimeout(r, obs.length < 6 ? 500 : 2000));
  }
}
