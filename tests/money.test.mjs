import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyService, MoneyService, IncomeNormalizationService, SUPPORTED_CURRENCIES } from '../src/lib/money.mjs';

test('supports the full currency set', () => {
  for (const c of ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'HKD', 'KRW', 'JPY', 'CHF']) {
    assert.ok(SUPPORTED_CURRENCIES.includes(c), `${c} supported`);
    assert.ok(CurrencyService.isSupported(c));
  }
  assert.equal(CurrencyService.normalizeCode('xxx'), 'USD'); // unknown → default
});

test('convert round-trips via USD base', () => {
  const inr = CurrencyService.convert(1000, 'USD', 'INR');
  assert.equal(Math.round(inr), Math.round(1000 * 83.3));
  assert.equal(Math.round(CurrencyService.convert(inr, 'INR', 'USD')), 1000);
  assert.equal(CurrencyService.convert(500, 'EUR', 'EUR'), 500); // same-currency identity
});

test('format uses per-currency conventions (INR lakh/crore)', () => {
  assert.equal(MoneyService.format(61000, 'USD'), '$61,000');
  assert.equal(MoneyService.format(5230000, 'INR'), '₹52.30L');
  assert.equal(MoneyService.format(12500000, 'INR'), '₹1.25Cr');
  assert.equal(MoneyService.format(48000, 'GBP'), '£48,000');
  assert.equal(MoneyService.format(61000, 'CAD'), 'CA$61,000');
  assert.equal(MoneyService.format(null, 'USD'), null);
});

test('formatDual: primary = preferred, secondary = local', () => {
  // USD cost shown to an INR-preferring user
  const s = MoneyService.formatDual(61000, 'USD', 'INR');
  assert.ok(s.startsWith('₹'), 'primary is INR');
  assert.ok(s.includes('($61,000)'), 'secondary is the USD local value');
  // same currency → single
  assert.equal(MoneyService.formatDual(61000, 'USD', 'USD'), '$61,000');
});

test('CurrencyService.forCountry maps countries to local currency', () => {
  assert.equal(CurrencyService.forCountry('US'), 'USD');
  assert.equal(CurrencyService.forCountry('India'), 'INR');
  assert.equal(CurrencyService.forCountry('United Kingdom'), 'GBP');
  assert.equal(CurrencyService.forCountry('Germany'), 'EUR');
  assert.equal(CurrencyService.forCountry('???'), 'USD');
});

test('income normalizes to USD and buckets compare regardless of entry currency', () => {
  const fromInr = IncomeNormalizationService.normalize(8330000, 'INR'); // ~$100k
  assert.equal(fromInr.usd, 100000);
  assert.equal(IncomeNormalizationService.bucket(fromInr.usd).key, 'middle');
  const fromUsd = IncomeNormalizationService.normalize(100000, 'USD');
  assert.equal(IncomeNormalizationService.bucket(fromUsd.usd).key, IncomeNormalizationService.bucket(fromInr.usd).key);
});
