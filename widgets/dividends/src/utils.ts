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
  return `https://us-central1-mani-coder.cloudfunctions.net/cors-bypass/${target.replace('//', '/')}`;
}
