import { describe, expect, it } from 'vitest';
import type { Position } from '../types';
import { buildPortfolioReview } from './portfolioHealth';

function position(overrides: Partial<Position> & { symbol: string }): Position {
  return {
    class: 'equity',
    security: {
      id: overrides.symbol,
      symbol: overrides.symbol,
      name: overrides.symbol,
      currency: 'usd',
      type: 'equity',
      last_price: 10,
      high_date: new Date(),
      high_price: 10,
      low_date: new Date(),
      low_price: 10,
      last_date: '2026-09-14',
      aliases: [],
    },
    book_value: 100,
    market_value: 100,
    quantity: 10,
    gain_percent: 0,
    gain_currency_amount: 0,
    currency: 'usd',
    gain_amount: 0,
    investments: [],
    transactions: [
      {
        id: 'buy',
        date: {} as Position['transactions'][number]['date'],
        symbol: overrides.symbol,
        ticker: overrides.symbol,
        amount: 100,
        currencyAmount: 100,
        currency: 'usd',
        type: 'buy',
        price: 10,
        shares: 10,
        description: '',
        account: 'account:margin:usd',
        security: {
          id: overrides.symbol,
          currency: 'usd',
          type: 'equity',
          name: overrides.symbol,
          symbol: overrides.symbol,
        },
        originalType: 'buy',
      },
    ],
    xirr: 0,
    type: 'equity',
    ...overrides,
  };
}

describe('portfolio health snapshot', () => {
  it('reports explicit data, cost-basis, and exposure reasons without an opaque score', () => {
    const summary = buildPortfolioReview([
      position({ symbol: 'LARGE', market_value: 800, book_value: 1_000, gain_percent: -0.2 }),
      position({ symbol: 'SMALL', market_value: 5, book_value: 10, gain_percent: -0.5 }),
      position({ symbol: 'CLEAN', market_value: 195, book_value: 150, gain_percent: 0.3 }),
    ]);

    expect(summary.holdingsReviewed).toBe(3);
    expect(summary.concentrationCount).toBe(2);
    expect(summary.belowCostBasisCount).toBe(2);
    expect(summary.smallAllocationCount).toBe(1);
    expect(summary.items.find((item) => item.symbol === 'LARGE')?.reasons.map((reason) => reason.category)).toEqual([
      'cost_basis',
      'concentration',
    ]);
    expect(summary.items.find((item) => item.symbol === 'CLEAN')?.reasons).toEqual([
      expect.objectContaining({ category: 'concentration' }),
    ]);
  });

  it('surfaces missing fields as data-quality gaps', () => {
    const broken = position({
      symbol: 'BROKEN',
      book_value: 0,
      transactions: [],
      type: 'unknown',
    });
    const summary = buildPortfolioReview([broken]);
    const item = summary.items[0];

    expect(summary.dataGapCount).toBe(1);
    expect(item.dataComplete).toBe(false);
    expect(item.reasons.map((reason) => reason.label)).toEqual(
      expect.arrayContaining(['Cost basis unavailable', 'No transaction history', 'Security type unresolved']),
    );
  });
});
