import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { CurrencyService, MoneyService, DEFAULT_CURRENCY } from '../lib/money.mjs';

/**
 * Single hook every page uses for money display. It resolves the viewer's
 * preferred currency (persisted on the user) and exposes formatters bound to it,
 * so no page ever hard-codes a symbol or conversion.
 */
export function usePreferredCurrency() {
  const { user, refreshUser } = useAuth();
  const preferred: string = CurrencyService.normalizeCode(user?.preferred_currency || DEFAULT_CURRENCY);

  // Format an amount expressed in `localCurrency` (defaults to USD, the canonical
  // storage currency) as dual: primary in the viewer's preferred currency,
  // secondary in the local currency.
  const formatMoney = useCallback(
    (amount: number | null | undefined, localCurrency: string = DEFAULT_CURRENCY) =>
      MoneyService.formatDual(amount as number, localCurrency, preferred),
    [preferred],
  );

  // Single-currency format in the preferred currency (amount already in it).
  const formatPreferred = useCallback(
    (amount: number | null | undefined) => MoneyService.format(amount as number, preferred),
    [preferred],
  );

  const setPreferredCurrency = useCallback(async (code: string) => {
    await api.updatePreferredCurrency(code);
    await refreshUser();
  }, [refreshUser]);

  return {
    preferred,
    formatMoney,
    formatPreferred,
    setPreferredCurrency,
    fxNote: MoneyService.fxNote(preferred),
    currencyForCountry: CurrencyService.forCountry,
  };
}
