/**
 * Состояние печати: какой рулон установлен, можно ли печатать сейчас и почему задание ждёт.
 *
 * Рулон НЕ определяется автоматически: Epson CW-C4030 через Windows/SumatraPDF размер
 * установленного носителя не сообщает. Рулон подтверждает оператор вручную на сайте
 * (source: 'manual'); до первого подтверждения считается рулон по умолчанию (source: 'default').
 */
import { DEFAULT_PROFILE_ID, getProfiles } from './labelSizes.js';

export const DEFAULT_ROLL = { id: DEFAULT_PROFILE_ID, source: 'default', by: null, at: null };

export function normalizeRoll(roll) {
  return roll && roll.id ? { ...DEFAULT_ROLL, ...roll } : { ...DEFAULT_ROLL };
}

/** Состояние принтера в Windows по отчёту агента: 'ok' | 'offline' | 'error' | 'unknown'. */
export function printerHealth(status) {
  if (!status) return 'unknown';
  if (status.workOffline || /offline/i.test(String(status.status || ''))) return 'offline';
  if (/error|paper|jam|door|toner|ink|problem/i.test(String(status.status || ''))) return 'error';
  if (/normal|idle|printing|warmup|ready|^0$|^3$|^4$/i.test(String(status.status ?? ''))) return 'ok';
  return 'unknown';
}

/**
 * Можно ли печатать автоматически прямо сейчас (для установленного рулона).
 * Возвращает { canPrint, reason, profile }.
 */
export function readiness({ settings, roll, online, printer }) {
  const r = normalizeRoll(roll);
  const profile = getProfiles(settings).find((p) => p.id === r.id) || null;
  if (!online) return { canPrint: false, reason: 'Print Agent не на связи', profile };
  if (!profile) return { canPrint: false, reason: 'Установленный рулон не найден среди профилей печати', profile };
  if (!profile.ready)
    return { canPrint: false, reason: `Профиль «${profile.title}» не проверен на рулоне — автопечать выключена`, profile };
  const h = printerHealth(printer);
  if (h === 'offline') return { canPrint: false, reason: 'Принтер в Windows не в сети (офлайн)', profile };
  if (h === 'error') return { canPrint: false, reason: `Принтер сообщает: ${printer?.status}`, profile };
  return { canPrint: true, reason: '', profile };
}

/** Почему задание в очереди не печатается: null | 'roll' | 'profile'. */
export function waitReason(job, { settings, roll }) {
  if (job.status !== 'queued') return null;
  const r = normalizeRoll(roll);
  const size = job.label_size || DEFAULT_PROFILE_ID;
  if (size !== r.id) return 'roll';
  const p = getProfiles(settings).find((x) => x.id === size);
  if (!p || !p.ready) return 'profile';
  return null;
}
