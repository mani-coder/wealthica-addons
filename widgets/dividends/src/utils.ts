import type { Color, DividendEventSymbol, EventType } from 'types';
import { COLORS } from './constants';

export const getSymbolFromNASDAQTicker = (ticker: string) =>
  ticker.startsWith('TSE:') ? `${ticker.replace('TSE:', '')}.TO` : ticker;

export function getColorForEvent(event: EventType): Color {
  return event === 'ex-dividend' ? 'pink' : event === 'pay-dividend' ? 'green' : 'blue';
}

export function getDisplaySymbol(symbol: DividendEventSymbol) {
  return `${symbol.type === 'ex-dividend' ? 'EX' : symbol.type === 'pay-dividend' ? 'PD' : 'RD'}: ${symbol.symbol}`;
}

export function buildCorsFreeUrl(target: string): string {
  let url = target;
  if (url.startsWith('https://')) {
    const parsedUrl = new URL(url);
    target = target.replace('https://', '').replace(parsedUrl.hostname, `${parsedUrl.hostname}:443`);
  } else if (url.startsWith('http://')) {
    target = target.replace('http://', '');
  }

  return `https://cors.mani-coder.dev/${target}`;
}
