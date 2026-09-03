/**
 * Штрихкод блюда.
 *
 * Установлено сопоставлением файла «Блюда» с выгрузкой iiko/кассы
 * (Интеграция kitshop → Products.Barcode, 614 реальных кодов):
 *   EAN-13 = "21" + Артикул(5 цифр) + "00001" + контрольная цифра
 * Проверено: 464 из 470 сопоставленных пар совпали точно.
 * Для 5-значных артикулов (528 из 533 блюд) формула точная.
 */

export function ean13Check(d12) {
  const s = String(d12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+s[i] || 0) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Возвращает 13-значный EAN-13 из артикула или '' если формула неприменима. */
export function ean13FromArtikul(artikul) {
  const a = String(artikul || '').replace(/\D/g, '');
  if (a.length !== 5) return '';
  const body = '21' + a + '00001'; // 12 цифр
  return body + ean13Check(body);
}
