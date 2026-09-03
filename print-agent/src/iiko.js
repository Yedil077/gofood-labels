import crypto from 'node:crypto';

const sha1 = (s) => crypto.createHash('sha1').update(String(s), 'utf8').digest('hex');

/**
 * Клиент iikoServer (RMS / "resto") API.
 * Док: GET /resto/api/auth?login=&pass=<sha1>  ->  токен (текст)
 *      далее ?key=<токен> на всех запросах, в конце /resto/api/logout?key=
 * У iiko жёсткий лимит одновременных API-сессий — всегда делаем logout.
 */
export class Iiko {
  constructor({ host, login, password, base }) {
    this.host = String(host || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    this.base = base || `https://${this.host}/resto/api`;
    this.login = login;
    this.password = password;
    this.key = null;
  }

  async _text(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json, text/plain' } });
    const txt = await res.text();
    if (!res.ok) throw new Error(`iiko ${res.status}: ${txt.slice(0, 200)}`);
    return txt;
  }
  async _json(path) {
    const sep = path.includes('?') ? '&' : '?';
    const txt = await this._text(`${this.base}${path}${sep}key=${encodeURIComponent(this.key)}`);
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error(`iiko: ответ не JSON для ${path}: ${txt.slice(0, 120)}`);
    }
  }

  async auth() {
    const p = encodeURIComponent(this.login);
    try {
      this.key = (await this._text(`${this.base}/auth?login=${p}&pass=${sha1(this.password)}`)).trim();
    } catch (e) {
      // некоторые старые сборки принимают пароль как есть
      this.key = (await this._text(`${this.base}/auth?login=${p}&pass=${encodeURIComponent(this.password)}`)).trim();
    }
    if (!this.key || this.key.length < 8) throw new Error('iiko: пустой токен авторизации');
    return this.key;
  }

  async logout() {
    if (!this.key) return;
    try {
      await this._text(`${this.base}/logout?key=${encodeURIComponent(this.key)}`);
    } catch {
      /* no-op */
    }
    this.key = null;
  }

  /** Номенклатура: id, name, num (артикул), code, type, + пищевая ценность на 100 г если задана. */
  async getProducts() {
    let data;
    try {
      data = await this._json('/v2/entities/products/list?includeDeleted=false');
    } catch {
      data = await this._json('/products'); // запасной путь
    }
    return Array.isArray(data) ? data : data?.response || data?.products || [];
  }

  /** Технологические карты по всей номенклатуре. */
  async getAssemblyCharts(dateFrom, dateTo) {
    const q = `dateFrom=${dateFrom}&dateTo=${dateTo}&includePreparedCharts=true&includeDeletedProducts=false`;
    const data = await this._json(`/v2/assemblyCharts/getAll?${q}`);
    return {
      assemblyCharts: data?.assemblyCharts || (Array.isArray(data) ? data : []) || [],
      preparedCharts: data?.preparedCharts || [],
    };
  }
}

/* ------------------------- разбор ответов iiko ------------------------- */

const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k];
  return null;
};

export function nutritionPer100g(p) {
  const protein = num(pick(p, ['proteinsAmount', 'proteins', 'protein', 'fullAmountProteins']));
  const fat = num(pick(p, ['fatAmount', 'fats', 'fat', 'fullAmountFats']));
  const carbs = num(pick(p, ['carbohydratesAmount', 'carbohydrates', 'carbs', 'fullAmountCarbohydrates']));
  const kcal = num(pick(p, ['energyAmount', 'energy', 'energyFullAmount', 'calories', 'fullAmountCalories']));
  return { protein, fat, carbs, kcal };
}

export function chartProductId(chart) {
  return pick(chart, ['assembledProductId', 'productId', 'assembledProduct', 'id']);
}
export function chartItems(chart) {
  return chart?.items || chart?.assemblyChartItems || chart?.components || [];
}
export function itemProductId(it) {
  return pick(it, ['productId', 'product', 'id']);
}
/** Нетто-вес позиции в кг. */
export function itemNetKg(it) {
  const v = pick(it, ['amountOut', 'amountMiddle', 'amount', 'amountIn', 'netto', 'brutto']);
  return num(v) || 0;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export { num as _num };
