import dayjs from 'dayjs';
import { DATE_FORMAT } from '../constants';
import type { CashFlow, Portfolio, ReturnPoint } from '../types';

export type PercentageReturnPoint = {
  date: string;
  value: number;
};

export type ScenarioSleeve = {
  symbol: string;
  allocation: number;
  returns: PercentageReturnPoint[];
};

export type CashFlowMatchedScenarioResult = {
  openingDate: string;
  effectiveEndDate: string;
  openingValue: number;
  endingValue: number;
  returnPercent: number;
  actualEndingValue: number;
  actualMinusScenario: number;
  portfolios: Portfolio[];
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
 * Simulate a fixed-allocation set of benchmark sleeves using the portfolio's
 * opening value and external flows. Each flow is split by the original target
 * allocation and the sleeves then drift independently; there is no implicit
 * daily rebalancing.
 */
export function simulateCashFlowMatchedScenario(
  portfolios: Portfolio[],
  sleeves: ScenarioSleeve[],
): CashFlowMatchedScenarioResult | null {
  if (portfolios.length === 0 || sleeves.length === 0 || !hasValidAllocations(sleeves)) return null;

  const sortedPortfolios = [...portfolios].sort((left, right) => left.date.localeCompare(right.date));
  const portfoliosByDate = new Map(sortedPortfolios.map((portfolio) => [portfolio.date, portfolio]));

  const alignedSleeves = sleeves.map((sleeve) => ({
    ...sleeve,
    returns: [...sleeve.returns]
      .filter(
        (point) => portfoliosByDate.has(point.date) && Number.isFinite(point.value) && 1 + point.value / 100 !== 0,
      )
      .sort((left, right) => left.date.localeCompare(right.date)),
  }));
  if (alignedSleeves.some((sleeve) => sleeve.returns.length < 2)) return null;

  const commonOpeningDate = findCommonDate(
    alignedSleeves.map((sleeve) => sleeve.returns.map((point) => point.date)),
    'first',
  );
  if (!commonOpeningDate) return null;

  const lastAvailableDate = alignedSleeves.map((sleeve) => sleeve.returns[sleeve.returns.length - 1].date).sort()[0];
  const effectiveEndDate = [...portfoliosByDate.keys()]
    .filter((date) => date >= commonOpeningDate && date <= lastAvailableDate)
    .sort()
    .at(-1);
  const openingPortfolio = portfoliosByDate.get(commonOpeningDate);
  const endingPortfolio = effectiveEndDate ? portfoliosByDate.get(effectiveEndDate) : undefined;
  if (!effectiveEndDate || !openingPortfolio || !endingPortfolio || effectiveEndDate === commonOpeningDate) return null;

  const states = alignedSleeves.map((sleeve) => {
    const openingReturn = sleeve.returns.find((point) => point.date === commonOpeningDate);
    return {
      allocation: sleeve.allocation,
      value: openingPortfolio.value * sleeve.allocation,
      previousReturn: openingReturn as PercentageReturnPoint,
      returnsByDate: new Map(sleeve.returns.map((point) => [point.date, point])),
    };
  });

  let previousPortfolio = openingPortfolio;
  const scenarioPortfolios: Portfolio[] = [
    {
      date: openingPortfolio.date,
      value: openingPortfolio.value,
      deposits: openingPortfolio.deposits,
      externalFlow: 0,
    },
  ];

  for (const portfolio of sortedPortfolios.filter(
    (point) => point.date > commonOpeningDate && point.date <= effectiveEndDate,
  )) {
    for (const state of states) {
      const currentReturn = state.returnsByDate.get(portfolio.date);
      if (currentReturn) {
        const previousGrowth = 1 + state.previousReturn.value / 100;
        const currentGrowth = 1 + currentReturn.value / 100;
        if (previousGrowth === 0) return null;
        state.value *= currentGrowth / previousGrowth;
        state.previousReturn = currentReturn;
      }
    }

    // Returns are applied before an end-of-day flow on the same date. A flow
    // on a non-trading date remains invested for the next market interval.
    const cumulativeFlowChange = portfolio.deposits - previousPortfolio.deposits;
    const externalFlow = portfolio.externalFlow ?? cumulativeFlowChange;
    const finiteExternalFlow = Number.isFinite(externalFlow) ? externalFlow : 0;
    for (const state of states) {
      state.value += finiteExternalFlow * state.allocation;
    }

    scenarioPortfolios.push({
      date: portfolio.date,
      value: states.reduce((total, state) => total + state.value, 0),
      deposits: portfolio.deposits,
      externalFlow: finiteExternalFlow,
    });
    previousPortfolio = portfolio;
  }

  const portfoliosWithReturns = buildReturnsOntoPortfolios(scenarioPortfolios);
  const finalScenario = portfoliosWithReturns[portfoliosWithReturns.length - 1];
  return {
    openingDate: commonOpeningDate,
    effectiveEndDate,
    openingValue: openingPortfolio.value,
    endingValue: finalScenario.value,
    returnPercent: (finalScenario.cumulativeReturn ?? 0) * 100,
    actualEndingValue: endingPortfolio.value,
    actualMinusScenario: endingPortfolio.value - finalScenario.value,
    portfolios: portfoliosWithReturns,
  };
}

/**
 * Simulate investing the opening portfolio value in the benchmark while applying the
 * portfolio's external flows on the same dates. Returns actual minus counterfactual.
 */
export function calculateCashFlowMatchedOpportunityCost(
  portfolios: Portfolio[],
  benchmarkReturns: PercentageReturnPoint[],
): number | null {
  return (
    simulateCashFlowMatchedScenario(portfolios, [{ symbol: 'Benchmark', allocation: 1, returns: benchmarkReturns }])
      ?.actualMinusScenario ?? null
  );
}

function hasValidAllocations(sleeves: ScenarioSleeve[]): boolean {
  if (sleeves.some((sleeve) => !Number.isFinite(sleeve.allocation) || sleeve.allocation < 0)) return false;
  const totalAllocation = sleeves.reduce((total, sleeve) => total + sleeve.allocation, 0);
  return Math.abs(totalAllocation - 1) <= 1e-8;
}

function findCommonDate(dateCollections: string[][], position: 'first' | 'last'): string | null {
  if (dateCollections.length === 0 || dateCollections.some((dates) => dates.length === 0)) return null;
  const otherDateSets = dateCollections.slice(1).map((dates) => new Set(dates));
  const commonDates = dateCollections[0].filter((date) => otherDateSets.every((dates) => dates.has(date))).sort();
  if (commonDates.length === 0) return null;
  return position === 'first' ? commonDates[0] : commonDates[commonDates.length - 1];
}

function buildReturnsOntoPortfolios(portfolios: Portfolio[]): Portfolio[] {
  const returnsByDate = new Map(calculateTimeWeightedReturns(portfolios).map((point) => [point.date, point]));
  return portfolios.map((portfolio) => ({
    ...portfolio,
    dailyReturn: returnsByDate.get(portfolio.date)?.dailyReturn ?? null,
    cumulativeReturn: returnsByDate.get(portfolio.date)?.cumulativeReturn ?? 0,
  }));
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  return dayjs(toDate, DATE_FORMAT).diff(dayjs(fromDate, DATE_FORMAT), 'day');
}
