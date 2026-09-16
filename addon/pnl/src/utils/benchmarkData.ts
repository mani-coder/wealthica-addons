import dayjs from 'dayjs';
import { DATE_FORMAT } from '../constants';
import type { Portfolio } from '../types';
import {
  calculateCashFlowMatchedOpportunityCost,
  calculateTimeWeightedReturns,
  calendarDaysBetween,
  toPercentageReturnPoints,
} from './portfolioPerformance';

// Sorted by region and index type
export const BENCHMARKS = {
  // === US EQUITY BENCHMARKS ===
  SPY: {
    symbol: 'SPY',
    name: 'S&P 500',
    description: 'SPDR S&P 500 ETF Trust',
    currency: 'USD',
    securityId: '55e127778a64ac0619047c0f',
  },
  VOO: {
    symbol: 'VOO',
    name: 'S&P 500',
    description: 'Vanguard S&P 500 ETF',
    currency: 'USD',
    securityId: '590e0a21bb797d001085fa56',
  },
  VOOG: {
    symbol: 'VOOG',
    name: 'S&P 500 Growth',
    description: 'Vanguard S&P 500 Growth ETF',
    currency: 'USD',
    securityId: '5ba595fc5f675e1d885ba48e',
  },
  QQQ: {
    symbol: 'QQQ',
    name: 'NASDAQ-100',
    description: 'Invesco QQQ Trust',
    currency: 'USD',
    securityId: '573a09835cfa2be20553ea64',
  },
  QQQM: {
    symbol: 'QQQM',
    name: 'NASDAQ-100',
    description: 'Invesco NASDAQ 100 ETF',
    currency: 'USD',
    securityId: '5f8a0172903d5972b926af05',
  },
  VTI: {
    symbol: 'VTI',
    name: 'Total US Market',
    description: 'Vanguard Total Stock Market ETF - Tracks entire US market',
    currency: 'USD',
    securityId: '5760492dd0ffb39201256e2c',
  },
  DIA: {
    symbol: 'DIA',
    name: 'Dow Jones',
    description: 'SPDR Dow Jones Industrial Average ETF',
    currency: 'USD',
    securityId: '57dfec605046a4390adf535a',
  },
  IWM: {
    symbol: 'IWM',
    name: 'Russell 2000',
    description: 'iShares Russell 2000 ETF - Tracks small-cap stocks',
    currency: 'USD',
    securityId: '579a74552a34030e00ab7ef1',
  },

  // === CANADIAN EQUITY BENCHMARKS ===
  'XIC.TO': {
    symbol: 'XIC.TO',
    name: 'S&P/TSX Composite',
    description: 'iShares Core S&P/TSX Capped Composite Index ETF - Tracks broad Canadian market (~239 holdings)',
    currency: 'CAD',
    securityId: '56daa905c3a79c03002c4dff',
  },
  'VCN.TO': {
    symbol: 'VCN.TO',
    name: 'FTSE Canada All Cap',
    description:
      'Vanguard FTSE Canada All Cap Index ETF - Tracks large, mid, and small-cap Canadian stocks (~173-205 holdings)',
    currency: 'CAD',
    securityId: '574b7828109d820e001ae526',
  },
  'XIU.TO': {
    symbol: 'XIU.TO',
    name: 'S&P/TSX 60',
    description: 'iShares S&P/TSX 60 Index ETF - Tracks 60 largest Canadian stocks',
    currency: 'CAD',
    securityId: '55e127778a64ac0619047c0d',
  },
} as const;

export type BenchmarkType = keyof typeof BENCHMARKS;

export type BenchmarkInfo = (typeof BENCHMARKS)[BenchmarkType];

/**
 * Normalize data to percentage returns from start value
 */
export function normalizeToPercentageReturns(
  data: { date: string; value: number }[],
  startDate?: string,
): { date: string; value: number }[] {
  if (data.length === 0) return [];
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

  if (!startDate) {
    const startValue = sorted[0].value;
    return sorted.map((point) => ({ date: point.date, value: ((point.value - startValue) / startValue) * 100 }));
  }

  const exactStart = sorted.find((point) => point.date === startDate);
  const priorStart = [...sorted].reverse().find((point) => point.date < startDate);
  const baseline = exactStart ?? priorStart ?? sorted.find((point) => point.date > startDate);
  if (!baseline || baseline.value === 0) return [];

  const normalized = sorted
    .filter((point) => point.date >= startDate)
    .map((point) => ({ date: point.date, value: ((point.value - baseline.value) / baseline.value) * 100 }));

  if (!exactStart && normalized[0]?.date !== startDate) {
    normalized.unshift({ date: startDate, value: 0 });
  }
  return normalized;
}

/**
 * Normalize portfolio data to percentage returns accounting for deposits/withdrawals
 */
export function normalizePortfolioToPercentageReturns(
  portfolios: { date: string; value: number; deposits: number }[],
): { date: string; value: number }[] {
  if (portfolios.length === 0) return [];

  const sortedPortfolios = [...portfolios].sort((a, b) => a.date.localeCompare(b.date));
  return toPercentageReturnPoints(calculateTimeWeightedReturns(sortedPortfolios));
}

function getAlignedDailyReturns(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): Array<{ date: string; portfolio: number; benchmark: number }> {
  const benchmarkMap = new Map(benchmarkReturns.map((point) => [point.date, point.value]));
  const alignedLevels = portfolioReturns
    .filter((point) => benchmarkMap.has(point.date))
    .map((point) => ({ date: point.date, portfolio: point.value, benchmark: benchmarkMap.get(point.date) as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const dailyReturns: Array<{ date: string; portfolio: number; benchmark: number }> = [];
  for (let index = 1; index < alignedLevels.length; index++) {
    const previous = alignedLevels[index - 1];
    const current = alignedLevels[index];
    const previousPortfolioGrowth = 1 + previous.portfolio / 100;
    const previousBenchmarkGrowth = 1 + previous.benchmark / 100;
    if (previousPortfolioGrowth === 0 || previousBenchmarkGrowth === 0) continue;

    dailyReturns.push({
      date: current.date,
      portfolio: (1 + current.portfolio / 100) / previousPortfolioGrowth - 1,
      benchmark: (1 + current.benchmark / 100) / previousBenchmarkGrowth - 1,
    });
  }
  return dailyReturns;
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
): number | null {
  const alignedData = getAlignedDailyReturns(portfolioReturns, benchmarkReturns);

  if (alignedData.length < 2) return null;

  // Calculate Pearson correlation coefficient
  const n = alignedData.length;
  const sumP = alignedData.reduce((sum, d) => sum + d.portfolio, 0);
  const sumB = alignedData.reduce((sum, d) => sum + d.benchmark, 0);
  const sumPB = alignedData.reduce((sum, d) => sum + d.portfolio * d.benchmark, 0);
  const sumP2 = alignedData.reduce((sum, d) => sum + d.portfolio * d.portfolio, 0);
  const sumB2 = alignedData.reduce((sum, d) => sum + d.benchmark * d.benchmark, 0);

  const numerator = n * sumPB - sumP * sumB;
  const denominator = Math.sqrt((n * sumP2 - sumP * sumP) * (n * sumB2 - sumB * sumB));

  if (denominator === 0) return null;

  return numerator / denominator;
}

/**
 * Calculate portfolio beta (volatility relative to benchmark)
 * Beta > 1: More volatile than benchmark
 * Beta < 1: Less volatile than benchmark
 * Beta = 1: Same volatility as benchmark
 */
export function calculateBeta(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): number | null {
  const alignedDailyReturns = getAlignedDailyReturns(portfolioReturns, benchmarkReturns);
  const portfolioDailyReturns = alignedDailyReturns.map((point) => point.portfolio);
  const benchmarkDailyReturns = alignedDailyReturns.map((point) => point.benchmark);

  const n = portfolioDailyReturns.length;
  if (n < 2) return null;

  // Calculate means
  const pMean = portfolioDailyReturns.reduce((sum, r) => sum + r, 0) / n;
  const bMean = benchmarkDailyReturns.reduce((sum, r) => sum + r, 0) / n;

  // Calculate covariance and variance
  let covariance = 0;
  let benchmarkVariance = 0;

  for (let i = 0; i < n; i++) {
    const pDiff = portfolioDailyReturns[i] - pMean;
    const bDiff = benchmarkDailyReturns[i] - bMean;
    covariance += pDiff * bDiff;
    benchmarkVariance += bDiff * bDiff;
  }

  covariance /= n;
  benchmarkVariance /= n;

  if (benchmarkVariance === 0) return null;

  return covariance / benchmarkVariance;
}

/**
 * Calculate consistency score - percentage of days portfolio beat the benchmark
 */
export function calculateConsistencyScore(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): number | null {
  const dailyReturns = getAlignedDailyReturns(portfolioReturns, benchmarkReturns);
  const daysBeatingBenchmark = dailyReturns.filter((point) => point.portfolio > point.benchmark).length;
  const totalDays = dailyReturns.length;

  if (totalDays === 0) return null;

  return (daysBeatingBenchmark / totalDays) * 100;
}

/**
 * Calculate average recovery time from drawdowns (in days)
 */
export function calculateAverageRecoveryTime(returns: { date: string; value: number }[]): number {
  if (returns.length === 0) return 0;

  const recoveryPeriods: number[] = [];
  let peak = returns[0].value;
  let drawdownStartDate: string | null = null;

  for (let i = 0; i < returns.length; i++) {
    const point = returns[i];

    if (point.value >= peak) {
      // New peak or recovery
      if (drawdownStartDate !== null) {
        // We were in a drawdown and just recovered
        const recoveryDays = calendarDaysBetween(drawdownStartDate, point.date);
        recoveryPeriods.push(recoveryDays);
        drawdownStartDate = null;
      }
      peak = point.value;
    } else {
      // In a drawdown
      if (drawdownStartDate === null) {
        drawdownStartDate = point.date;
      }
    }
  }

  if (recoveryPeriods.length === 0) return 0;

  const avgRecoveryDays = recoveryPeriods.reduce((sum, days) => sum + days, 0) / recoveryPeriods.length;
  return Math.round(avgRecoveryDays);
}

/**
 * Calculate risk level in plain English
 */
export function calculateRiskLevel(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): 'Lower Risk' | 'Similar Risk' | 'Higher Risk' | 'Insufficient Data' {
  if (getAlignedDailyReturns(portfolioReturns, benchmarkReturns).length < 2) return 'Insufficient Data';
  const beta = calculateBeta(portfolioReturns, benchmarkReturns);
  if (beta === null) return 'Insufficient Data';

  if (beta < 0.85) return 'Lower Risk';
  if (beta > 1.15) return 'Higher Risk';
  return 'Similar Risk';
}

/**
 * Calculate the actual ending value minus a benchmark counterfactual that
 * receives the portfolio's external cash flows on the same dates.
 */
export function calculateOpportunityCost(
  portfolios: Portfolio[],
  benchmarkReturns: { date: string; value: number }[],
): number | null {
  return calculateCashFlowMatchedOpportunityCost(portfolios, benchmarkReturns);
}

export type PeriodReturn = {
  period: string; // e.g., "2024" or "Jan 2024"
  portfolioReturn: number;
  benchmarkReturn: number;
  difference: number;
  outperformed: boolean;
  children?: PeriodReturn[]; // For nested monthly data under yearly rows
};

/**
 * Calculate returns by year for multi-year periods
 */
export function calculateYearlyReturns(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): PeriodReturn[] {
  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) return [];

  // Group by year
  const portfolioByYear = new Map<string, { start: number; end: number }>();
  const benchmarkByYear = new Map<string, { start: number; end: number }>();

  // Process portfolio data. A period starts at the prior observation so the first
  // return inside each year is included.
  let previousPortfolioValue = 0;
  portfolioReturns.forEach((point) => {
    const year = dayjs(point.date, DATE_FORMAT).year().toString();
    if (!portfolioByYear.has(year)) {
      portfolioByYear.set(year, { start: previousPortfolioValue, end: point.value });
    } else {
      const yearData = portfolioByYear.get(year);
      if (yearData) {
        yearData.end = point.value;
      }
    }
    previousPortfolioValue = point.value;
  });

  // Process benchmark data
  let previousBenchmarkValue = 0;
  benchmarkReturns.forEach((point) => {
    const year = dayjs(point.date, DATE_FORMAT).year().toString();
    if (!benchmarkByYear.has(year)) {
      benchmarkByYear.set(year, { start: previousBenchmarkValue, end: point.value });
    } else {
      const yearData = benchmarkByYear.get(year);
      if (yearData) {
        yearData.end = point.value;
      }
    }
    previousBenchmarkValue = point.value;
  });

  // Calculate yearly returns
  const years = Array.from(new Set([...portfolioByYear.keys(), ...benchmarkByYear.keys()])).sort();

  return years.map((year) => {
    const pData = portfolioByYear.get(year);
    const bData = benchmarkByYear.get(year);

    // Calculate period return accounting for compounding
    // Since values are cumulative returns from start, convert back to get period return
    const portfolioReturn = pData ? ((100 + pData.end) / (100 + pData.start) - 1) * 100 : 0;
    const benchmarkReturn = bData ? ((100 + bData.end) / (100 + bData.start) - 1) * 100 : 0;
    const difference = portfolioReturn - benchmarkReturn;

    return {
      period: year,
      portfolioReturn,
      benchmarkReturn,
      difference,
      outperformed: difference > 0,
    };
  });
}

/**
 * Calculate returns by month for shorter periods
 */
export function calculateMonthlyReturns(
  portfolioReturns: { date: string; value: number }[],
  benchmarkReturns: { date: string; value: number }[],
): PeriodReturn[] {
  if (portfolioReturns.length === 0 || benchmarkReturns.length === 0) return [];

  // Group by year-month
  const portfolioByMonth = new Map<string, { start: number; end: number }>();
  const benchmarkByMonth = new Map<string, { start: number; end: number }>();

  // Process portfolio data. Use the previous observation as the opening baseline
  // so the first return in each month is not dropped.
  let previousPortfolioValue = 0;
  portfolioReturns.forEach((point) => {
    const date = dayjs(point.date, DATE_FORMAT);
    const monthKey = date.format('YYYY-MM');
    if (!portfolioByMonth.has(monthKey)) {
      portfolioByMonth.set(monthKey, { start: previousPortfolioValue, end: point.value });
    } else {
      const monthData = portfolioByMonth.get(monthKey);
      if (monthData) {
        monthData.end = point.value;
      }
    }
    previousPortfolioValue = point.value;
  });

  // Process benchmark data
  let previousBenchmarkValue = 0;
  benchmarkReturns.forEach((point) => {
    const date = dayjs(point.date, DATE_FORMAT);
    const monthKey = date.format('YYYY-MM');
    if (!benchmarkByMonth.has(monthKey)) {
      benchmarkByMonth.set(monthKey, { start: previousBenchmarkValue, end: point.value });
    } else {
      const monthData = benchmarkByMonth.get(monthKey);
      if (monthData) {
        monthData.end = point.value;
      }
    }
    previousBenchmarkValue = point.value;
  });

  // Calculate monthly returns
  const months = Array.from(new Set([...portfolioByMonth.keys(), ...benchmarkByMonth.keys()])).sort();

  return months.map((monthKey) => {
    const pData = portfolioByMonth.get(monthKey);
    const bData = benchmarkByMonth.get(monthKey);

    // Calculate period return accounting for compounding
    // Since values are cumulative returns from start, convert back to get period return
    const portfolioReturn = pData ? ((100 + pData.end) / (100 + pData.start) - 1) * 100 : 0;
    const benchmarkReturn = bData ? ((100 + bData.end) / (100 + bData.start) - 1) * 100 : 0;
    const difference = portfolioReturn - benchmarkReturn;

    // Format as "Jan 2024"
    const period = dayjs(monthKey, 'YYYY-MM').format('MMM YYYY');

    return {
      period,
      portfolioReturn,
      benchmarkReturn,
      difference,
      outperformed: difference > 0,
    };
  });
}

/**
 * Calculate yearly returns with nested monthly breakdowns
 * Returns yearly rows with monthly data as children for expandable table view
 *
 * For portfolio data, this function re-normalizes each year separately to accurately
 * account for deposits/withdrawals within each year, ensuring the yearly returns
 * match what you'd see if you isolated that year's data.
 */
export function calculateYearlyReturnsWithMonthlyBreakdown(
  portfolios: { date: string; value: number; deposits: number }[],
  benchmarkData: { date: string; value: number }[],
  startDate?: string,
): PeriodReturn[] {
  if (portfolios.length === 0 || benchmarkData.length === 0) return [];

  const portfolioReturns = normalizePortfolioToPercentageReturns(portfolios);
  const benchmarkReturns = normalizeToPercentageReturns(benchmarkData, startDate);
  const yearlyReturns = calculateYearlyReturns(portfolioReturns, benchmarkReturns);
  const monthlyReturns = calculateMonthlyReturns(portfolioReturns, benchmarkReturns);

  return yearlyReturns.map((yearReturn) => {
    const monthlyChildren = monthlyReturns
      .filter((monthReturn) => monthReturn.period.endsWith(yearReturn.period))
      .map((monthReturn) => ({ ...monthReturn, period: monthReturn.period.split(' ')[0] }));
    return { ...yearReturn, children: monthlyChildren.length > 0 ? monthlyChildren : undefined };
  });
}
