import dayjs from 'dayjs';
import { DATE_FORMAT } from '../constants';
import type { CashFlow, Portfolio, ReturnPoint } from '../types';

export type PercentageReturnPoint = {
  date: string;
  value: number;
};

export function buildPortfolioSeries(
  portfolioByDate: Record<string, number>,
  cashFlowByDate: Record<string, CashFlow>,
): Portfolio[] {
  const sortedDates = Object.keys(portfolioByDate).sort();
  if (sortedDates.length === 0) return [];

  let depositsToDate = Object.keys(cashFlowByDate)
    .filter((date) => date < sortedDates[0])
    .reduce((total, date) => total + cashFlowByDate[date].externalFlow, 0);

  const portfolios = sortedDates.map((date) => {
    const externalFlow = cashFlowByDate[date]?.externalFlow ?? 0;
    depositsToDate += externalFlow;
    return {
      date,
      value: portfolioByDate[date],
      deposits: depositsToDate,
      externalFlow,
    };
  });

  const returns = calculateTimeWeightedReturns(portfolios);
  const returnsByDate = new Map(returns.map((point) => [point.date, point]));
  return portfolios.map((portfolio) => ({
    ...portfolio,
    dailyReturn: returnsByDate.get(portfolio.date)?.dailyReturn ?? null,
    cumulativeReturn: returnsByDate.get(portfolio.date)?.cumulativeReturn ?? 0,
  }));
}

/**
 * Calculate end-of-day-flow time-weighted returns.
 * The first valuation is the opening baseline and therefore has no daily return.
 */
export function calculateTimeWeightedReturns(portfolios: Portfolio[]): ReturnPoint[] {
  const sorted = [...portfolios].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  let cumulativeGrowth = 1;
  return sorted.map((portfolio, index) => {
    if (index === 0) {
      return { date: portfolio.date, dailyReturn: null, cumulativeReturn: 0 };
    }

    const previous = sorted[index - 1];
    if (!Number.isFinite(previous.value) || previous.value === 0) {
      return { date: portfolio.date, dailyReturn: null, cumulativeReturn: cumulativeGrowth - 1 };
    }

    const datesAreConsecutive = calendarDaysBetween(previous.date, portfolio.date) === 1;
    const cumulativeFlowChange = Number.isFinite(portfolio.deposits - previous.deposits)
      ? portfolio.deposits - previous.deposits
      : 0;
    const externalFlow = datesAreConsecutive ? (portfolio.externalFlow ?? cumulativeFlowChange) : cumulativeFlowChange;
    const dailyReturn = (portfolio.value - externalFlow) / previous.value - 1;
    if (Number.isFinite(dailyReturn)) {
      cumulativeGrowth *= 1 + dailyReturn;
    }

    return {
      date: portfolio.date,
      dailyReturn: Number.isFinite(dailyReturn) ? dailyReturn : null,
      cumulativeReturn: cumulativeGrowth - 1,
    };
  });
}

export function toPercentageReturnPoints(points: ReturnPoint[]): PercentageReturnPoint[] {
  return points.map((point) => ({ date: point.date, value: point.cumulativeReturn * 100 }));
}

export function calculatePeriodReturn(points: ReturnPoint[], fromDate: string, toDate: string): number | null {
  const periodPoints = points.filter((point) => point.date >= fromDate && point.date <= toDate);
  if (periodPoints.length === 0) return null;

  return (
    periodPoints.reduce((growth, point) => {
      return point.dailyReturn === null ? growth : growth * (1 + point.dailyReturn);
    }, 1) - 1
  );
}

export function findCommonDateRange(
  portfolioDates: string[],
  benchmarkDates: string[],
): { fromDate: string; toDate: string } | null {
  if (portfolioDates.length === 0 || benchmarkDates.length === 0) return null;
  const portfolioSet = new Set(portfolioDates);
  const commonDates = benchmarkDates.filter((date) => portfolioSet.has(date)).sort();
  if (commonDates.length === 0) return null;
  return { fromDate: commonDates[0], toDate: commonDates[commonDates.length - 1] };
}

/**
 * Simulate investing the opening portfolio value in the benchmark while applying the
 * portfolio's external flows on the same dates. Returns actual minus counterfactual.
 */
export function calculateCashFlowMatchedOpportunityCost(
  portfolios: Portfolio[],
  benchmarkReturns: PercentageReturnPoint[],
): number | null {
  if (portfolios.length === 0 || benchmarkReturns.length < 2) return null;

  const sortedPortfolios = [...portfolios].sort((left, right) => left.date.localeCompare(right.date));
  const portfoliosByDate = new Map(sortedPortfolios.map((portfolio) => [portfolio.date, portfolio]));
  const alignedBenchmark = benchmarkReturns
    .filter((point) => portfoliosByDate.has(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (alignedBenchmark.length < 2) return null;

  const openingPortfolio = portfoliosByDate.get(alignedBenchmark[0].date);
  if (!openingPortfolio) return null;

  let benchmarkValue = openingPortfolio.value;
  let previousBenchmark = alignedBenchmark[0];
  let previousPortfolio = openingPortfolio;
  const benchmarkByDate = new Map(alignedBenchmark.map((point) => [point.date, point]));
  const comparisonEndDate = alignedBenchmark[alignedBenchmark.length - 1].date;

  for (const portfolio of sortedPortfolios.filter(
    (point) => point.date > openingPortfolio.date && point.date <= comparisonEndDate,
  )) {
    const benchmark = benchmarkByDate.get(portfolio.date);
    if (benchmark) {
      const previousGrowth = 1 + previousBenchmark.value / 100;
      const currentGrowth = 1 + benchmark.value / 100;
      if (previousGrowth === 0) return null;

      const benchmarkPeriodReturn = currentGrowth / previousGrowth - 1;
      benchmarkValue *= 1 + benchmarkPeriodReturn;
      previousBenchmark = benchmark;
    }

    // Apply each external flow on its actual portfolio date. On non-trading
    // dates the benchmark is flat, so the flow is present for the next market interval.
    const cumulativeFlowChange = portfolio.deposits - previousPortfolio.deposits;
    const externalFlow = portfolio.externalFlow ?? cumulativeFlowChange;
    benchmarkValue += Number.isFinite(externalFlow) ? externalFlow : 0;
    previousPortfolio = portfolio;
  }

  const endingPortfolio = portfoliosByDate.get(alignedBenchmark[alignedBenchmark.length - 1].date);
  return endingPortfolio ? endingPortfolio.value - benchmarkValue : null;
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  return dayjs(toDate, DATE_FORMAT).diff(dayjs(fromDate, DATE_FORMAT), 'day');
}
