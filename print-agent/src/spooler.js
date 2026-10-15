/**
 * Наблюдение за очередью печати Windows (спулером) через PowerShell Get-PrintJob.
 * Это лучшее доступное подтверждение: Windows сообщает, что задание печатается и что
 * оно полностью передано принтеру. Физический выход наклеек принтер нам не сообщает.
 */
import { execFile } from 'node:child_process';
import { findSpoolJob, spoolVerdict } from '../../web/src/shared/spoolerStatus.js';

// Скрипт — через -EncodedCommand (UTF-16), вывод — в UTF-8: иначе кириллица в именах
// очередей Windows («Epson круг 50») ломается кодовой страницей консоли.
function ps(command, timeoutMs = 15000) {
  const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${command}`;
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
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

/**
 * Только чтение: состояние очередей Windows и бумага/ориентация, сохранённые в их драйвере.
 * Ничего не меняет. Размер установленного рулона отсюда НЕ узнать — только настройку драйвера.
 * → [{ name, found, status, workOffline, paper: { name, widthMm, lengthMm }, landscape }]
 */
export async function printerInfo(names) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (process.platform !== 'win32' || !list.length) return [];
  const arr = list.map(q).join(',');
  const script = `
Add-Type -AssemblyName System.Drawing
$out = foreach ($n in @(${arr})) {
  $p = Get-Printer -Name $n -ErrorAction SilentlyContinue
  $s = New-Object System.Drawing.Printing.PrinterSettings
  $s.PrinterName = $n
  $ps = if ($s.IsValid) { $s.DefaultPageSettings } else { $null }
  [pscustomobject]@{
    name = $n; found = [bool]$p
    status = if ($p) { [string]$p.PrinterStatus } else { 'NotFound' }
    workOffline = if ($p) { [bool]$p.WorkOffline } else { $false }
    paperName = if ($ps) { $ps.PaperSize.PaperName } else { $null }
    paperW = if ($ps) { $ps.PaperSize.Width } else { 0 }
    paperH = if ($ps) { $ps.PaperSize.Height } else { 0 }
    landscape = if ($ps) { [bool]$ps.Landscape } else { $false }
  }
}
@($out) | ConvertTo-Json -Compress`;
  try {
    const raw = await ps(script, 20000);
    const rows = raw ? JSON.parse(raw) : [];
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      name: r.name,
      found: !!r.found,
      status: r.status,
      workOffline: !!r.workOffline,
      // System.Drawing: сотые доли дюйма → мм
      paper: r.paperName ? { name: r.paperName, widthMm: Math.round(r.paperW * 0.254), lengthMm: Math.round(r.paperH * 0.254) } : null,
      landscape: !!r.landscape,
    }));
  } catch {
    return [];
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
