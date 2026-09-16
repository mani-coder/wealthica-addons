import type { Position, SecurityType } from '../types';
import { chunkArray, getLocalCache, getYahooSymbol, setLocalCache } from './common';
import { isCrypto, mapQuoteTypeToSecurityType } from './securityHelpers';

type QuoteTypeData = {
  symbol: string;
  quoteType: string;
  timestamp: number;
};

const QUOTE_TYPE_CACHE_KEY = 'position_type_cache';
const CACHE_EXPIRY_DAYS = 7;
const CHUNK_SIZE = 25;

/**
 * Load quote type cache from localStorage
 */
function loadQuoteTypeCache(): Map<string, QuoteTypeData> {
  const cache = new Map<string, QuoteTypeData>();
  const stored = getLocalCache(QUOTE_TYPE_CACHE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      Object.entries(parsed).forEach(([symbol, data]: [string, any]) => {
        if (data.timestamp && now - data.timestamp < expiryTime) {
          cache.set(symbol, data as QuoteTypeData);
        }
      });
    } catch (error) {
      console.error('Error loading quote type cache:', error);
    }
  }

  return cache;
}

/**
 * Save quote type cache to localStorage
 */
function saveQuoteTypeCache(cache: Map<string, QuoteTypeData>): void {
  const obj = Object.fromEntries(cache);
  setLocalCache(QUOTE_TYPE_CACHE_KEY, JSON.stringify(obj));
}

/**
 * Resolve Yahoo quote types in batches so historical holdings can be classified
 * even when they no longer appear in the current positions response.
 */
export async function getSecurityTypesForSymbols(symbols: string[]): Promise<Map<string, SecurityType>> {
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  const quoteTypeCache = loadQuoteTypeCache();
  const typeMap = new Map<string, SecurityType>();
  const symbolsToFetch: string[] = [];

  uniqueSymbols.forEach((symbol) => {
    const cached = quoteTypeCache.get(symbol);
    if (cached) {
      typeMap.set(symbol, mapQuoteTypeToSecurityType(cached.quoteType));
    } else {
      symbolsToFetch.push(symbol);
    }
  });

  if (symbolsToFetch.length > 0) {
    const chunks = chunkArray(symbolsToFetch, CHUNK_SIZE);
    const timestamp = Date.now();
    await Promise.all(
      chunks.map(async (chunk) => {
        const symbolsParam = chunk.join(',');
        const url = `https://finance-api.mani-coder.dev/api/quote?symbols=${encodeURIComponent(
          symbolsParam,
        )}&fields=quoteType`;

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const data = await response.json();
          if (!Array.isArray(data)) return;
          data.forEach((item: any) => {
            if (!item.symbol) return;
            const quoteType = item.quoteType || 'EQUITY';
            quoteTypeCache.set(item.symbol, { symbol: item.symbol, quoteType, timestamp });
            typeMap.set(item.symbol, mapQuoteTypeToSecurityType(quoteType));
          });
        } catch (error) {
          console.error(`Error fetching quote types for ${symbolsParam}:`, error);
        }
      }),
    );
    saveQuoteTypeCache(quoteTypeCache);
  }

  return typeMap;
}

/**
 * Enrich positions with security type information from Yahoo Finance API
 * This function modifies positions in-place by adding the 'type' field
 */
export async function enrichPositionsWithType(positions: Position[]): Promise<void> {
  // Filter out crypto positions - they don't need API calls
  const nonCryptoPositions = positions.filter((position) => !isCrypto(position));

  // Set crypto type immediately
  positions.forEach((position) => {
    if (isCrypto(position)) {
      position.type = 'crypto';
    }
  });

  if (nonCryptoPositions.length === 0) {
    return;
  }

  const symbols = nonCryptoPositions.map((position) => getYahooSymbol(position.security));
  const typeMap = await getSecurityTypesForSymbols(symbols);

  // Apply types to positions
  positions.forEach((position) => {
    if (!isCrypto(position)) {
      const yahooSymbol = getYahooSymbol(position.security);
      position.type = typeMap.get(yahooSymbol) || 'unknown';
    }
  });
}
