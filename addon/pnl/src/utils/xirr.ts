import xirr from 'xirr';
import type { Currencies } from '../context/CurrencyContext';
import type { Position } from '../types';
import { getSymbol } from './common';

export function computeXIRR(position: Position) {
  const data = position.transactions.reduce(
    (hash, transaction) => {
      if (['buy', 'sell', 'reinvest', 'split'].includes(transaction.type)) {
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
