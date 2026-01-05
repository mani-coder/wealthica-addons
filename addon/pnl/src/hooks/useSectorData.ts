import { useCallback } from 'react';
import { getLocalCache, setLocalCache } from '../utils/common';

export type SectorData = {
  symbol: string;
  sector: string;
  industry: string;
  timestamp?: number; // Added for cache expiration
};

const CACHE_KEY = 'sector_data_cache';
const CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
const CHUNK_SIZE = 25; // Fetch 25 symbols per request for better reliability

/**
 * Simple in-memory cache for sector data
 * Lives for the entire SPA session
 */
const sectorDataCache = new Map<string, SectorData>();

/**
 * Load cache from localStorage
 */
function loadCacheFromStorage(): Map<string, SectorData> {
  const cache = new Map<string, SectorData>();
  const stored = getLocalCache(CACHE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      Object.entries(parsed).forEach(([symbol, data]: [string, any]) => {
        // Check if cache entry is still valid
        if (data.timestamp && now - data.timestamp < expiryTime) {
          cache.set(symbol, data as SectorData);
        }
      });
    } catch (error) {
      console.error('Error loading sector data cache from localStorage:', error);
    }
  }
  return cache;
}

/**
 * Save cache to localStorage
 */
function saveCacheToStorage(cache: Map<string, SectorData>): void {
  const obj = Object.fromEntries(cache);
  setLocalCache(CACHE_KEY, JSON.stringify(obj));
}

/**
 * Chunk array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Initialize cache from localStorage on first load
 */
let cacheInitialized = false;
function initializeCache(): void {
  if (!cacheInitialized) {
    const stored = loadCacheFromStorage();
    stored.forEach((value, key) => {
      sectorDataCache.set(key, value);
    });
    cacheInitialized = true;
  }
}

/**
 * Custom hook for fetching sector data from the finance API
 * Returns a function that fetches and caches sector information for a list of symbols
 * Automatically chunks requests into groups of 25 symbols
 * Caches data in both memory and localStorage with 7-day expiry
 */
export function useSectorData() {
  const fetchSectorData = useCallback(async (symbols: string[]): Promise<Map<string, SectorData>> => {
    // Handle empty array case
    if (symbols.length === 0) {
      return new Map<string, SectorData>();
    }

    // Initialize cache from localStorage on first call
    initializeCache();

    const result = new Map<string, SectorData>();
    const symbolsToFetch: string[] = [];

    // Check cache first (both memory and localStorage)
    symbols.forEach((symbol) => {
      const cached = sectorDataCache.get(symbol);
      if (cached) {
        result.set(symbol, cached);
      } else {
        symbolsToFetch.push(symbol);
      }
    });

    // If all symbols are cached, return immediately
    if (symbolsToFetch.length === 0) {
      return result;
    }

    try {
      // Chunk symbols into groups of 25
      const chunks = chunkArray(symbolsToFetch, CHUNK_SIZE);
      const timestamp = Date.now();

      // Fetch all chunks in parallel
      await Promise.all(
        chunks.map(async (chunk) => {
          const symbolsParam = chunk.join(',');
          const url = `https://finance-api.mani-coder.dev/api/quoteSummary?symbols=${encodeURIComponent(
            symbolsParam,
          )}&modules=summaryProfile`;

          try {
            const response = await fetch(url);
            const data = await response.json();

            // Process response and update cache
            if (Array.isArray(data)) {
              data.forEach((item: any) => {
                const sectorData: SectorData = {
                  symbol: item.symbol,
                  sector: item.data?.summaryProfile?.sector || 'Unknown',
                  industry: item.data?.summaryProfile?.industry || 'Unknown',
                  timestamp,
                };

                sectorDataCache.set(item.symbol, sectorData);
                result.set(item.symbol, sectorData);
              });
            }
          } catch (chunkError) {
            console.error('Error fetching sector data for chunk:', chunkError);
            // For symbols in this chunk that failed, add them with "Unknown" sector
            chunk.forEach((symbol) => {
              const fallbackData: SectorData = {
                symbol,
                sector: 'Unknown',
                industry: 'Unknown',
                timestamp,
              };
              result.set(symbol, fallbackData);
            });
          }
        }),
      );

      // Save updated cache to localStorage
      saveCacheToStorage(sectorDataCache);
    } catch (error) {
      console.error('Error fetching sector data:', error);
      const timestamp = Date.now();
      // For symbols that failed to fetch, add them with "Unknown" sector
      symbolsToFetch.forEach((symbol) => {
        const fallbackData: SectorData = {
          symbol,
          sector: 'Unknown',
          industry: 'Unknown',
          timestamp,
        };
        result.set(symbol, fallbackData);
      });
    }

    return result;
  }, []);

  return { fetchSectorData };
}
