/**
 * Transaction Utilities
 *
 * Common utilities for calculating open positions, matching buy/sell transactions,
 * and computing cost basis across multiple components.
 */

import type { Dayjs } from 'dayjs';
import type { Currencies } from '../context/CurrencyContext';
import type { Transaction } from '../types';
import { formatDate } from './common';

/**
 * Represents an open buy transaction with remaining shares
 */
export interface OpenTransaction {
  transactions: Transaction[];
  amount: number; // Remaining open amount (cost basis) from this transaction
  shares: number; // Remaining open shares from this transaction
  date: Dayjs;
  _handledSplits: Set<string>;
}

function isTransferTransaction(tx: Transaction): boolean {
  return (
    tx.originalType === 'transfer' &&
    !!(tx.description.toLowerCase().includes('transfer') || tx.note?.includes('Accounts Transfer'))
  );
}

/**
 * Calculate open transactions - buy transactions that haven't been fully sold yet.
 * Uses FIFO (First In, First Out) matching for buys and sells.
 *
 * This is the "open book" - the transactions that form the current position.
 *
 * @param transactions - All transactions for a security
 * @param currencies - Optional Currencies instance for currency conversion
 * @returns Array of open transactions with remaining shares and amounts (converted to base currency if currencies provided)
 */
export function calculateOpenTransactions(transactions: Transaction[], currencies?: Currencies): OpenTransaction[] {
  // Sort transactions by date (FIFO)
  const sortedTxs = [...transactions]
    .filter((t) => ['buy', 'sell', 'split', 'reinvest'].includes(t.type))
    .sort((a, b) => a.date.valueOf() - b.date.valueOf());

  const transferTransactions: Transaction[] = sortedTxs.filter((t) => isTransferTransaction(t));
  const openTransactions: OpenTransaction[] = [];
  for (const tx of sortedTxs) {
    if (isTransferTransaction(tx)) {
      const hasTransferInOutTransaction = transferTransactions.some(
        (t) => t.shares === -tx.shares && t.date.isSame(tx.date),
      );
      // If there is a negating transfer transaction, skip the current transaction
      if (hasTransferInOutTransaction) {
        continue;
      }
    }

    if (tx.type === 'buy' || tx.type === 'reinvest') {
      // Convert amount to base currency if currencies are provided
      let amount = tx.type === 'buy' ? tx.currencyAmount || tx.amount : 0;
      if (currencies && tx.currency && amount) {
        amount = currencies.getValue(tx.currency, amount, tx.date);
      }
      const existingTx = openTransactions.find((t) => t.date.isSame(tx.date));
      if (existingTx) {
        existingTx.shares += tx.shares;
        existingTx.amount += amount;
        existingTx.transactions.push(tx);
      } else {
        openTransactions.push({
          date: tx.date,
          transactions: [tx],
          shares: tx.shares,
          amount,
          _handledSplits: new Set(),
        });
      }
    } else if (tx.type === 'sell') {
      // Match sell against existing buys (FIFO)
      let sharesToSell = Math.abs(tx.shares);

      while (sharesToSell > 0 && openTransactions.length > 0) {
        const oldestOpen = openTransactions[0];
        const openShares = oldestOpen.shares;

        if (openShares <= sharesToSell) {
          // This buy is completely sold - remove it
          sharesToSell -= openShares;
          openTransactions.shift();
        } else {
          // Partial sell - reduce the buy transaction
          const proportion = sharesToSell / openShares;
          oldestOpen.shares -= sharesToSell;
          oldestOpen.amount -= oldestOpen.amount * proportion;
          sharesToSell = 0;
        }
      }
    } else if (tx.type === 'split' && tx.splitRatio) {
      // Handle stock splits - adjust shares in all open transactions corresponding to the same account
      const splitRatio = tx.splitRatio;
      const splitKey = `${formatDate(tx.date)}-${splitRatio}`;

      for (const openTx of openTransactions) {
        // Skip if the split has already been handled
        if (openTx._handledSplits.has(splitKey)) {
          continue;
        }
        openTx._handledSplits.add(splitKey);
        openTx.shares = openTx.shares / splitRatio;
      }
    }
  }

  return openTransactions;
}
