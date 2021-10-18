import type { Color } from 'types';
import { COLORS } from './constants';

export const getSymbolFromNASDAQTicker = (ticker: string) =>
  ticker.startsWith('TSE:') ? `${ticker.replace('TSE:', '')}.TO` : ticker;

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
export function getRandomInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const colorCache: { [K: string]: Color } = {};
let lastUsedColorIdx: number = -1;
export function getColorForSymbol(symbol: string) {
  if (!colorCache[symbol]) {
    lastUsedColorIdx += 1;
    colorCache[symbol] = COLORS[lastUsedColorIdx % COLORS.length];
  }
  return colorCache[symbol];
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
