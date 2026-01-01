import type { Dayjs } from 'dayjs';
import { useCallback } from 'react';
import { DATE_FORMAT } from '../constants';
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
function parseSecurityPriceResponse(response: any, maxChangePercentage: number = 50): SecurityPriceData[] {
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

/**
 * Custom hook for fetching security price history data
 * Returns a function that fetches and parses security price data from Wealthica API
 * Includes in-memory caching to avoid redundant API calls (e.g., for benchmarks)
 */
export function useSecurityHistory(options: UseSecurityHistoryOptions = {}) {
  const addon = useAddon();
  const { maxChangePercentage = 50 } = options;

  const fetchSecurityHistory = useCallback(
    async (securityId: string, fromDate: Dayjs, toDate: Dayjs): Promise<SecurityPriceData[]> => {
      // Adjust dates to previous trading day if they fall on holidays/weekends
      const adjustedFromDate = isTradingDay(fromDate) ? fromDate : getPreviousTradingDay(fromDate);
      const adjustedToDate = isTradingDay(toDate) ? toDate : getPreviousTradingDay(toDate);

      // Check cache first (using adjusted dates)
      const cacheKey = getCacheKey(securityId, adjustedFromDate, adjustedToDate);
      const cached = securityHistoryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const endpoint = `securities/${securityId}/history?from=${adjustedFromDate.format(DATE_FORMAT)}&to=${adjustedToDate.format(
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
      const data = parseSecurityPriceResponse(response, maxChangePercentage);

      // Store in cache
      securityHistoryCache.set(cacheKey, data);

      return data;
    },
    [addon, maxChangePercentage],
  );

  return { fetchSecurityHistory };
}
