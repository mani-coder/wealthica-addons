import { useCallback } from 'react';
import { chunkArray, getLocalCache, setLocalCache } from '../utils/common';

export type FundSectorWeighting = {
  symbol: string;
  sectorWeightings: Record<string, number>;
  timestamp?: number;
};

const SECTOR_WEIGHTING_CACHE_KEY = 'fund_sector_weighting_cache';
const CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days (refreshed weekly)
const CHUNK_SIZE = 25; // API request batch size

/**
 * Simple in-memory cache for fund data (ETFs, mutual funds)
 */
const sectorWeightingCache = new Map<string, FundSectorWeighting>();

/**
 * Load cache from localStorage
 */
function loadCache<T>(cacheKey: string): Map<string, T> {
  const cache = new Map<string, T>();
  const stored = getLocalCache(cacheKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      Object.entries(parsed).forEach(([symbol, data]: [string, any]) => {
        // Check if cache entry is still valid
        if (data.timestamp && now - data.timestamp < expiryTime) {
          cache.set(symbol, data as T);
        }
      });
    } catch (error) {
      console.error(`Error loading cache from localStorage (${cacheKey}):`, error);
    }
  }
  return cache;
}

/**
 * Save cache to localStorage
 */
function saveCache<T>(cacheKey: string, cache: Map<string, T>): void {
  const obj = Object.fromEntries(cache);
  setLocalCache(cacheKey, JSON.stringify(obj));
}

/**
 * Initialize caches from localStorage on first load
 */
let cacheInitialized = false;
function initializeCache(): void {
  if (!cacheInitialized) {
    const storedWeightings = loadCache<FundSectorWeighting>(SECTOR_WEIGHTING_CACHE_KEY);
    storedWeightings.forEach((value, key) => {
      sectorWeightingCache.set(key, value);
    });

    cacheInitialized = true;
  }
}

/**
 * Normalize sector names from Yahoo Finance to match our sector naming convention
 */
function normalizeSectorName(sectorKey: string): string {
  const sectorMap: Record<string, string> = {
    realestate: 'Real Estate',
    consumer_cyclical: 'Consumer Cyclical',
    basic_materials: 'Basic Materials',
    consumer_defensive: 'Consumer Defensive',
    technology: 'Technology',
    communication_services: 'Communication Services',
    financial_services: 'Financial Services',
    utilities: 'Utilities',
    industrials: 'Industrials',
    energy: 'Energy',
    healthcare: 'Healthcare',
  };
  return sectorMap[sectorKey] || sectorKey;
}

/**
 * Custom hook for fetching fund data (ETFs, mutual funds) from the finance API
 * Security types are identified in App.tsx, so this hook only handles fund-specific data like sector weightings
 */
export function useFundData() {
  /**
   * Fetch sector weightings for fund symbols (ETFs, mutual funds)
   */
  const fetchFundSectorWeightings = useCallback(
    async (symbols: string[]): Promise<Map<string, Record<string, number>>> => {
      // Handle empty array case
      if (symbols.length === 0) {
        return new Map<string, Record<string, number>>();
      }

      initializeCache();

      const result = new Map<string, Record<string, number>>();
      const symbolsToFetch: string[] = [];

      // Check cache first
      symbols.forEach((symbol) => {
        const cached = sectorWeightingCache.get(symbol);
        if (cached) {
          result.set(symbol, cached.sectorWeightings);
        } else {
          symbolsToFetch.push(symbol);
        }
      });

      // If all symbols are cached, return immediately
      if (symbolsToFetch.length === 0) {
        return result;
      }

      try {
        const chunks = chunkArray(symbolsToFetch, CHUNK_SIZE);
        const timestamp = Date.now();

        await Promise.all(
          chunks.map(async (chunk) => {
            const symbolsParam = chunk.join(',');
            const url = `https://finance-api.mani-coder.dev/api/quoteSummary?symbols=${encodeURIComponent(
              symbolsParam,
            )}&modules=topHoldings`;

            try {
              const response = await fetch(url);
              const data = await response.json();

              if (Array.isArray(data)) {
                data.forEach((item: any) => {
                  const sectorWeightings: Record<string, number> = {};
                  const rawWeightings = item.data?.topHoldings?.sectorWeightings;

                  if (Array.isArray(rawWeightings)) {
                    rawWeightings.forEach((weighting: any) => {
                      const [sectorKey, value] = Object.entries(weighting)[0];
                      const normalizedSector = normalizeSectorName(sectorKey as string);
                      sectorWeightings[normalizedSector] = value as number;
                    });
                  }

                  const weightingData: FundSectorWeighting = {
                    symbol: item.symbol,
                    sectorWeightings,
                    timestamp,
                  };

                  sectorWeightingCache.set(item.symbol, weightingData);
                  result.set(item.symbol, sectorWeightings);
                });
              }
            } catch (chunkError) {
              console.error('Error fetching fund sector weightings for chunk:', chunkError);
            }
          }),
        );

        saveCache(SECTOR_WEIGHTING_CACHE_KEY, sectorWeightingCache);
      } catch (error) {
        console.error('Error fetching fund sector weightings:', error);
      }

      return result;
    },
    [],
  );

  return { fetchFundSectorWeightings };
}
