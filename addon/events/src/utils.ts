import type { Color, EventSymbol, EventType } from 'types';
import { COLORS } from './constants';

const colorCache: { [K: string]: Color } = {};
let lastUsedColorIdx: number = -1;
export function getColorForSymbol(symbol: string) {
  if (!colorCache[symbol]) {
    lastUsedColorIdx += 1;
    colorCache[symbol] = COLORS[lastUsedColorIdx % COLORS.length];
  }
  return colorCache[symbol];
}

export const getSymbolFromNASDAQTicker = (ticker: string) =>
  ticker.startsWith('TSE:') ? `${ticker.replace('TSE:', '')}.TO` : ticker;

export function getColorForEvent(event: EventType): Color {
  return event === 'ex-dividend' ? 'pink' : event === 'pay-dividend' ? 'green' : 'blue';
}

export function getDisplaySymbol(symbol: EventSymbol) {
  switch (symbol.type) {
    case 'earning':
      return symbol.symbol;

    case 'ex-dividend':
      return `EX:${symbol.symbol}`;

    case 'record-dividend':
      return `RD:${symbol.symbol}`;

    case 'pay-dividend':
      return `PD:${symbol.symbol}`;
  }
}
