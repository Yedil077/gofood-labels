/**
 * Клиент iikoServer (RMS / «resto») API — изоморфный: работает и в Node (агент),
 * и в Cloudflare Worker (Pages Function). SHA1 — через Web Crypto (есть везде).
 *
 * Док: GET /resto/api/auth?login=&pass=<sha1>  ->  токен (текст)
 *      далее ?key=<токен> на всех запросах, в конце /resto/api/logout?key=
 * У iiko жёсткий лимит одновременных API-сессий — всегда делаем logout.
 */

const HEX = '0123456789abcdef';
export async function sha1hex(str) {
  const data = new TextEncoder().encode(String(str));
  const buf = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

export class Iiko {
  constructor({ host, login, password, apiPassword, base }) {
    this.host = String(host || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    this.base = base || `https://${this.host}/resto/api`;
    this.login = login;
    this.passwords = [apiPassword, password].filter((x) => x != null && x !== '');
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
    if (!this.passwords.length) throw new Error('iiko: не задан пароль');
    const attempts = [];
    for (const pw of this.passwords) {
      attempts.push(`pass=${await sha1hex(pw)}`); // штатный вариант — SHA1
      attempts.push(`pass=${encodeURIComponent(pw)}`); // старые сборки — как есть
    }
    let lastErr;
    for (const a of attempts) {
      try {
        const key = (await this._text(`${this.base}/auth?login=${p}&${a}`)).trim();
        if (key && key.length >= 8 && !/[<>]/.test(key)) {
          this.key = key;
          return key;
        }
        lastErr = new Error('iiko: неожиданный ответ авторизации: ' + key.slice(0, 80));
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('iiko: авторизация не удалась');
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

  async getProducts() {
    const paths = [
      '/v2/entities/products/list?includeDeleted=false&includeAdditionalInfo=true',
      '/v2/entities/products/list?includeDeleted=false',
      '/v2/entities/list?rootType=Product&includeDeleted=false',
    ];
    for (const p of paths) {
      try {
        const data = await this._json(p);
        const arr = Array.isArray(data) ? data : data?.response || data?.products || [];
        if (arr.length) return arr;
      } catch {
        /* следующий */
      }
    }
    return [];
  }

  async getProductGroups() {
    const map = new Map();
    for (const path of ['/v2/entities/productGroups/list', '/v2/entities/list?rootType=ProductGroup']) {
      try {
        const data = await this._json(path);
        const arr = Array.isArray(data) ? data : data?.response || [];
        for (const g of arr) if (g && g.id) map.set(String(g.id), g.name || '');
        if (map.size) return map;
      } catch {
        /* следующий */
      }
    }
    return map;
  }

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

export function chartProductId(chart) {
  return pick(chart, ['assembledProductId', 'productId', 'assembledProduct', 'id']);
}
export function chartItems(chart) {
  return chart?.items || chart?.assemblyChartItems || chart?.components || [];
}
export function itemProductId(it) {
  return pick(it, ['productId', 'product', 'id']);
}
export function itemNetKg(it) {
  const v = pick(it, ['amountOut', 'amountMiddle', 'amount', 'amountIn', 'netto', 'brutto']);
  return num(v) || 0;
}

export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
