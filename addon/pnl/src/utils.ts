import moment, { Moment } from 'moment';
import xirr from 'xirr';
import { DATE_FORMAT } from './constants';
import { Currencies } from './context/CurrencyContext';
import { PortfolioData, Position, Security } from './types';

export const isValidPortfolioData = (data: PortfolioData): boolean => {
  return Boolean(data.deposit || data.income || data.interest || data.value || data.withdrawal);
};

export const getDate = (date: string): Moment => {
  return moment(date.slice(0, 10), DATE_FORMAT);
};

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

function getRandomInt(n) {
  return Math.floor(Math.random() * n);
}
export function shuffle(s: string) {
  var arr = s.split(''); // Convert String to array
  var n = arr.length; // Length of the array

  for (var i = 0; i < n - 1; ++i) {
    var j = getRandomInt(n); // Get random of [0, n-1]

    var temp = arr[i]; // Swap arr[i] and arr[j]
    arr[i] = arr[j];
    arr[j] = temp;
  }

  s = arr.join(''); // Convert Array to string
  return s; // Return shuffled string
}

export const getSymbol = (security: Security): string => {
  return `${security.symbol || security.name}${security.currency === 'cad' && security.type !== 'crypto' ? '.TO' : ''}`;
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
  var si = [
    { value: 1, symbol: '' },
    { value: 1e3, symbol: 'K' },
    { value: 1e6, symbol: 'M' },
    { value: 1e9, symbol: 'G' },
    { value: 1e12, symbol: 'T' },
    { value: 1e15, symbol: 'P' },
    { value: 1e18, symbol: 'E' },
  ];
  var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var i;
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
    .map(function (key) {
      return key + '=' + values[key];
    })
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

export function getPreviousWeekday(date) {
  const referenceDate = moment(date);
  let day = referenceDate.day();
  let diff = 1; // returns yesterday
  if (day === 0 || day === 1) {
    // is Sunday or Monday
    diff = day + 2; // returns Friday
  }
  return referenceDate.subtract(diff, 'days');
}

export function setLocalCache(name, value) {
  try {
    window.localStorage.setItem(name, value);
  } catch {}
}

export function sumOf(...args) {
  return args.reduce((s, value) => (value ? s + value : s), 0);
}

export function getLocalCache(name) {
  try {
    return window.localStorage.getItem(name);
  } catch {}
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

export function computeXIRR(position: Position) {
  const data = position.transactions.reduce(
    (hash, transaction) => {
      if (['buy', 'sell', 'reinvest', 'split']) {
        const openShares = hash.book[transaction.account] || 0;

        let outstandingShares = 0;
        if (transaction.type === 'split') {
          outstandingShares = transaction.shares;
        } else {
          outstandingShares = transaction.shares + openShares;
        }

        hash.book[transaction.account] = outstandingShares;
        hash.shares = Object.values(hash.book).reduce((total, shares) => total + shares);

        if (
          hash.shares === 0 &&
          transaction.originalType !== 'transfer' &&
          !transaction.description.includes('transfer')
        ) {
          hash.transactions = [];
          return hash;
        }
      }

      if (transaction.type !== 'split') {
        hash.transactions.push({
          amount: ['buy', 'tax', 'fee', 'reinvest'].includes(transaction.type)
            ? -transaction.amount
            : transaction.amount,
          when: transaction.date.toDate(),
        });
      }

      return hash;
    },
    { transactions: [], shares: 0, book: {} } as {
      transactions: { amount: number; when: Date }[];
      book: { [K: string]: number };
      shares: number;
    },
  );

  if (!data.transactions.length) {
    // Skip xirr computation if there are no transactions.
    return;
  }

  data.transactions.push({ amount: position.market_value, when: new Date() });

  try {
    const value = xirr(data.transactions);
    return value;
  } catch (error) {
    console.warn(
      'failed to compute the xirr for',
      getSymbol(position.security),
      data.transactions.map((v) => `${v.when.toLocaleDateString()} : ${v.amount}`),
      error,
    );
  }
}

export function computeBookValue(position: Position, currencies: Currencies) {
  const transactions = position.transactions;
  if (!transactions || !transactions.length || position.book_value) {
    return;
  }

  console.log('Computing the book value:', position);
  const book = transactions
    .filter((t) => ['buy', 'sell'].includes(t.type))
    .reduce(
      (book, t) => {
        if (t.type === 'buy') {
          book.value += t.price * t.shares;
          book.shares += t.shares;
          book.price = book.shares ? book.value / book.shares : t.price;
        } else {
          book.value += (book.price || t.price) * t.shares;
          book.shares += t.shares;
        }
        return book;
      },
      { price: 0, shares: 0, value: 0 } as { price: number; usPrice: number; shares: number; value: number },
    );

  const price = currencies.getValue(position.security.currency, book.price);

  position.book_value = book.shares * price;
  position.gain_amount = position.market_value - position.book_value;
  position.gain_percent = position.gain_amount / position.book_value;

  (position.investments || []).forEach((investment) => {
    if (!investment.book_value) {
      investment.book_value = investment.quantity * book.price;
    }
  });
}

export function isChrome() {
  const userAgent = ((navigator && navigator.userAgent) || '').toLowerCase();
  const vendor = ((navigator && navigator.vendor) || '').toLowerCase();
  const match = /google inc/.test(vendor) ? userAgent.match(/(?:chrome|crios)\/(\d+)/) : null;
  return match !== null;
}
