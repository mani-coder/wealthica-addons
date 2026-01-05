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

  // Get unique Yahoo symbols
  const symbols = Array.from(new Set(nonCryptoPositions.map((position) => getYahooSymbol(position.security))));

  // Load cache
  const quoteTypeCache = loadQuoteTypeCache();
  const symbolsToFetch: string[] = [];
  const typeMap = new Map<string, SecurityType>();

  // Check cache first
  symbols.forEach((symbol) => {
    const cached = quoteTypeCache.get(symbol);
    if (cached) {
      typeMap.set(symbol, mapQuoteTypeToSecurityType(cached.quoteType));
    } else {
      symbolsToFetch.push(symbol);
    }
  });

  // Fetch missing symbols from API
  if (symbolsToFetch.length > 0) {
    try {
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
            const data = await response.json();

            if (Array.isArray(data)) {
              data.forEach((item: any) => {
                const quoteType = item.quoteType || 'EQUITY';
                const quoteTypeData: QuoteTypeData = {
                  symbol: item.symbol,
                  quoteType,
                  timestamp,
                };

                quoteTypeCache.set(item.symbol, quoteTypeData);
                typeMap.set(item.symbol, mapQuoteTypeToSecurityType(quoteType));
              });
            }
          } catch (chunkError) {
            console.error('Error fetching quote types for chunk:', chunkError);
          }
        }),
      );

      saveQuoteTypeCache(quoteTypeCache);
    } catch (error) {
      console.error('Error enriching positions with type:', error);
    }
  }

  // Apply types to positions
  positions.forEach((position) => {
    if (!isCrypto(position)) {
      const yahooSymbol = getYahooSymbol(position.security);
      position.type = typeMap.get(yahooSymbol) || 'unknown';
    }
  });
}
