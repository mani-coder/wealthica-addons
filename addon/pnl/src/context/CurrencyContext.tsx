/* eslint-disable react-hooks/refs */
import type { Dayjs } from 'dayjs';
import { createContext, type ReactNode, useCallback } from 'react';
import { DATE_FORMAT, DEFAULT_BASE_CURRENCY } from '../constants';
import type { CurrencyCache } from '../types';

export type CurrencyRef = React.RefObject<Currencies> & { readonly current: Currencies };

interface CurrencyContextType {
  baseCurrency: string;
  baseCurrencyDisplay: string;
  allCurrencies: string[];
  getValue: (from: string, value: number, date?: string | Dayjs) => number;
  currencies: Currencies;
}

function getCurrencyValue(
  baseCurrency: string,
  currencyCache: CurrencyCache,
  latestCurrencies: { [K: string]: number },
  from: string,
  value: number,
  date?: string | Dayjs,
) {
  const currency = from.toLowerCase();
  if (currency === baseCurrency || !value) return value;

  const _currencyCache = currencyCache[currency];
  let multiplier: number | undefined;
  if (date) {
    multiplier = _currencyCache[typeof date === 'string' ? date : date.format(DATE_FORMAT)];
  }
  multiplier = multiplier ?? latestCurrencies[currency] ?? 1;
  return value * multiplier;
}

export class Currencies {
  baseCurrency: string = DEFAULT_BASE_CURRENCY;
  currencyCache: CurrencyCache = {};
  latestCurrencies: { [K: string]: number } = {};

  constructor(baseCurrency: string, currencyCache: CurrencyCache) {
    this.setBaseCurrency(baseCurrency);
    this.setCurrencyCache(currencyCache);
  }

  setBaseCurrency(currency: string) {
    this.baseCurrency = currency.toLowerCase();
  }

  setCurrencyCache(currencyCache: CurrencyCache) {
    this.currencyCache = currencyCache;
    this.latestCurrencies = Object.keys(currencyCache).reduce(
      (hash, currency) => {
        const _currencyCache = currencyCache[currency];
        const latestDate = Object.keys(_currencyCache).sort((a, b) => b.localeCompare(a))[0];
        hash[currency] = _currencyCache[latestDate] ?? 1;
        return hash;
      },
      { [this.baseCurrency]: 1 } as { [K: string]: number },
    );
  }

  getValue(from: string, value: number, date?: string | Dayjs): number {
    return getCurrencyValue(this.baseCurrency, this.currencyCache, this.latestCurrencies, from, value, date);
  }
}

const defaultCurrencies = new Currencies(DEFAULT_BASE_CURRENCY, {});

const CurrencyContext = createContext<CurrencyContextType>({
  baseCurrency: DEFAULT_BASE_CURRENCY,
  baseCurrencyDisplay: DEFAULT_BASE_CURRENCY.toUpperCase(),
  allCurrencies: [DEFAULT_BASE_CURRENCY],
  getValue: (_from, value) => value,
  currencies: defaultCurrencies,
});

export const CurrencyContextProvider = ({
  children,
  currencyRef,
}: {
  children: ReactNode;
  currencyRef: CurrencyRef;
}) => {
  const getValue = useCallback(
    (from: string, value: number, date?: string | Dayjs): number => {
      return getCurrencyValue(
        currencyRef.current.baseCurrency,
        currencyRef.current.currencyCache,
        currencyRef.current.latestCurrencies,
        from,
        value,
        date,
      );
    },
    [currencyRef],
  );

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency: currencyRef.current.baseCurrency,
        baseCurrencyDisplay: currencyRef.current.baseCurrency.toUpperCase(),
        allCurrencies: Object.keys(currencyRef.current.latestCurrencies),
        getValue,
        currencies: currencyRef.current,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyContext;
