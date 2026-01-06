import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useMemo, useRef, useState } from 'react';
import useCurrency from '@/hooks/useCurrency';
import type { Position } from '@/types';
import { DATE_FORMAT } from '../../constants';
import { buildCorsFreeUrl, getNasdaqTicker } from '../../utils/common';
import type { Dividend, Earning } from './types';

type CachedData = {
  dividends: Dividend[];
  earnings: Earning[];
  startDate?: Dayjs;
  endDate?: Dayjs;
};

/**
 * Custom hook to manage portfolio events (dividends and earnings) with simple caching.
 * Maintains a continuous date range and extends it when needed.
 */
export function usePortfolioEvents(positions: Position[]) {
  const { getValue: convertCurrency } = useCurrency();
  const { symbolToPosition, symbols } = useMemo(() => {
    const symbolToPosition = positions
      .filter((position) => {
        const symbol = position.security.symbol || position.security.name;
        return !(symbol.includes('-') || position.security.type === 'crypto');
      })
      .reduce(
        (hash, position) => {
          hash[getNasdaqTicker(position.security)] = position;
          return hash;
        },
        {} as { [key: string]: Position },
      );
    return { symbolToPosition, symbols: Object.keys(symbolToPosition).join(',') };
  }, [positions]);

  const [loading, setLoading] = useState(false);

  // Cache to store fetched data and date range
  const cacheRef = useRef<CachedData>({ dividends: [], earnings: [] });

  /**
   * Merge new data with cached data (deduplicates by key)
   */
  const mergeData = useCallback(
    (newDividends: Dividend[], newEarnings: Earning[]) => {
      // Merge dividends (deduplicate by ticker + exDate)
      const dividendMap = new Map(cacheRef.current.dividends.map((d) => [`${d.ticker}-${d.exDate}`, d]));
      newDividends.forEach((d) => {
        const position = symbolToPosition[d.ticker];
        const estimatedIncome =
          position && d.amount > 0 && position.quantity > 0
            ? convertCurrency(position.security.currency, d.amount * position.quantity)
            : undefined;
        dividendMap.set(`${d.ticker}-${d.exDate}`, { ...d, position, estimatedIncome });
      });
      cacheRef.current.dividends = Array.from(dividendMap.values());

      // Merge earnings (deduplicate by ticker + date)
      const earningMap = new Map(cacheRef.current.earnings.map((e) => [`${e.ticker}-${e.date}`, e]));
      newEarnings.forEach((e) => {
        earningMap.set(`${e.ticker}-${e.date}`, { ...e, position: symbolToPosition[e.ticker] });
      });
      cacheRef.current.earnings = Array.from(earningMap.values());
    },
    [symbolToPosition],
  );

  /**
   * Fetch portfolio events for a specific date range
   */
  const fetchPortfolioEvents = useCallback(
    async (requestedStart: Dayjs, requestedEnd: Dayjs) => {
      if (!symbols) {
        return;
      }

      const requestedStartStr = requestedStart.format(DATE_FORMAT);
      const requestedEndStr = requestedEnd.format(DATE_FORMAT);
      setLoading(true);

      // Check if requested range is already cached
      if (
        cacheRef.current.startDate &&
        cacheRef.current.endDate &&
        dayjs(requestedStartStr).isSameOrAfter(cacheRef.current.startDate) &&
        dayjs(requestedEndStr).isSameOrBefore(cacheRef.current.endDate)
      ) {
        console.debug('Date range already cached, using cached data', {
          cachedRange: { start: cacheRef.current.startDate, end: cacheRef.current.endDate },
          requestedRange: { start: requestedStartStr, end: requestedEndStr },
        });
        setLoading(false);
        return;
      }

      try {
        // Determine what to fetch - extend the range if needed
        let fetchStart = requestedStartStr;
        let fetchEnd = requestedEndStr;

        if (cacheRef.current.startDate && cacheRef.current.endDate) {
          // Extend the range
          fetchStart =
            cacheRef.current.startDate && dayjs(requestedStartStr).isBefore(cacheRef.current.startDate)
              ? requestedStartStr
              : cacheRef.current.startDate.format(DATE_FORMAT);
          fetchEnd =
            cacheRef.current.endDate && dayjs(requestedEndStr).isAfter(cacheRef.current.endDate)
              ? requestedEndStr
              : cacheRef.current.endDate.format(DATE_FORMAT);
        }

        const url = buildCorsFreeUrl(
          `https://portfolio.nasdaq.com/api/portfolio/getPortfolioEvents/?fromDate=${fetchStart}&toDate=${fetchEnd}&tickers=${symbols}`,
        );

        const response = await fetch(url, {
          cache: 'force-cache',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();

        if (data) {
          // Merge with cache
          mergeData(data.dividends || [], data.earnings || []);

          // Update cache range
          cacheRef.current.startDate = dayjs(fetchStart).startOf('day');
          cacheRef.current.endDate = dayjs(fetchEnd).endOf('day');

          console.debug('Portfolio events fetched and cached', {
            cachedRange: { start: cacheRef.current.startDate, end: cacheRef.current.endDate },
            totalDividends: cacheRef.current.dividends.length,
            totalEarnings: cacheRef.current.earnings.length,
            requestedRange: { start: requestedStartStr, end: requestedEndStr },
          });
        }
      } catch (error) {
        console.error('Failed to load events', error);
      } finally {
        setLoading(false);
      }
    },
    [symbols, mergeData],
  );

  return {
    dividends: cacheRef.current.dividends,
    earnings: cacheRef.current.earnings,
    loading,
    fetchPortfolioEvents,
    symbols,
    startDate: cacheRef.current.startDate,
    endDate: cacheRef.current.endDate,
  };
}
