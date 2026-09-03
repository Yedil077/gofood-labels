import test from 'node:test';
import assert from 'node:assert/strict';
import { ean13FromArtikul, ean13Check } from '../barcode.js';
import { pickBarcodeValue } from '../normalize.js';

// Проверено на реальных штрихкодах из iiko/кассы (Интеграция kitshop → Products.Barcode)
const CASES = [
  ['54752', '2154752000011'],
  ['89988', '2189988000016'],
  ['99894', '2199894000017'],
  ['84847', '2184847000015'],
  ['45696', '2145696000014'],
  ['12346', '2112346000014'],
  ['15456', '2115456000011'],
  ['25646', '2125646000011'],
];

for (const [art, bc] of CASES) {
  test(`EAN-13 из артикула ${art} -> ${bc}`, () => {
    assert.equal(ean13FromArtikul(art), bc);
  });
}

test('контрольная цифра EAN-13', () => {
  assert.equal(ean13Check('218998800001'), '6');
  assert.equal(ean13Check('215475200001'), '1');
});

test('6-значный артикул — формула неприменима, пусто', () => {
  assert.equal(ean13FromArtikul('123456'), '');
});

test('pickBarcodeValue: источник ean13 берёт формулу и символику ean13', () => {
  const r = pickBarcodeValue({ artikul: '89988', code: '3425' }, { 'barcode.defaultSource': 'ean13' });
  assert.equal(r.source, 'ean13');
  assert.equal(r.value, '2189988000016');
  assert.equal(r.symbology, 'ean13');
});

test('pickBarcodeValue: ean13 с 6-значным артикулом откатывается на Код', () => {
  const r = pickBarcodeValue({ artikul: '542282', code: '2088' }, { 'barcode.defaultSource': 'ean13' });
  assert.equal(r.source, 'code');
  assert.equal(r.value, '2088');
});

test('pickBarcodeValue: явный источник artikul', () => {
  const r = pickBarcodeValue({ artikul: '89988', code: '3425', barcode_source: 'artikul' }, {});
  assert.equal(r.value, '89988');
});
