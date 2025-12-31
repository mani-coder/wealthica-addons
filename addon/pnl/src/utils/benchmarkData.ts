import dayjs from 'dayjs';
import { DATE_FORMAT } from '../constants';
import { isTradingDay } from './common';

export type BenchmarkType = 'SPY' | 'VOO' | 'VOOG' | 'QQQ' | 'QQQM' | 'VTI' | 'DIA' | 'IWM';

export type BenchmarkInfo = {
  symbol: BenchmarkType;
  name: string;
  description: string;
  securityId: string;
};

// To find security IDs: curl 'https://app.wealthica.com/api/securities?search=SYMBOL'
// Sorted by index type: S&P 500, NASDAQ-100, Total Market, Dow Jones, Russell 2000
export const BENCHMARKS: Record<BenchmarkType, BenchmarkInfo> = {
  SPY: {
    symbol: 'SPY',
    name: 'S&P 500',
    description: 'SPDR S&P 500 ETF Trust',
    securityId: '55e127778a64ac0619047c0f',
  },
  VOO: {
    symbol: 'VOO',
    name: 'S&P 500',
    description: 'Vanguard S&P 500 ETF',
    securityId: '590e0a21bb797d001085fa56',
  },
  VOOG: {
    symbol: 'VOOG',
    name: 'S&P 500 Growth',
    description: 'Vanguard S&P 500 Growth ETF',
    securityId: '5ba595fc5f675e1d885ba48e',
  },
  QQQ: {
    symbol: 'QQQ',
    name: 'NASDAQ-100',
    description: 'Invesco QQQ Trust',
    securityId: '573a09835cfa2be20553ea64',
  },
  QQQM: {
    symbol: 'QQQM',
    name: 'NASDAQ-100',
    description: 'Invesco NASDAQ 100 ETF',
    securityId: '5f8a0172903d5972b926af05',
  },
  VTI: {
    symbol: 'VTI',
    name: 'Total US Market',
    description: 'Vanguard Total Stock Market ETF - Tracks entire US market',
    securityId: '5760492dd0ffb39201256e2c',
  },
  DIA: {
    symbol: 'DIA',
    name: 'Dow Jones',
    description: 'SPDR Dow Jones Industrial Average ETF',
    securityId: '57dfec605046a4390adf535a',
  },
  IWM: {
    symbol: 'IWM',
    name: 'Russell 2000',
    description: 'iShares Russell 2000 ETF - Tracks small-cap stocks',
    securityId: '579a74552a34030e00ab7ef1',
  },
};

/**
 * Normalize data to percentage returns from start value
 */
export function normalizeToPercentageReturns(
  data: { date: string; value: number }[],
): { date: string; value: number }[] {
  if (data.length === 0) return [];
  const startValue = data[0].value;
  return data.map((point) => ({ date: point.date, value: ((point.value - startValue) / startValue) * 100 }));
}

/**
 * Normalize portfolio data to percentage returns accounting for deposits/withdrawals
 */
export function normalizePortfolioToPercentageReturns(
  portfolios: { date: string; value: number; deposits: number }[],
): { date: string; value: number }[] {
  if (portfolios.length === 0) return [];

  // Filter to only trading days (exclude weekends and holidays)
  const tradingDayPortfolios = portfolios.filter((portfolio) => isTradingDay(dayjs(portfolio.date, DATE_FORMAT)));

  if (tradingDayPortfolios.length === 0) return [];

  // Calculate the starting P/L ratio to normalize against
  const startPortfolio = tradingDayPortfolios[0];
  const startPnl = startPortfolio.value - startPortfolio.deposits;
  const startPnlRatio = startPortfolio.deposits !== 0 ? (startPnl / Math.abs(startPortfolio.deposits)) * 100 : 0;

  return tradingDayPortfolios.map((portfolio) => {
    const pnl = portfolio.value - portfolio.deposits;
    const pnlRatio = portfolio.deposits !== 0 ? (pnl / Math.abs(portfolio.deposits)) * 100 : 0;
    // Normalize to 0% at start date
    return { date: portfolio.date, value: pnlRatio - startPnlRatio };
  });
}

/**
 * Calculate alpha (portfolio return - benchmark return)
 */
export function calculateAlpha(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): number {
  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) return 0;

  const portfolioFinalReturn = portfolioReturns[portfolioReturns.length - 1].value;
  const benchmarkFinalReturn = benchmarkReturns[benchmarkReturns.length - 1].value;

  return portfolioFinalReturn - benchmarkFinalReturn;
}

/**
 * Calculate simple correlation between portfolio and benchmark
 */
export function calculateCorrelation(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): number {
  // Align dates between portfolio and benchmark
  const benchmarkMap = new Map(benchmarkReturns.map((b) => [b.date, b.value]));

  const alignedData: Array<{ portfolio: number; benchmark: number }> = [];

  portfolioReturns.forEach((p) => {
    const benchmarkValue = benchmarkMap.get(p.date);
    if (benchmarkValue !== undefined) {
      alignedData.push({ portfolio: p.value, benchmark: benchmarkValue });
    }
  });

  if (alignedData.length < 2) return 0;

  // Calculate Pearson correlation coefficient
  const n = alignedData.length;
  const sumP = alignedData.reduce((sum, d) => sum + d.portfolio, 0);
  const sumB = alignedData.reduce((sum, d) => sum + d.benchmark, 0);
  const sumPB = alignedData.reduce((sum, d) => sum + d.portfolio * d.benchmark, 0);
  const sumP2 = alignedData.reduce((sum, d) => sum + d.portfolio * d.portfolio, 0);
  const sumB2 = alignedData.reduce((sum, d) => sum + d.benchmark * d.benchmark, 0);

  const numerator = n * sumPB - sumP * sumB;
  const denominator = Math.sqrt((n * sumP2 - sumP * sumP) * (n * sumB2 - sumB * sumB));

  if (denominator === 0) return 0;

  return numerator / denominator;
}
