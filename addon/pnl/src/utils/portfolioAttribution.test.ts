import { describe, expect, it } from 'vitest';
import {
  calculateActiveContributions,
  calculateCashDragFromTransactions,
  calculateExplicitFeeEffect,
  calculateHoldingRelativePerformances,
  calculatePerformanceGapAttribution,
  normalizePricesForDocumentedSplits,
} from './portfolioAttribution';

describe('documented split price normalization', () => {
  it('removes a split discontinuity left in reported adjusted close', () => {
    const normalized = normalizePricesForDocumentedSplits(
      [
        { date: '2026-07-07', value: 308.4 },
        { date: '2026-07-08', value: 30.65 },
      ],
      [{ date: '2026-07-08', ratio: 10 }],
    );
    expect(normalized[0].value).toBeCloseTo(30.84);
    expect(normalized[1].value).toBeCloseTo(30.65);
  });

  it('does not adjust a feed that already handled the split', () => {
    const normalized = normalizePricesForDocumentedSplits(
      [
        { date: '2026-07-07', value: 30.84 },
        { date: '2026-07-08', value: 30.65 },
      ],
      [{ date: '2026-07-08', ratio: 10 }],
    );
    expect(normalized.map((point) => point.value)).toEqual([30.84, 30.65]);
  });
});

describe('active contribution', () => {
  it('ranks securities by dollar active impact rather than percentage return', () => {
    const contributions = calculateActiveContributions(
      [
        {
          date: '2026-01-02',
          symbol: 'LARGE',
          beginningValue: 100_000,
          portfolioBeginningValue: 200_000,
          securityReturn: -0.01,
          benchmarkReturn: 0.01,
        },
        {
          date: '2026-01-02',
          symbol: 'SMALL',
          beginningValue: 1_000,
          portfolioBeginningValue: 200_000,
          securityReturn: -0.5,
          benchmarkReturn: 0.01,
        },
      ],
      ['2026-01-02'],
    );

    expect(contributions.map((contribution) => contribution.symbol)).toEqual(['LARGE', 'SMALL']);
    expect(contributions[0].activeContributionAmount).toBeCloseTo(-2_000);
    expect(contributions[1].activeContributionAmount).toBeCloseTo(-510);
  });

  it('uses beginning exposure and reports incomplete market coverage', () => {
    const contributions = calculateActiveContributions(
      [
        {
          date: '2026-01-02',
          symbol: 'TEST',
          beginningValue: 10_000,
          portfolioBeginningValue: 100_000,
          securityReturn: 0.02,
          benchmarkReturn: 0.01,
        },
        {
          date: '2026-01-03',
          symbol: 'TEST',
          beginningValue: 20_000,
          portfolioBeginningValue: 100_000,
          securityReturn: -0.01,
          benchmarkReturn: 0,
        },
      ],
      ['2026-01-02', '2026-01-03', '2026-01-04'],
    );

    expect(contributions[0].averageWeight).toBeCloseTo(0.15);
    expect(contributions[0].portfolioContributionAmount).toBeCloseTo(0);
    expect(contributions[0].benchmarkContributionAmount).toBeCloseTo(100);
    expect(contributions[0].activeContributionAmount).toBeCloseTo(-100);
    expect(contributions[0].currencyEffectAmount).toBeCloseTo(0);
    expect(contributions[0].coverage).toBeCloseTo(2 / 3);
  });

  it('separates the base-currency effect from the local security return', () => {
    const contributions = calculateActiveContributions([
      {
        date: '2026-01-02',
        symbol: 'CAD-STOCK',
        beginningValue: 10_000,
        portfolioBeginningValue: 100_000,
        securityReturn: 0.03,
        localSecurityReturn: 0.02,
        benchmarkReturn: 0.01,
      },
    ]);
    expect(contributions[0].currencyEffectAmount).toBeCloseTo(100);
  });

  it('skips invalid observations instead of treating them as zero', () => {
    const contributions = calculateActiveContributions([
      {
        date: '2026-01-02',
        symbol: 'TEST',
        beginningValue: 10_000,
        portfolioBeginningValue: 0,
        securityReturn: 0.02,
        benchmarkReturn: 0.01,
      },
    ]);
    expect(contributions).toEqual([]);
  });
});

describe('holding-relative performance', () => {
  const benchmarkReturns = [
    { date: '2026-01-01', value: 0 },
    { date: '2026-01-02', value: 1 },
    { date: '2026-01-05', value: 2.01 },
    { date: '2026-01-06', value: 3.0301 },
    { date: '2026-01-07', value: 4.060401 },
  ];
  const portfolios = benchmarkReturns.map((point) => ({ date: point.date, value: 100_000 }));

  it('starts a mid-period holding at zero and compares only identical owned intervals', () => {
    const [performance] = calculateHoldingRelativePerformances({
      securities: [
        {
          symbol: 'MID',
          name: 'Mid-year holding',
          currentQuantity: 100,
          prices: [
            { date: '2026-01-01', value: 100 },
            { date: '2026-01-02', value: 100 },
            { date: '2026-01-05', value: 100 },
            { date: '2026-01-06', value: 110 },
            { date: '2026-01-07', value: 121 },
          ],
        },
      ],
      trades: [{ date: '2026-01-05', symbol: 'MID', type: 'buy', shares: 100, account: 'margin' }],
      benchmarkReturns,
      portfolios,
      fromDate: '2026-01-01',
    });

    expect(performance.firstHeldDate).toBe('2026-01-05');
    expect(performance.stockReturn).toBeCloseTo(21);
    expect(performance.benchmarkReturn).toBeCloseTo(2.01);
    expect(performance.excessReturn).toBeCloseTo(18.99);
    expect(performance.relativePerformance[0]).toEqual({ date: '2026-01-05', value: 0 });
    expect(performance.activeContributionAmount).toBeCloseTo(1_890);
    expect(performance.periodHeld).toBeCloseTo(0.5);
    expect(performance.isCurrent).toBe(true);
  });

  it('sorts a large modest lag ahead of a tiny severe lag', () => {
    const performances = calculateHoldingRelativePerformances({
      securities: [
        {
          symbol: 'LARGE',
          name: 'Large holding',
          currentQuantity: 1_000,
          prices: benchmarkReturns.map((point) => ({ date: point.date, value: 100 })),
        },
        {
          symbol: 'SMALL',
          name: 'Small holding',
          currentQuantity: 1,
          prices: benchmarkReturns.map((point, index) => ({ date: point.date, value: index === 0 ? 100 : 50 })),
        },
      ],
      trades: [],
      benchmarkReturns,
      portfolios,
      fromDate: '2026-01-01',
    });

    expect(performances.map((performance) => performance.symbol)).toEqual(['LARGE', 'SMALL']);
    expect(performances[0].activeContributionAmount).toBeLessThan(performances[1].activeContributionAmount);
  });

  it('creates separate chart episodes after a full sale and repurchase', () => {
    const [performance] = calculateHoldingRelativePerformances({
      securities: [
        {
          symbol: 'REBUY',
          name: 'Rebought holding',
          currentQuantity: 10,
          prices: benchmarkReturns.map((point, index) => ({ date: point.date, value: 100 + index })),
        },
      ],
      trades: [
        { date: '2026-01-02', symbol: 'REBUY', type: 'sell', shares: -10, account: 'margin' },
        { date: '2026-01-06', symbol: 'REBUY', type: 'buy', shares: 10, account: 'margin' },
      ],
      benchmarkReturns,
      portfolios,
      fromDate: '2026-01-01',
    });

    expect(performance.holdingEpisodes).toBe(2);
    expect(performance.relativePerformance.some((point) => point.value === null)).toBe(true);
    expect(performance.relativePerformance).toContainEqual({ date: '2026-01-01', value: 0 });
    expect(performance.relativePerformance).toContainEqual({ date: '2026-01-06', value: 0 });
  });
});

describe('performance gap attribution', () => {
  it('separates selection, sector allocation, currency, timing, and the explicit residual', () => {
    const benchmarkReturns = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 1 },
    ];
    const result = calculatePerformanceGapAttribution({
      securities: [
        {
          symbol: 'STOCK',
          name: 'Stock',
          currentQuantity: 10,
          prices: [
            { date: '2026-01-01', value: 100 },
            { date: '2026-01-02', value: 112 },
          ],
          localPrices: [
            { date: '2026-01-01', value: 100 },
            { date: '2026-01-02', value: 110 },
          ],
          securityType: 'equity',
          sector: 'Technology',
        },
      ],
      trades: [],
      benchmarkReturns,
      portfolios: [
        { date: '2026-01-01', value: 10_000 },
        { date: '2026-01-02', value: 10_000 },
      ],
      fromDate: '2026-01-01',
      sectorReturns: {
        Technology: [
          { date: '2026-01-01', value: 0 },
          { date: '2026-01-02', value: 5 },
        ],
      },
      totalGap: 150,
      cashDrag: -10,
      fees: -5,
    });

    expect(result.stockSelection).toBeCloseTo(50);
    expect(result.sectorAllocation).toBeCloseTo(40);
    expect(result.currencyEffects).toBeCloseTo(20);
    expect(result.tradingTiming).toBeCloseTo(0);
    expect(result.residual).toBeCloseTo(55);
    expect(result.reconciled).toBe(true);
  });

  it('reconstructs cash drag and explicit fees from raw transactions', () => {
    const convertCurrency = (_currency: string, value: number) => value;
    const accounts = [{ id: 'account:margin:usd', cash: 110, currency: 'usd' }];
    const transactions = [
      {
        investment: 'account:margin:usd',
        date: '2026-01-02',
        currency_amount: 10,
        type: 'dividend',
      },
      {
        investment: 'account:margin:usd',
        date: '2026-01-02',
        currency_amount: -3,
        type: 'fee',
        fee: 2,
      },
    ];
    const cashDrag = calculateCashDragFromTransactions({
      accounts,
      transactions,
      benchmarkReturns: [
        { date: '2026-01-01', value: 0 },
        { date: '2026-01-02', value: 10 },
      ],
      fromDate: '2026-01-01',
      convertCurrency,
    });
    const fees = calculateExplicitFeeEffect({
      accounts,
      transactions,
      fromDate: '2026-01-01',
      toDate: '2026-01-02',
      convertCurrency,
    });

    expect(cashDrag).toBeCloseTo(-10.3);
    expect(fees).toBe(-3);
  });

  it('does not extend stale prices across an unpriced holding period', () => {
    const [performance] = calculateHoldingRelativePerformances({
      securities: [
        {
          symbol: 'STALE',
          name: 'Stale price history',
          currentQuantity: 10,
          prices: [
            { date: '2026-01-01', value: 100 },
            { date: '2026-01-02', value: 101 },
          ],
        },
      ],
      trades: [],
      benchmarkReturns: [
        { date: '2026-01-01', value: 0 },
        { date: '2026-01-02', value: 1 },
        { date: '2026-01-30', value: 2 },
      ],
      portfolios: [
        { date: '2026-01-01', value: 100_000 },
        { date: '2026-01-02', value: 100_000 },
        { date: '2026-01-30', value: 100_000 },
      ],
      fromDate: '2026-01-01',
    });

    expect(performance.coveredObservations).toBe(1);
    expect(performance.priceCoverage).toBeCloseTo(0.5);
    expect(performance.lastHeldDate).toBe('2026-01-02');
  });
});
