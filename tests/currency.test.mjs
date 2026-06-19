import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX, usdToInr, inrToUsd, formatUsd, formatInr, formatDualFromUsd, canonicalizeIncome } from '../src/lib/currency.mjs';

test('USD↔INR round-trips at the stated rate', () => {
  assert.equal(usdToInr(1000), Math.round(1000 * FX.rate));
  assert.equal(inrToUsd(usdToInr(1000)), 1000);
});

test('formatUsd groups thousands', () => {
  assert.equal(formatUsd(60000), '$60,000');
  assert.equal(formatUsd(null), null);
});

test('formatInr uses lakh/crore', () => {
  assert.equal(formatInr(4998000), '₹49.98L');
  assert.equal(formatInr(12500000), '₹1.25Cr');
  assert.equal(formatInr(45000), '₹45,000');
});

test('formatDualFromUsd shows both currencies', () => {
  const s = formatDualFromUsd(60000);
  assert.ok(s.includes('$60,000'));
  assert.ok(s.includes('₹'));
});

test('canonicalizeIncome stores USD + rate/date regardless of entry currency', () => {
  const fromInr = canonicalizeIncome(2000000, 'inr');
  assert.equal(fromInr.usd, Math.round(2000000 / FX.rate));
  assert.equal(fromInr.asOf, FX.asOf);
  const fromUsd = canonicalizeIncome(50000, 'usd');
  assert.equal(fromUsd.usd, 50000);
  assert.equal(fromUsd.inr, Math.round(50000 * FX.rate));
});
