// ============================================================================
// Unified money system — the SINGLE source of truth for currency conversion and
// formatting. No page should convert or hand-format money; everything flows
// through CurrencyService (rates/convert), MoneyService (format/dual), and
// IncomeNormalizationService (normalize income to a canonical USD value + buckets).
//
// FX strategy: a fixed, dated, USD-based snapshot. Rates and date are auditable
// via FX so a number is never silently stale. Swap RATES_PER_USD for a cached
// live feed when one is wired — callers don't change.
// ============================================================================

export const FX = Object.freeze({ base: 'USD', asOf: '2026-06-01', source: 'fixed daily snapshot' });

// Units of currency per 1 USD.
const RATES_PER_USD = Object.freeze({
  USD: 1, INR: 83.3, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52,
  SGD: 1.35, HKD: 7.81, KRW: 1330, JPY: 157, CHF: 0.89,
});

export const SUPPORTED_CURRENCIES = Object.freeze(Object.keys(RATES_PER_USD));
export const DEFAULT_CURRENCY = 'USD';

const SYMBOLS = Object.freeze({
  USD: '$', CAD: 'CA$', AUD: 'A$', SGD: 'S$', HKD: 'HK$',
  INR: '₹', EUR: '€', GBP: '£', KRW: '₩', JPY: '¥', CHF: 'CHF ',
});

// ISO country (code or common name) → local currency.
const COUNTRY_CURRENCY = Object.freeze({
  US: 'USD', USA: 'USD', 'UNITED STATES': 'USD',
  IN: 'INR', INDIA: 'INR',
  GB: 'GBP', UK: 'GBP', 'UNITED KINGDOM': 'GBP',
  CA: 'CAD', CANADA: 'CAD', AU: 'AUD', AUSTRALIA: 'AUD',
  SG: 'SGD', SINGAPORE: 'SGD', HK: 'HKD', 'HONG KONG': 'HKD',
  KR: 'KRW', 'SOUTH KOREA': 'KRW', JP: 'JPY', JAPAN: 'JPY',
  CH: 'CHF', SWITZERLAND: 'CHF',
  DE: 'EUR', GERMANY: 'EUR', FR: 'EUR', FRANCE: 'EUR', NL: 'EUR', NETHERLANDS: 'EUR', IE: 'EUR', IRELAND: 'EUR',
});

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const CurrencyService = Object.freeze({
  isSupported(code) { return !!code && Object.prototype.hasOwnProperty.call(RATES_PER_USD, String(code).toUpperCase()); },
  normalizeCode(code) {
    const c = String(code || '').toUpperCase();
    return this.isSupported(c) ? c : DEFAULT_CURRENCY;
  },
  symbol(code) { return SYMBOLS[this.normalizeCode(code)] || ''; },
  forCountry(country) {
    const key = String(country || '').trim().toUpperCase();
    return COUNTRY_CURRENCY[key] || DEFAULT_CURRENCY;
  },
  rate(code) { return RATES_PER_USD[this.normalizeCode(code)]; },
  /** Convert `amount` from one currency to another via the USD base. */
  convert(amount, from, to) {
    const n = toNum(amount);
    if (n == null) return null;
    const f = this.normalizeCode(from);
    const t = this.normalizeCode(to);
    if (f === t) return n;
    const usd = n / RATES_PER_USD[f];
    return usd * RATES_PER_USD[t];
  },
});

const NO_DECIMAL = new Set(['JPY', 'KRW']);

export const MoneyService = Object.freeze({
  /** Format an amount already expressed in `currency`. INR uses lakh/crore. */
  format(amount, currency = DEFAULT_CURRENCY) {
    const n = toNum(amount);
    if (n == null) return null;
    const cur = CurrencyService.normalizeCode(currency);
    const sym = SYMBOLS[cur];
    if (cur === 'INR') {
      const abs = Math.abs(n);
      if (abs >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`;
      if (abs >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`;
      return `${sym}${Math.round(n).toLocaleString('en-IN')}`;
    }
    const rounded = NO_DECIMAL.has(cur) ? Math.round(n) : Math.round(n);
    return `${sym}${rounded.toLocaleString('en-US')}`;
  },
  /**
   * Dual display: PRIMARY in the user's preferred currency, SECONDARY in the
   * amount's own (institution-local) currency. e.g. ₹50.80L ($61,000).
   * @param {number} amount value expressed in `localCurrency`
   * @param {string} localCurrency the amount's currency (institution-local)
   * @param {string} preferredCurrency the viewer's preferred currency
   */
  formatDual(amount, localCurrency = DEFAULT_CURRENCY, preferredCurrency = DEFAULT_CURRENCY) {
    const n = toNum(amount);
    if (n == null) return null;
    const local = CurrencyService.normalizeCode(localCurrency);
    const pref = CurrencyService.normalizeCode(preferredCurrency);
    if (local === pref) return this.format(n, local);
    const primary = this.format(CurrencyService.convert(n, local, pref), pref);
    const secondary = this.format(n, local);
    return `${primary} (${secondary})`;
  },
  fxNote(preferredCurrency = DEFAULT_CURRENCY) {
    const pref = CurrencyService.normalizeCode(preferredCurrency);
    if (pref === 'USD') return `FX: USD base, as of ${FX.asOf}`;
    return `FX: $1 = ${this.format(CurrencyService.rate(pref), pref)} (as of ${FX.asOf})`;
  },
});

// Income buckets compared on a normalized USD basis (so they compare correctly
// regardless of the currency the user entered income in). Used by aid logic.
const INCOME_BUCKETS_USD = [
  { key: 'low', maxUsd: 30000, label: 'Under $30k' },
  { key: 'lower_middle', maxUsd: 75000, label: '$30k–$75k' },
  { key: 'middle', maxUsd: 150000, label: '$75k–$150k' },
  { key: 'upper_middle', maxUsd: 300000, label: '$150k–$300k' },
  { key: 'high', maxUsd: Infinity, label: '$300k+' },
];

export const IncomeNormalizationService = Object.freeze({
  /** Normalise income entered in any currency to a canonical USD value + metadata. */
  normalize(amount, currency = DEFAULT_CURRENCY) {
    const n = toNum(amount);
    const cur = CurrencyService.normalizeCode(currency);
    if (n == null) return { usd: null, original: { amount: null, currency: cur }, rate: CurrencyService.rate(cur), asOf: FX.asOf };
    const usd = Math.round(CurrencyService.convert(n, cur, 'USD'));
    return { usd, original: { amount: n, currency: cur }, rate: CurrencyService.rate(cur), asOf: FX.asOf };
  },
  bucket(usdIncome) {
    const n = toNum(usdIncome);
    if (n == null) return null;
    return INCOME_BUCKETS_USD.find((b) => n < b.maxUsd) || INCOME_BUCKETS_USD[INCOME_BUCKETS_USD.length - 1];
  },
  buckets() { return INCOME_BUCKETS_USD.slice(); },
});
