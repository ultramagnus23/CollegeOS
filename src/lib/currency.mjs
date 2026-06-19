// ============================================================================
// Dual-currency (USD ⇄ INR) helpers. CollegeOS serves Indian students applying
// abroad, so costs are shown in BOTH currencies with the FX rate + date stated.
//
// FX strategy: a fixed daily snapshot (no live FX call in this build). The rate
// and date are surfaced in the UI via `FX` so the number is auditable and never
// silently stale. Swap `FX.rate` for a cached live rate when an FX feed is wired.
// ============================================================================

export const FX = Object.freeze({
  // USD -> INR. Update via the daily snapshot job; UI shows asOf so it's never silently stale.
  rate: 83.3,
  asOf: '2026-06-01',
  source: 'fixed daily snapshot (USD→INR)',
});

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function usdToInr(usd, rate = FX.rate) {
  const n = toNum(usd);
  return n == null ? null : Math.round(n * rate);
}

export function inrToUsd(inr, rate = FX.rate) {
  const n = toNum(inr);
  return n == null ? null : Math.round(n / rate);
}

export function formatUsd(usd) {
  const n = toNum(usd);
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// Indian numbering: ₹X.XCr (>=1 crore), ₹X.XL (>=1 lakh), else grouped rupees.
export function formatInr(inr) {
  const n = toNum(inr);
  if (n == null) return null;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Format a USD amount in both currencies, e.g. "$60,000 · ₹49.98L".
 * @param {number} usd
 * @param {{ primary?: 'usd'|'inr', rate?: number }} [opts]
 */
export function formatDualFromUsd(usd, opts = {}) {
  const n = toNum(usd);
  if (n == null) return null;
  const rate = opts.rate || FX.rate;
  const usdStr = formatUsd(n);
  const inrStr = formatInr(usdToInr(n, rate));
  return opts.primary === 'inr' ? `${inrStr} · ${usdStr}` : `${usdStr} · ${inrStr}`;
}

/**
 * Canonicalise a user income entered in either currency to a stored USD value
 * plus the rate/date used (so it can be re-displayed faithfully later).
 * @param {number} amount @param {'usd'|'inr'} currency
 */
export function canonicalizeIncome(amount, currency) {
  const n = toNum(amount);
  if (n == null) return { usd: null, inr: null, rate: FX.rate, asOf: FX.asOf };
  const usd = currency === 'inr' ? inrToUsd(n) : Math.round(n);
  return { usd, inr: usdToInr(usd), rate: FX.rate, asOf: FX.asOf };
}

export const FX_NOTE = `FX: $1 = ₹${FX.rate} (as of ${FX.asOf})`;
