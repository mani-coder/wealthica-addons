import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCashFlowByDate,
  parseCurrencyReponse,
  parsePortfolioResponse,
  parseSecurityTransactionsResponse,
} from '../api';
import { Currencies } from '../context/CurrencyContext';
import dayjs from '../dayjs';
import type { Portfolio, Transaction } from '../types';
import {
  calculateAlpha,
  calculateAverageRecoveryTime,
  calculateBeta,
  calculateConsistencyScore,
  calculateCorrelation,
  calculateOpportunityCost,
  calculateRiskLevel,
  normalizePortfolioToPercentageReturns,
  normalizeToPercentageReturns,
} from './benchmarkData';
import { buildPortfolioSeries, calculateCashFlowMatchedOpportunityCost } from './portfolioPerformance';
import { calculateOpenTransactions } from './transactionUtils';
import { computeXIRR } from './xirr';

describe('currency history', () => {
  it('advances the date while preserving null alignment', () => {
    expect(parseCurrencyReponse({ from: '2026-01-01', data: [1, null, 3] })).toEqual({
      '2026-01-01': 1,
      '2026-01-03': 3,
    });
  });

  it('uses the most recent historical rate instead of a future/latest rate', () => {
    const currencies = new Currencies('usd', {
      cad: { '2026-01-02': 0.72, '2026-01-05': 0.75 },
    });
    expect(currencies.getValue('cad', 100, '2026-01-04')).toBeCloseTo(72);
    expect(currencies.getValue('cad', 100)).toBeCloseTo(75);
  });

  it('fails explicitly instead of assuming parity when a non-base FX rate is missing', () => {
    const currencies = new Currencies('usd', {});
    expect(() => currencies.getValue('cad', 100, '2026-01-04')).toThrow('Missing CAD/USD FX rate');
  });
});

describe('external cash-flow classification', () => {
  it('excludes security reinvestments and matched cross-account transfers', () => {
    const transactions = [
      { id: 'deposit', type: 'deposit', date: '2026-01-02', currency_amount: 100, investment: 'a:margin:usd' },
      {
        id: 'reinvest',
        type: 'withdrawal',
        date: '2026-03-31',
        currency_amount: -4.82,
        investment: 'a:margin:usd',
        symbol: 'FDRXX',
        origin_type: 'INTEREST_REINVESTMENT_TRANSFER',
      },
      {
        id: 'internal-out',
        type: 'withdrawal',
        date: '2026-07-30',
        currency_amount: -10_000,
        investment: 'a:margin:usd',
        origin_type: 'TRANSFER',
        category: 'Transfers',
      },
      {
        id: 'internal-in',
        type: 'deposit',
        date: '2026-07-31',
        currency_amount: 10_000,
        investment: 'b:margin:usd',
      },
      { id: 'withdrawal', type: 'withdrawal', date: '2026-08-03', currency_amount: -20, investment: 'a:margin:usd' },
    ];

    const cashFlows = computeCashFlowByDate(transactions, new Currencies('usd', {}));
    expect(Object.values(cashFlows).reduce((sum, flow) => sum + flow.deposit, 0)).toBe(100);
    expect(Object.values(cashFlows).reduce((sum, flow) => sum + flow.withdrawal, 0)).toBe(20);
  });
});

describe('time-weighted performance', () => {
  it('neutralizes deposits and compounds investment returns', () => {
    const portfolios: Portfolio[] = [
      { date: '2026-08-24', value: 100, deposits: 0 },
      { date: '2026-08-25', value: 150, deposits: 50 },
      { date: '2026-08-26', value: 165, deposits: 50 },
    ];
    const returns = normalizePortfolioToPercentageReturns(portfolios);
    expect(returns.map((point) => point.value)).toEqual([0, 0, 10.000000000000009]);
  });

  it('uses the prior close when a requested start is a market holiday', () => {
    const returns = normalizeToPercentageReturns(
      [
        { date: '2025-12-31', value: 100 },
        { date: '2026-01-02', value: 110 },
      ],
      '2026-01-01',
    );
    expect(returns).toEqual([
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 10 },
    ]);
  });

  it('calculates correlation and consistency from daily rather than cumulative returns', () => {
    const portfolio = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 10 },
      { date: '2026-01-05', value: 0 },
    ];
    const benchmark = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 5 },
      { date: '2026-01-05', value: 0 },
    ];
    expect(calculateCorrelation(portfolio, benchmark)).toBeCloseTo(1);
    expect(calculateConsistencyScore(portfolio, benchmark)).toBe(50);
  });

  it('compares returns over the same market-date intervals', () => {
    const portfolio = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 10 },
      { date: '2026-01-03', value: 32 },
      { date: '2026-01-04', value: 15.5 },
    ];
    const benchmark = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 10 },
      { date: '2026-01-04', value: 15.5 },
    ];
    expect(calculateCorrelation(portfolio, benchmark)).toBeCloseTo(1);
  });

  it('marks undefined statistical metrics as unavailable', () => {
    const constant = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 0 },
      { date: '2026-01-03', value: 0 },
    ];
    expect(calculateCorrelation(constant, constant)).toBeNull();
    expect(calculateBeta(constant, constant)).toBeNull();
    expect(calculateConsistencyScore([], [])).toBeNull();
    expect(calculateRiskLevel(constant, constant)).toBe('Insufficient Data');
  });

  it('matches benchmark cash flows before calculating opportunity cost', () => {
    const portfolios: Portfolio[] = [
      { date: '2026-01-01', value: 100, deposits: 0 },
      { date: '2026-01-02', value: 160, deposits: 50 },
    ];
    const benchmark = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 20 },
    ];
    expect(calculateCashFlowMatchedOpportunityCost(portfolios, benchmark)).toBeCloseTo(-10);
  });

  it('applies a non-trading-day flow before the next benchmark interval', () => {
    const portfolios: Portfolio[] = [
      { date: '2026-01-01', value: 100, deposits: 0, externalFlow: 0 },
      { date: '2026-01-02', value: 150, deposits: 50, externalFlow: 50 },
      { date: '2026-01-03', value: 180, deposits: 50, externalFlow: 0 },
    ];
    const benchmark = [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-03', value: 20 },
    ];
    expect(calculateCashFlowMatchedOpportunityCost(portfolios, benchmark)).toBeCloseTo(0);
  });
});

describe('manual splits and account-scoped lots', () => {
  const transaction = (values: Partial<Transaction>): Transaction =>
    ({
      id: values.id ?? crypto.randomUUID(),
      date: values.date ?? dayjs('2026-01-01'),
      symbol: values.symbol ?? 'TEST',
      ticker: values.ticker ?? 'TEST',
      amount: values.amount ?? 0,
      currencyAmount: values.currencyAmount ?? 0,
      currency: values.currency ?? 'usd',
      type: values.type ?? 'buy',
      price: values.price ?? 1,
      shares: values.shares ?? 0,
      description: values.description ?? '',
      account: values.account ?? 'a',
      security: values.security ?? { id: 'test', currency: 'usd', type: 'equity', name: 'Test', symbol: 'TEST' },
      originalType: values.originalType ?? values.type ?? 'buy',
      splitRatio: values.splitRatio,
    }) as Transaction;

  it('applies a split only once and only to the matching account', () => {
    const open = calculateOpenTransactions([
      transaction({ id: 'a-buy', account: 'a', shares: 2 }),
      transaction({ id: 'b-buy', account: 'b', shares: 5 }),
      transaction({ id: 'a-split-1', account: 'a', type: 'split', shares: 0, splitRatio: 10 }),
      transaction({ id: 'a-split-2', account: 'a', type: 'split', shares: 0, splitRatio: 10 }),
    ]);
    expect(open.find((lot) => lot.account === 'a')?.shares).toBe(20);
    expect(open.find((lot) => lot.account === 'b')?.shares).toBe(5);
  });

  it('applies a manually entered MARUY split from 3 historical shares to 30 current shares', () => {
    const security = {
      _id: '5fcb0ea07a2366b2ee33e122',
      id: '5fcb0ea07a2366b2ee33e122',
      symbol: 'MARUY',
      currency: 'usd',
      type: 'equity',
      name: 'MARUBENI CORP ADR',
    };
    const parsed = parseSecurityTransactionsResponse(
      [
        {
          id: 'buy-1',
          type: 'buy',
          date: '2026-01-12',
          currency_amount: -614.94,
          investment: 'a:margin:usd',
          institution: 'a',
          quantity: 2,
          description: 'Buy',
          security,
        },
        {
          id: 'buy-2',
          type: 'buy',
          date: '2026-02-11',
          currency_amount: -419.95,
          investment: 'a:margin:usd',
          institution: 'a',
          quantity: 1,
          description: 'Buy',
          security,
        },
        {
          id: 'manual-split',
          type: 'split',
          date: '2026-07-08',
          currency_amount: 0,
          investment: 'a:margin:usd',
          institution: 'a',
          quantity: 0,
          description: 'SPLIT @ 10:1',
          security,
        },
      ],
      new Currencies('usd', {}),
    );
    const open = calculateOpenTransactions(parsed);
    expect(open.reduce((sum, lot) => sum + lot.shares, 0)).toBe(30);
  });

  it('normalizes security transfer directions before updating account lots', () => {
    const security = {
      _id: 'transfer-security',
      id: 'transfer-security',
      symbol: 'MOVE',
      currency: 'usd',
      type: 'equity',
      name: 'Transfer Test',
    };
    const parsed = parseSecurityTransactionsResponse(
      [
        {
          id: 'transfer-buy',
          type: 'buy',
          date: '2026-01-01',
          currency_amount: -100,
          investment: 'account-a:margin:usd',
          quantity: 10,
          security,
        },
        {
          id: 'transfer-out',
          type: 'transfer_out',
          date: '2026-01-02',
          currency_amount: 40,
          investment: 'account-a:margin:usd',
          quantity: 4,
          security,
        },
        {
          id: 'transfer-in',
          type: 'transfer_in',
          date: '2026-01-02',
          currency_amount: -40,
          investment: 'account-b:margin:usd',
          quantity: 4,
          security,
        },
      ],
      new Currencies('usd', {}),
    );

    expect(parsed.find((entry) => entry.id === 'transfer-out')?.shares).toBe(-4);
    expect(parsed.find((entry) => entry.id === 'transfer-in')?.shares).toBe(4);
    const open = calculateOpenTransactions(parsed);
    expect(open.find((lot) => lot.account === 'account-a:margin:usd')?.shares).toBe(6);
    expect(open.find((lot) => lot.account === 'account-b:margin:usd')?.shares).toBe(4);
  });

  it('relocates paired account transfers without losing acquisition lots', () => {
    const security = {
      _id: 'paired-transfer-security',
      id: 'paired-transfer-security',
      symbol: 'RELOCATE',
      currency: 'usd',
      type: 'equity',
      name: 'Paired Transfer Test',
    };
    const parsed = parseSecurityTransactionsResponse(
      [
        {
          id: 'original-buy',
          type: 'buy',
          date: '2025-01-10',
          currency_amount: -1_000,
          investment: 'source:margin:usd',
          quantity: 10,
          security,
        },
        {
          id: 'destination-leg',
          type: 'transfer',
          date: '2026-01-02',
          currency_amount: 400,
          investment: 'destination:margin:usd',
          quantity: 4,
          description: 'TRANSFER IN',
          note: 'Accounts Transfer',
          security,
        },
        {
          id: 'source-leg',
          type: 'transfer',
          date: '2026-01-02',
          currency_amount: -400,
          investment: 'source:margin:usd',
          quantity: -4,
          description: 'TRANSFER OUT',
          note: 'Accounts Transfer',
          security,
        },
      ],
      new Currencies('usd', {}),
    );

    const open = calculateOpenTransactions(parsed);
    const sourceLot = open.find((lot) => lot.account === 'source:margin:usd');
    const destinationLot = open.find((lot) => lot.account === 'destination:margin:usd');
    expect(sourceLot?.shares).toBe(6);
    expect(destinationLot?.shares).toBe(4);
    expect(destinationLot?.date.format('YYYY-MM-DD')).toBe('2025-01-10');
    expect(destinationLot?.amount).toBeCloseTo(400);
  });

  it('keeps position XIRR history intact through splits and paired transfers', () => {
    const transactions = [
      transaction({
        id: 'xirr-buy',
        account: 'source',
        date: dayjs('2026-01-01'),
        shares: 10,
        amount: 1_000,
        currencyAmount: 1_000,
      }),
      transaction({
        id: 'xirr-split',
        account: 'source',
        date: dayjs('2026-04-01'),
        type: 'split',
        originalType: 'split',
        shares: 0,
        splitRatio: 2,
      }),
      transaction({
        id: 'xirr-transfer-out',
        account: 'source',
        date: dayjs('2026-07-01'),
        type: 'sell',
        originalType: 'transfer',
        shares: -20,
        amount: 1_000,
        description: 'TRANSFER OUT',
      }),
      transaction({
        id: 'xirr-transfer-in',
        account: 'destination',
        date: dayjs('2026-07-01'),
        type: 'buy',
        originalType: 'transfer',
        shares: 20,
        amount: 1_000,
        description: 'TRANSFER IN',
      }),
    ];
    const rate = computeXIRR(
      {
        transactions,
        market_value: 1_200,
        security: { symbol: 'TEST', currency: 'usd' },
      } as any,
      dayjs('2027-01-01').toDate(),
    );
    expect(rate).toBeCloseTo(0.2, 2);
  });
});

describe('local production-mock regression', () => {
  const prodRoot = path.resolve(process.cwd(), 'src/mocks/prod');
  const hasProdMocks = fs.existsSync(path.join(prodRoot, 'transactions-prod.json'));
  // These regressions validate classification in the USD-base mock. No historical
  // FX fixture is stored locally, so provide an explicit (never implicit) CAD rate.
  const getClassificationCurrencies = () =>
    new Currencies('usd', { cad: { '2000-01-01': 1 }, jpy: { '2000-01-01': 1 } });

  it.skipIf(!hasProdMocks)('reproduces the corrected 2026 external flows and common-date TWR', () => {
    const transactions = JSON.parse(fs.readFileSync(path.join(prodRoot, 'transactions-prod.json'), 'utf8'));
    const portfolioResponse = JSON.parse(fs.readFileSync(path.join(prodRoot, 'portfolio-prod.json'), 'utf8'));
    const currencies = getClassificationCurrencies();
    const cashFlows = computeCashFlowByDate(transactions, currencies);
    const ytdFlows = Object.values(cashFlows).filter((flow) => flow.date >= '2026-01-01' && flow.date <= '2026-08-30');
    expect(ytdFlows.reduce((sum, flow) => sum + flow.externalFlow, 0)).toBeCloseTo(105_272.44, 2);

    const portfolioValues = parsePortfolioResponse(portfolioResponse);
    const portfolios = buildPortfolioSeries(portfolioValues, cashFlows).filter(
      (portfolio) => portfolio.date >= '2026-01-01' && portfolio.date <= '2026-08-28',
    );
    const returns = normalizePortfolioToPercentageReturns(portfolios);
    expect(returns[returns.length - 1].value).toBeCloseTo(9.2395307898, 8);
  });

  it.skipIf(!hasProdMocks)('relocates the historical AAPL account transfer into the current account', () => {
    const transactions = JSON.parse(fs.readFileSync(path.join(prodRoot, 'transactions-prod.json'), 'utf8'));
    const appleTransactions = transactions.filter(
      (transaction: any) => transaction.symbol === 'AAPL' || transaction.security?.symbol === 'AAPL',
    );
    const parsed = parseSecurityTransactionsResponse(appleTransactions, getClassificationCurrencies());
    const open = calculateOpenTransactions(parsed);
    const sharesByAccount = open.reduce<Record<string, number>>((totals, lot) => {
      totals[lot.account] = (totals[lot.account] ?? 0) + lot.shares;
      return totals;
    }, {});

    expect(sharesByAccount['U6847800:margin:usd'] ?? 0).toBe(0);
    expect(sharesByAccount['27082310:margin:usd']).toBe(38);
  });

  it.runIf(hasProdMocks && process.env.RUN_MARKET_INTEGRATION === 'true')(
    'reproduces the common-date SPY metrics from the configured market source',
    async () => {
      const transactions = JSON.parse(fs.readFileSync(path.join(prodRoot, 'transactions-prod.json'), 'utf8'));
      const portfolioResponse = JSON.parse(fs.readFileSync(path.join(prodRoot, 'portfolio-prod.json'), 'utf8'));
      const cashFlows = computeCashFlowByDate(transactions, getClassificationCurrencies());
      const portfolios = buildPortfolioSeries(parsePortfolioResponse(portfolioResponse), cashFlows).filter(
        (portfolio) => portfolio.date >= '2026-01-01' && portfolio.date <= '2026-08-28',
      );
      const portfolioReturns = normalizePortfolioToPercentageReturns(portfolios);

      const response = await fetch(
        'https://finance-api.mani-coder.dev/api/historical?symbol=SPY&period1=2025-12-31&period2=2026-08-31&interval=1d',
      );
      const prices = await response.json();
      const benchmarkReturns = normalizeToPercentageReturns(
        prices.map((price: any) => ({ date: price.date.slice(0, 10), value: price.adjClose })),
        '2026-01-01',
      ).filter((point) => point.date <= '2026-08-28');

      expect(benchmarkReturns[benchmarkReturns.length - 1].value).toBeCloseTo(13.4207110134, 8);
      expect(calculateAlpha(portfolioReturns, benchmarkReturns)).toBeCloseTo(-4.1811802236, 8);
      expect(calculateCorrelation(portfolioReturns, benchmarkReturns)).toBeCloseTo(0.721375289, 6);
      expect(calculateBeta(portfolioReturns, benchmarkReturns)).toBeCloseTo(0.746239575, 6);
      expect(calculateConsistencyScore(portfolioReturns, benchmarkReturns)).toBeCloseTo(48.484848, 5);
      expect(calculateAverageRecoveryTime(portfolioReturns)).toBe(17);
      expect(calculateOpportunityCost(portfolios, benchmarkReturns)).toBeCloseTo(-41_427.07, 2);
    },
  );
});
