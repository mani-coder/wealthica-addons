import type { Color, DividendEventSymbol } from 'types';
import { COLORS } from './constants';

export const getSymbolFromNASDAQTicker = (ticker: string) =>
  ticker.startsWith('TSE:') ? `${ticker.replace('TSE:', '')}.TO` : ticker;

const colorCache: { [K: string]: Color } = {};
let lastUsedColorIdx: number = -1;
export function getColorForSymbol(symbol: string) {
  if (!colorCache[symbol]) {
    lastUsedColorIdx += 1;
    colorCache[symbol] = COLORS[lastUsedColorIdx % COLORS.length];
  }
  return colorCache[symbol];
}

export function getDisplaySymbol(symbol: DividendEventSymbol) {
  return `${symbol.type === 'ex-dividend' ? 'EX' : symbol.type === 'pay-dividend' ? 'PD' : 'RD'}: ${symbol.symbol}`;
}
