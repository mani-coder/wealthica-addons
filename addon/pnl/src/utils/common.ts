import usHolidays from '@date/holidays-us';
import type { Dayjs } from 'dayjs';
import { DATE_FORMAT } from '../constants';
import dayjs from '../dayjs';
import type { PortfolioData, Security } from '../types';

// Use bank holidays only (these are the ones NYSE/NASDAQ observe)
const holidays = usHolidays.bank();

export const isValidPortfolioData = (data: PortfolioData): boolean => {
  return Boolean(data.deposit || data.income || data.interest || data.value || data.withdrawal);
};

export const getDate = (date: string): Dayjs => {
  // Parse as local date (not UTC) to avoid timezone shifts in the chart
  // These are calendar dates (e.g., closing price for Oct 27), not timestamps
  return dayjs(date.slice(0, 10), DATE_FORMAT).startOf('day');
};

export const formatDate = (date: Dayjs, format?: string): string => date.format(format ?? 'MMM DD, YYYY');

export const formatMoney = (amount?: number, precision?: number): string => {
  precision = precision === undefined || precision === null ? 2 : precision;
  if (amount === undefined || amount === null) {
    return '-';
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
};

export const formatMoneyWithCurrency = (amount: number, currency: string, precision?: number): string => {
  precision = precision === undefined || precision === null ? 2 : precision;
  return `${
    currency.toUpperCase() === 'USD' ? 'U$' : currency.toUpperCase() === 'CAD' ? 'C$' : currency.toUpperCase()
  }  ${amount.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
};

function getRandomInt(n: number) {
  return Math.floor(Math.random() * n);
}

export function shuffle(s: string) {
  const arr = s.split(''); // Convert String to array
  const n = arr.length; // Length of the array

  for (let i = 0; i < n - 1; ++i) {
    const j = getRandomInt(n); // Get random of [0, n-1]

    const temp = arr[i]; // Swap arr[i] and arr[j]
    arr[i] = arr[j];
    arr[j] = temp;
  }

  s = arr.join(''); // Convert Array to string
  return s; // Return shuffled string
}

export const getSymbol = (security: Security, ticker?: boolean): string => {
  if (security.currency === 'jpy' && !ticker) {
    return security.name;
  }

  return `${security.symbol || security.name}${security.currency === 'cad' && security.type !== 'crypto' ? '.TO' : ''}`;
};

const SYMBOL_TO_YAHOO_TICKER: Record<string, string> = {
  'BRK.B': 'BRK-B',
};

export const getYahooSymbol = (security: Security): string => {
  const baseSymbol = security.symbol || security.name;
  const currency = security.currency?.toLowerCase();

  if (SYMBOL_TO_YAHOO_TICKER[baseSymbol]) {
    return SYMBOL_TO_YAHOO_TICKER[baseSymbol];
  }

  if (currency === 'cad' && security.type !== 'crypto') {
    return `${baseSymbol}.TO`;
  }
  if (currency === 'jpy') {
    return `${baseSymbol}.T`;
  }

  // USD or any other currency - use as is
  return baseSymbol;
};

export const getNasdaqTicker = (security: Security): string =>
  security.currency === 'cad' ? `TSE:${security.symbol}` : security.symbol;

export const getSymbolFromNasdaqTicker = (ticker: string) =>
  ticker.startsWith('TSE:') ? `${ticker.replace('TSE:', '')}.TO` : ticker;

export const min = (data: any[], field: string): any => {
  return data.reduce((min, p) => (p[field] < min[field] ? p : min), data[0]);
};

export const max = (data: any[], field: string): any => {
  return data.reduce((max, p) => (p[field] > max[field] ? p : max), data[0]);
};

export const formatCurrency = (amount: number, digits: number) => {
  const si = [
    { value: 1, symbol: '' },
    { value: 1e3, symbol: 'K' },
    { value: 1e6, symbol: 'M' },
    { value: 1e9, symbol: 'G' },
    { value: 1e12, symbol: 'T' },
    { value: 1e15, symbol: 'P' },
    { value: 1e18, symbol: 'E' },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  let i: number;
  for (i = si.length - 1; i > 0; i--) {
    if (Math.abs(amount) >= si[i].value) {
      break;
    }
  }
  const formattedAmount = (Math.abs(amount) / si[i].value).toFixed(digits).replace(rx, '$1') + si[i].symbol;
  return amount < 0 ? `-${formattedAmount}` : formattedAmount;
};

export const getURLParams = (values: { [id: string]: string }): string => {
  return Object.keys(values)
    .map((key) => `${key}=${values[key]}`)
    .join('&');
};

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

export function getPreviousWeekday(date: any) {
  const referenceDate = dayjs(date);
  const day = referenceDate.day();
  let diff = 1; // returns yesterday
  if (day === 0 || day === 1) {
    // is Sunday or Monday
    diff = day + 2; // returns Friday
  }
  return referenceDate.subtract(diff, 'days');
}

export function setLocalCache(name: string, value: string) {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    console.error('Error setting local cache', name, value);
  }
}

export function sumOf(...args: number[]) {
  return args.reduce((s, value) => (value ? s + value : s), 0);
}

export function getLocalCache(name: string) {
  try {
    return window.localStorage.getItem(name);
  } catch {
    console.error('Error getting local cache', name);
  }
}

export function normalizeAccountType(type: string): string {
  type = type ? type.toUpperCase() : '';
  if (type.includes('SRRSP')) {
    return 'SRRSP';
  } else if (type.includes('RRSP') || type.includes('REGISTERED RETIREMENT SAVINGS PLAN')) {
    return 'RRSP';
  } else if (type.includes('TFSA') || type.includes('TAX FREE SAVINGS PLAN')) {
    return 'TFSA';
  } else if (type.toLocaleUpperCase() === 'CASH' || type.toLocaleUpperCase() === 'MARGIN') {
    return 'Margin';
  } else {
    return type;
  }
}

export function isChrome() {
  const userAgent = (navigator?.userAgent || '').toLowerCase();
  const vendor = (navigator?.vendor || '').toLowerCase();
  const match = /google inc/.test(vendor) ? userAgent.match(/(?:chrome|crios)\/(\d+)/) : null;
  return match !== null;
}

/**
 * Check if date is a trading day (not weekend or holiday)
 */
export function isTradingDay(date: Dayjs): boolean {
  // Skip weekends (Saturday = 6, Sunday = 0)
  if (date.day() === 0 || date.day() === 6) return false;

  // IMPORTANT: We must create a Date object in local time, not UTC
  // Using the format "YYYY-MM-DDTHH:mm:ss" forces local time interpretation
  // This avoids timezone issues where "2021-01-01" gets parsed as Dec 31, 2020 in some timezones
  const dateStr = `${date.format('YYYY-MM-DD')}T12:00:00`;
  const jsDate = new Date(dateStr);

  // Skip US market holidays (NYSE/NASDAQ follow US federal holidays)
  const isUsHoliday = holidays.isHoliday(jsDate);

  return !isUsHoliday;
}

/**
 * Get the previous trading day (skipping weekends and holidays)
 * @param date - The date to start from
 * @param maxIterations - Maximum number of days to look back (default: 10)
 * @returns The previous trading day, or the input date if no trading day found within maxIterations
 */
export function getPreviousTradingDay(date: Dayjs, maxIterations: number = 10): Dayjs {
  let candidate = date.subtract(1, 'day');
  let iterations = 0;

  while (iterations < maxIterations && !isTradingDay(candidate)) {
    candidate = candidate.subtract(1, 'day');
    iterations++;
  }

  // If we couldn't find a trading day, return the original date
  // This prevents infinite loops or going too far back
  return iterations < maxIterations ? candidate : date;
}

export function getNextWeekday(date: any) {
  const referenceDate = dayjs(date);
  const day = referenceDate.day();
  const diff = day === 6 ? 2 : day === 0 ? 1 : 0;
  return (diff ? referenceDate.add(diff, 'days') : referenceDate).format(DATE_FORMAT);
}

/**
 * Chunk array into smaller arrays of specified size
 * Useful for batch processing API requests
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
