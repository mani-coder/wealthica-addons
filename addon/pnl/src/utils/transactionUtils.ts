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
  account: string;
  amount: number; // Remaining open amount (cost basis) from this transaction
  shares: number; // Remaining open shares from this transaction
  date: Dayjs;
  _handledSplits: Set<string>;
}

function isTransferTransaction(tx: Transaction): boolean {
  return (
    tx.originalType.startsWith('transfer') &&
    !!(tx.description?.toLowerCase().includes('transfer') || tx.note?.includes('Accounts Transfer'))
  );
}

type TransferPair = { source: Transaction; destination: Transaction };

function getTransferPairs(transactions: Transaction[]): Map<Transaction, TransferPair> {
  const pairs = new Map<Transaction, TransferPair>();
  const usedDestinations = new Set<Transaction>();
  const destinations = transactions.filter(
    (transaction) => isTransferTransaction(transaction) && transaction.type === 'buy',
  );

  for (const source of transactions.filter(
    (transaction) => isTransferTransaction(transaction) && transaction.type === 'sell',
  )) {
    const destination = destinations.find(
      (candidate) =>
        !usedDestinations.has(candidate) &&
        candidate.account !== source.account &&
        candidate.symbol === source.symbol &&
        candidate.date.isSame(source.date, 'day') &&
        Math.abs(Math.abs(candidate.shares) - Math.abs(source.shares)) < 0.00000001,
    );
    if (!destination) continue;

    const pair = { source, destination };
    pairs.set(source, pair);
    pairs.set(destination, pair);
    usedDestinations.add(destination);
  }
  return pairs;
}

function addOpenLot(openTransactions: OpenTransaction[], lot: OpenTransaction) {
  const existing = openTransactions.find(
    (candidate) => candidate.account === lot.account && candidate.date.isSame(lot.date, 'day'),
  );
  if (!existing) {
    openTransactions.push(lot);
    return;
  }

  existing.shares += lot.shares;
  existing.amount += lot.amount;
  existing.transactions.push(...lot.transactions);
  lot._handledSplits.forEach((split) => {
    existing._handledSplits.add(split);
  });
}

function relocateTransferLots(openTransactions: OpenTransaction[], pair: TransferPair, currencies?: Currencies) {
  let sharesToMove = Math.abs(pair.source.shares);
  const requestedShares = sharesToMove;

  while (sharesToMove > 0) {
    const sourceIndex = openTransactions.findIndex((lot) => lot.account === pair.source.account);
    if (sourceIndex === -1) break;

    const sourceLot = openTransactions[sourceIndex];
    const movedShares = Math.min(sourceLot.shares, sharesToMove);
    const movedProportion = movedShares / sourceLot.shares;
    const movedAmount = sourceLot.amount * movedProportion;
    const movedLot: OpenTransaction = {
      account: pair.destination.account,
      date: sourceLot.date,
      shares: movedShares,
      amount: movedAmount,
      transactions: [...sourceLot.transactions, pair.source, pair.destination],
      _handledSplits: new Set(sourceLot._handledSplits),
    };

    if (movedShares === sourceLot.shares) {
      openTransactions.splice(sourceIndex, 1);
    } else {
      sourceLot.shares -= movedShares;
      sourceLot.amount -= movedAmount;
    }
    addOpenLot(openTransactions, movedLot);
    sharesToMove -= movedShares;
  }

  // If history starts after the original purchase, retain the unmatched incoming
  // quantity as a transfer-date lot rather than silently dropping current shares.
  if (sharesToMove > 0) {
    let fallbackAmount = pair.destination.currencyAmount || pair.destination.amount;
    if (currencies && pair.destination.currency && fallbackAmount) {
      fallbackAmount = currencies.getValue(pair.destination.currency, fallbackAmount, pair.destination.date);
    }
    addOpenLot(openTransactions, {
      account: pair.destination.account,
      date: pair.destination.date,
      shares: sharesToMove,
      amount: requestedShares ? fallbackAmount * (sharesToMove / requestedShares) : 0,
      transactions: [pair.source, pair.destination],
      _handledSplits: new Set(),
    });
  }
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

  const transferPairs = getTransferPairs(sortedTxs);
  const openTransactions: OpenTransaction[] = [];
  for (const tx of sortedTxs) {
    const transferPair = transferPairs.get(tx);
    if (transferPair) {
      if (tx === transferPair.source) {
        relocateTransferLots(openTransactions, transferPair, currencies);
      }
      continue;
    }

    if (tx.type === 'buy' || tx.type === 'reinvest') {
      // Convert amount to base currency if currencies are provided
      let amount = tx.type === 'buy' ? tx.currencyAmount || tx.amount : 0;
      if (currencies && tx.currency && amount) {
        amount = currencies.getValue(tx.currency, amount, tx.date);
      }
      addOpenLot(openTransactions, {
        account: tx.account,
        date: tx.date,
        transactions: [tx],
        shares: tx.shares,
        amount,
        _handledSplits: new Set(),
      });
    } else if (tx.type === 'sell') {
      // Match sell against existing buys (FIFO)
      let sharesToSell = Math.abs(tx.shares);

      while (sharesToSell > 0) {
        const oldestOpenIndex = openTransactions.findIndex((openTransaction) => openTransaction.account === tx.account);
        if (oldestOpenIndex === -1) break;
        const oldestOpen = openTransactions[oldestOpenIndex];
        const openShares = oldestOpen.shares;

        if (openShares <= sharesToSell) {
          // This buy is completely sold - remove it
          sharesToSell -= openShares;
          openTransactions.splice(oldestOpenIndex, 1);
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
      const splitKey = `${tx.symbol}-${tx.account}-${formatDate(tx.date)}-${splitRatio}`;

      for (const openTx of openTransactions) {
        if (openTx.account !== tx.account) {
          continue;
        }
        // Skip if the split has already been handled
        if (openTx._handledSplits.has(splitKey)) {
          continue;
        }
        openTx._handledSplits.add(splitKey);
        openTx.shares = openTx.shares * splitRatio;
      }
    }
  }

  return openTransactions;
}
