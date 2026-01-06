import type { Dayjs } from 'dayjs';
import { useCallback } from 'react';
import { DATE_FORMAT, USE_WEALTHICA_API_FOR_SECURITY_HISTORY } from '../constants';
import { useAddon } from '../context/AddonContext';
import dayjs from '../dayjs';
import { buildCorsFreeUrl, getDate, getPreviousTradingDay, isTradingDay } from '../utils/common';

export type SecurityPriceData = {
  timestamp: Dayjs;
  closePrice: number;
};

/**
 * Parse security price response from Wealthica API
 * Shared utility function used by both hooks and direct API calls
 */
function parseWealthicaSecurityPriceResponse(response: any, maxChangePercentage: number = 50): SecurityPriceData[] {
  let date = getDate(response.to);
  const data: SecurityPriceData[] = [];
  let prevPrice: number | undefined;

  // Get today's date in local time to exclude current day (closing price not available)
  const today = dayjs().startOf('day');

  // Don't filter before iterating - we need to maintain date alignment
  [...response.data].reverse().forEach((rawClosePrice: number) => {
    // Skip null/zero values but still subtract the day to maintain alignment
    if (!rawClosePrice) {
      date = date.subtract(1, 'days');
      return;
    }

    if (!prevPrice) {
      prevPrice = rawClosePrice;
    }

    // Filter out anomalous price changes
    const changePercentage = Math.abs((rawClosePrice - prevPrice) / prevPrice) * 100;
    const adjustedClosePrice = changePercentage > maxChangePercentage ? prevPrice : rawClosePrice;

    // Only include trading days (exclude weekends, holidays, and current date)
    if (isTradingDay(date) && date.isBefore(today)) {
      data.push({ timestamp: date.clone(), closePrice: adjustedClosePrice });
    }

    date = date.subtract(1, 'days');
    prevPrice = adjustedClosePrice;
  });

  return data.sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());
}

async function fetchSecurityHistoryFromFinanceApi(
  yahooSymbol: string,
  fromDate: Dayjs,
  toDate: Dayjs,
): Promise<SecurityPriceData[]> {
  // curl 'https://finance-api.mani-coder.dev/api/historical?symbol=NVDA&period1=2024-01-01&period2=2026-01-05&interval=1d'
  const url = `https://finance-api.mani-coder.dev/api/historical?symbol=${encodeURIComponent(yahooSymbol)}&period1=${fromDate.format(DATE_FORMAT)}&period2=${toDate.format(DATE_FORMAT)}&interval=1d`;
  // [
  // {
  //   "date": "2024-01-02T14:30:00.000Z",
  //   "high": 49.29499816894531,
  //   "volume": 411254000,
  //   "open": 49.24399948120117,
  //   "low": 47.595001220703125,
  //   "close": 48.167999267578125,
  //   "adjClose": 48.141178131103516
  // }]
  const response = await fetch(url)
    .then((res) => res.json())
    .then((data) => {
      return data.map((item: any) => ({
        timestamp: dayjs(item.date),
        closePrice: item.close,
      }));
    });
  return response;
}

export type UseSecurityHistoryOptions = {
  /**
   * Maximum allowed price change percentage to filter out anomalous data
   * Daily changes exceeding this threshold are replaced with the previous day's price
   * @default 50
   */
  maxChangePercentage?: number;
};

/**
 * Simple in-memory cache for security price history
 * Lives for the entire SPA session
 */
const securityHistoryCache = new Map<string, SecurityPriceData[]>();

/**
 * Generate cache key from request parameters
 */
function getCacheKey(securityId: string, fromDate: Dayjs, toDate: Dayjs): string {
  return `${securityId}:${fromDate.format(DATE_FORMAT)}:${toDate.format(DATE_FORMAT)}`;
}

type Symbol = {
  securityId: string;
  yahooSymbol: string;
};

/**
 * Custom hook for fetching security price history data
 * Returns a function that fetches and parses security price data from Wealthica API
 * Includes in-memory caching to avoid redundant API calls (e.g., for benchmarks)
 */
export function useSecurityHistory(options: UseSecurityHistoryOptions = {}) {
  const addon = useAddon();
  const { maxChangePercentage = 50 } = options;

  const fetchSecurityHistory = useCallback(
    async (symbol: Symbol, fromDate: Dayjs, toDate: Dayjs): Promise<SecurityPriceData[]> => {
      const adjustedToDate = isTradingDay(toDate) ? toDate : getPreviousTradingDay(toDate);

      // Check cache first (using adjusted dates)
      const cacheKey = getCacheKey(symbol.securityId, fromDate, adjustedToDate);
      const cached = securityHistoryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      console.debug('Fetching security history for', {
        symbol: symbol.yahooSymbol,
        fromDate: fromDate.format(DATE_FORMAT),
        toDate: adjustedToDate.format(DATE_FORMAT),
        securityId: symbol.securityId,
      });

      if (USE_WEALTHICA_API_FOR_SECURITY_HISTORY) {
        const endpoint = `securities/${symbol.securityId}/history?from=${fromDate.format(DATE_FORMAT)}&to=${adjustedToDate.format(
          DATE_FORMAT,
        )}`;
        let response: any;
        if (addon) {
          response = await addon.request({ query: {}, method: 'GET', endpoint });
        } else {
          const url = buildCorsFreeUrl(`https://app.wealthica.com/api/${endpoint}`);
          const fetchResponse = await fetch(url, {
            cache: 'force-cache',
            headers: { 'Content-Type': 'application/json' },
          });
          response = await fetchResponse.json();
        }

        // Parse the response using shared parsing logic
        const data = parseWealthicaSecurityPriceResponse(response, maxChangePercentage);

        // Store in cache
        securityHistoryCache.set(cacheKey, data);
      } else {
        const data = await fetchSecurityHistoryFromFinanceApi(symbol.yahooSymbol, fromDate, adjustedToDate);
        securityHistoryCache.set(cacheKey, data);
        return data;
      }

      return securityHistoryCache.get(cacheKey) || [];
    },
    [addon, maxChangePercentage],
  );

  return { fetchSecurityHistory };
}
