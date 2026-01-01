/**
 * Transaction Utilities
 *
 * Common utilities for calculating open positions, matching buy/sell transactions,
 * and computing cost basis across multiple components.
 */

import dayjs from 'dayjs';
import type { Currencies } from '../context/CurrencyContext';
import type { Transaction } from '../types';

/**
 * Represents an open buy transaction with remaining shares
 */
export interface OpenTransaction {
  transaction: Transaction;
  shares: number; // Remaining open shares from this transaction
  amount: number; // Remaining open amount (cost basis) from this transaction
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
    .filter((t) => ['buy', 'sell', 'reinvest', 'split'].includes(t.type))
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

  const openTransactions: OpenTransaction[] = [];

  for (const tx of sortedTxs) {
    if (tx.type === 'buy' || (tx.type === 'reinvest' && tx.shares > 0)) {
      // Convert amount to base currency if currencies are provided
      let convertedAmount = tx.amount;
      if (currencies && tx.currency) {
        convertedAmount = currencies.getValue(tx.currency, tx.currencyAmount || tx.amount, tx.date);
      }

      // Add to open position
      // For reinvest, cost basis might be zero or included in the transaction
      openTransactions.push({
        transaction: tx,
        shares: tx.shares,
        amount: convertedAmount,
      });
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
      // Handle stock splits - adjust shares in all open transactions
      const splitRatio = tx.splitRatio;

      for (const openTx of openTransactions) {
        openTx.shares = openTx.shares / splitRatio;
        // Cost basis (amount) remains the same, just split across more/fewer shares
      }
    }
  }

  return openTransactions;
}

/**
 * Calculate the total cost basis from open transactions
 *
 * @param openTransactions - Array of open transactions
 * @returns Total cost basis (sum of amounts from open transactions)
 */
export function calculateTotalCostBasis(openTransactions: OpenTransaction[]): number {
  return openTransactions.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Calculate the average cost per share from open transactions
 *
 * @param openTransactions - Array of open transactions
 * @returns Average cost per share
 */
export function calculateAverageCostPerShare(openTransactions: OpenTransaction[]): number {
  const totalShares = openTransactions.reduce((sum, tx) => sum + tx.shares, 0);
  const totalCost = calculateTotalCostBasis(openTransactions);

  return totalShares > 0 ? totalCost / totalShares : 0;
}

/**
 * Get just the Transaction objects from OpenTransaction array
 * (for backward compatibility with existing code)
 *
 * @param openTransactions - Array of open transactions
 * @returns Array of Transaction objects
 */
export function getOpenTransactionsList(openTransactions: OpenTransaction[]): Transaction[] {
  return openTransactions.map((open) => ({
    ...open.transaction,
    shares: open.shares, // Use the remaining shares, not the original
    amount: open.amount, // Use the remaining amount, not the original
  }));
}
