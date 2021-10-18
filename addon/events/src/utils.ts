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
  return event === 'earning'
    ? 'pink'
    : event === 'ex-dividend'
    ? 'blue'
    : event === 'pay-dividend'
    ? 'green'
    : 'indigo';
}

export function getDisplaySymbol(symbol: EventSymbol) {
  switch (symbol.type) {
    case 'earning':
      return symbol.symbol;

    case 'ex-dividend':
      return `EX: ${symbol.symbol}`;

    case 'record-dividend':
      return `RD: ${symbol.symbol}`;

    case 'pay-dividend':
      return `PD: ${symbol.symbol}`;
  }
}

export function buildCorsFreeUrl(target: string): string {
  let url = target;
  if (url.startsWith('https://')) {
    const parsedUrl = new URL(url);
    url = target.replace('https://', '').replace(parsedUrl.hostname, `${parsedUrl.hostname}:443`);
  } else if (url.startsWith('http://')) {
    url = target.replace('http://', '');
  }

  return `https://cors.mani-coder.dev/${url}`;
}
