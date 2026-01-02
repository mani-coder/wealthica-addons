/**
 * Benchmark Context
 *
 * Provides benchmark selection state with localStorage persistence.
 * Benchmark prices are automatically converted to the base currency.
 */

import type { Dayjs } from 'dayjs';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { getLocalCache, setLocalCache } from '@/utils/common';
import useCurrency from '../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../hooks/useSecurityHistory';
import type { BenchmarkInfo, BenchmarkType } from '../utils/benchmarkData';
import { BENCHMARKS } from '../utils/benchmarkData';

const STORAGE_KEY = 'pnl-benchmark-selection';
const DEFAULT_BENCHMARK: BenchmarkType = 'SPY';

interface BenchmarkContextType {
  selectedBenchmark: BenchmarkType;
  setSelectedBenchmark: (benchmark: BenchmarkType) => void;
  benchmarkInfo: BenchmarkInfo;
  fetchBenchmarkHistory: (fromDate: Dayjs, toDate: Dayjs) => Promise<SecurityPriceData[]>;
}

const BenchmarkContext = createContext<BenchmarkContextType | undefined>(undefined);

interface BenchmarkContextProviderProps {
  children: ReactNode;
}

export function BenchmarkContextProvider({ children }: BenchmarkContextProviderProps) {
  const { getValue: convertCurrency } = useCurrency();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });

  // Initialize benchmark from localStorage or default
  const [selectedBenchmark, setSelectedBenchmarkState] = useState<BenchmarkType>(() => {
    const stored = getLocalCache(STORAGE_KEY);
    if (stored && stored in BENCHMARKS) {
      return stored as BenchmarkType;
    }
    return DEFAULT_BENCHMARK;
  });

  // Persist benchmark selection to localStorage
  const setSelectedBenchmark = (benchmark: BenchmarkType) => {
    setSelectedBenchmarkState(benchmark);
    setLocalCache(STORAGE_KEY, benchmark);
  };

  // Get benchmark info
  const benchmarkInfo = useMemo((): BenchmarkInfo => {
    return BENCHMARKS[selectedBenchmark];
  }, [selectedBenchmark]);

  /**
   * Fetch benchmark price history and automatically convert to base currency
   */
  const fetchBenchmarkHistory = useCallback(
    async (fromDate: Dayjs, toDate: Dayjs): Promise<SecurityPriceData[]> => {
      // Fetch price history in the benchmark's security ID
      const priceHistory = await fetchSecurityHistory(benchmarkInfo.securityId, fromDate, toDate);

      // Convert each price point to base currency using the currency context
      return priceHistory.map((point) => ({
        timestamp: point.timestamp,
        closePrice: convertCurrency(benchmarkInfo.currency, point.closePrice, point.timestamp),
      }));
    },
    [benchmarkInfo, convertCurrency, fetchSecurityHistory],
  );

  return (
    <BenchmarkContext.Provider
      value={{ selectedBenchmark, setSelectedBenchmark, benchmarkInfo, fetchBenchmarkHistory }}
    >
      {children}
    </BenchmarkContext.Provider>
  );
}

/**
 * Hook to access benchmark context
 *
 * @returns Benchmark context with selected benchmark and currency-aware info
 */
export function useBenchmark() {
  const context = useContext(BenchmarkContext);
  if (!context) {
    throw new Error('useBenchmark must be used within BenchmarkContextProvider');
  }
  return context;
}
