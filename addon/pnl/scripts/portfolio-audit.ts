import fs from 'node:fs';
import path from 'node:path';
import {
  computeCashFlowByDate,
  parseCurrencyReponse,
  parseInstitutionsResponse,
  parsePortfolioResponse,
  parseSecurityTransactionsResponse,
} from '../src/api';
import { Currencies } from '../src/context/CurrencyContext';
import type { Portfolio, Transaction } from '../src/types';
import {
  calculateAlpha,
  calculateAverageRecoveryTime,
  calculateBeta,
  calculateConsistencyScore,
  calculateCorrelation,
  calculateRiskLevel,
  normalizePortfolioToPercentageReturns,
  normalizeToPercentageReturns,
} from '../src/utils/benchmarkData';
import { getYahooSymbol } from '../src/utils/common';
import {
  type ActiveContributionObservation,
  calculateActiveContributions,
  normalizePricesForDocumentedSplits,
} from '../src/utils/portfolioAttribution';
import { buildPortfolioSeries, simulateCashFlowMatchedScenario } from '../src/utils/portfolioPerformance';

const PROD_ROOT = path.resolve(process.cwd(), 'src/mocks/prod');
const FROM_DATE = '2026-01-01';
const REQUESTED_TO_DATE = '2026-08-30';
const MARKET_REQUEST_TO_DATE = '2026-09-01';
const BENCHMARK_SYMBOLS = ['SPY', 'QQQM', 'VOOG', 'VTI'] as const;
const SECTOR_PROXY_BY_NAME: Record<string, string> = {
  'Basic Materials': 'XLB',
  'Communication Services': 'XLC',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  Energy: 'XLE',
  'Financial Services': 'XLF',
  Healthcare: 'XLV',
  Industrials: 'XLI',
  'Real Estate': 'XLRE',
  Technology: 'XLK',
  Utilities: 'XLU',
};
const SECTOR_PROXY_SYMBOLS = [...new Set(Object.values(SECTOR_PROXY_BY_NAME))];

type HistoricalPrice = {
  date: string;
  close: number;
  adjClose?: number;
};

type ScenarioDefinition = {
  name: string;
  allocations: Partial<Record<(typeof BENCHMARK_SYMBOLS)[number], number>>;
};

const SCENARIOS: ScenarioDefinition[] = [
  { name: 'S&P 500 baseline', allocations: { SPY: 1 } },
  { name: 'QQQM', allocations: { QQQM: 1 } },
  { name: 'VOOG', allocations: { VOOG: 1 } },
  { name: 'Broad-market core + QQQM', allocations: { VTI: 0.8, QQQM: 0.2 } },
  { name: 'Broad-market core + VOOG', allocations: { VTI: 0.8, VOOG: 0.2 } },
];

function readJson(fileName: string): any {
  return JSON.parse(fs.readFileSync(path.join(PROD_ROOT, fileName), 'utf8'));
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function loadCurrencies(): Promise<Currencies> {
  const currencyPairs = await Promise.all(
    ['cad', 'jpy'].map(async (currency) => {
      const response = await fetchJson(`https://app.wealthica.com/api/currencies/usd/history?base=${currency}`);
      return [currency, parseCurrencyReponse(response)] as const;
    }),
  );
  return new Currencies('usd', Object.fromEntries(currencyPairs));
}

async function loadNormalizedReturns(
  symbols: readonly string[],
): Promise<Record<string, { date: string; value: number }[]>> {
  const histories = await Promise.all(
    symbols.map(async (symbol) => {
      const url = new URL('https://finance-api.mani-coder.dev/api/historical');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('period1', '2025-12-24');
      url.searchParams.set('period2', MARKET_REQUEST_TO_DATE);
      url.searchParams.set('interval', '1d');
      const prices = (await fetchJson(url.toString())) as HistoricalPrice[];
      const returns = normalizeToPercentageReturns(
        prices.map((price) => ({
          date: price.date.slice(0, 10),
          value: price.adjClose ?? price.close,
        })),
        FROM_DATE,
      ).filter((point) => point.date <= REQUESTED_TO_DATE);
      return [symbol, returns] as const;
    }),
  );
  return Object.fromEntries(histories);
}

async function loadBenchmarkReturns(): Promise<Record<string, { date: string; value: number }[]>> {
  return loadNormalizedReturns(BENCHMARK_SYMBOLS);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      result[index] = await transform(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

async function loadQuoteTypes(symbols: string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    chunks(symbols, 25).map(async (symbolChunk) => {
      const url = new URL('https://finance-api.mani-coder.dev/api/quote');
      url.searchParams.set('symbols', symbolChunk.join(','));
      url.searchParams.set('fields', 'quoteType');
      const data = await fetchJson(url.toString());
      return Array.isArray(data) ? data : [];
    }),
  );
  return new Map(
    results
      .flat()
      .filter((quote: any) => quote?.symbol)
      .map((quote: any) => [quote.symbol, quote.quoteType]),
  );
}

async function loadSectors(symbols: string[]): Promise<Map<string, string>> {
  const results = await Promise.all(
    chunks(symbols, 25).map(async (symbolChunk) => {
      const url = new URL('https://finance-api.mani-coder.dev/api/quoteSummary');
      url.searchParams.set('symbols', symbolChunk.join(','));
      url.searchParams.set('modules', 'summaryProfile');
      const data = await fetchJson(url.toString());
      return Array.isArray(data) ? data : [];
    }),
  );
  return new Map(
    results
      .flat()
      .filter((summary: any) => summary?.symbol)
      .map((summary: any) => [summary.symbol, summary.data?.summaryProfile?.sector ?? 'Unknown']),
  );
}

async function loadPriceHistories(symbols: string[]): Promise<Map<string, HistoricalPrice[]>> {
  const entries = await mapWithConcurrency(symbols, 8, async (symbol) => {
    try {
      const url = new URL('https://finance-api.mani-coder.dev/api/historical');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('period1', '2025-12-24');
      url.searchParams.set('period2', MARKET_REQUEST_TO_DATE);
      url.searchParams.set('interval', '1d');
      const prices = await fetchJson(url.toString());
      return [symbol, Array.isArray(prices) ? prices : []] as const;
    } catch (error) {
      console.error(`Unable to load history for ${symbol}:`, error instanceof Error ? error.message : error);
      return [symbol, []] as const;
    }
  });
  return new Map(entries);
}

function round(value: number | null, precision = 6): number | null {
  if (value === null) return null;
  return Number(value.toFixed(precision));
}

function independentlyCalculateTwr(
  portfolios: Array<{ date: string; value: number; deposits: number; externalFlow?: number }>,
): number | null {
  if (portfolios.length < 2) return null;
  let growth = 1;
  for (let index = 1; index < portfolios.length; index++) {
    const previous = portfolios[index - 1];
    const current = portfolios[index];
    if (!Number.isFinite(previous.value) || previous.value === 0) return null;
    const flow = current.externalFlow ?? current.deposits - previous.deposits;
    growth *= (current.value - flow) / previous.value;
  }
  return (growth - 1) * 100;
}

function currentQuantitiesByTicker(positions: any[]): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const position of positions) {
    const ticker = getYahooSymbol(position.security);
    quantities.set(ticker, (quantities.get(ticker) ?? 0) + Number(position.quantity || 0));
  }
  return quantities;
}

function currentEquivalentShares(transaction: Transaction, allTransactions: Transaction[]): number {
  if (!['buy', 'sell', 'reinvest'].includes(transaction.type)) return 0;
  const futureSplitAdjustment = allTransactions
    .filter(
      (candidate) =>
        candidate.type === 'split' &&
        candidate.ticker === transaction.ticker &&
        candidate.account === transaction.account &&
        candidate.date.isAfter(transaction.date, 'day') &&
        candidate.splitRatio,
    )
    .reduce((ratio, split) => ratio * (split.splitRatio as number), 1);
  return transaction.shares * futureSplitAdjustment;
}

function latestPriceOnOrBefore(prices: HistoricalPrice[], date: string): HistoricalPrice | undefined {
  return [...prices].reverse().find((price) => price.date.slice(0, 10) <= date);
}

function currencyForTicker(ticker: string, transactions: Transaction[], positions: any[]): string {
  const position = positions.find((candidate) => getYahooSymbol(candidate.security) === ticker);
  const transaction = transactions.find((candidate) => candidate.ticker === ticker);
  return (position?.security?.currency ?? transaction?.currency ?? 'usd').toLowerCase();
}

function buildActiveContributionObservations({
  symbols,
  priceHistories,
  transactions,
  positions,
  portfolios,
  benchmarkReturns,
  currencies,
  sectors,
  updateQuantities = true,
}: {
  symbols: string[];
  priceHistories: Map<string, HistoricalPrice[]>;
  transactions: Transaction[];
  positions: any[];
  portfolios: Portfolio[];
  benchmarkReturns: { date: string; value: number }[];
  currencies: Currencies;
  sectors: Map<string, string>;
  updateQuantities?: boolean;
}): ActiveContributionObservation[] {
  const currentQuantities = currentQuantitiesByTicker(positions);
  const portfoliosByDate = new Map(portfolios.map((portfolio) => [portfolio.date, portfolio]));
  const adjustedTransactions = transactions
    .filter((transaction) => ['buy', 'sell', 'reinvest'].includes(transaction.type))
    .map((transaction) => ({
      transaction,
      date: transaction.date.format('YYYY-MM-DD'),
      shares: currentEquivalentShares(transaction, transactions),
    }));
  const observations: ActiveContributionObservation[] = [];

  for (const symbol of symbols) {
    const prices = priceHistories.get(symbol) ?? [];
    if (prices.length < 2) continue;
    const normalizedPrices = new Map(
      normalizePricesForDocumentedSplits(
        prices.map((price) => ({ date: price.date.slice(0, 10), value: price.adjClose ?? price.close })),
        transactions
          .filter(
            (transaction) => transaction.ticker === symbol && transaction.type === 'split' && transaction.splitRatio,
          )
          .map((transaction) => ({
            date: transaction.date.format('YYYY-MM-DD'),
            ratio: transaction.splitRatio as number,
          })),
      ).map((price) => [price.date, price.value]),
    );
    const symbolTransactions = adjustedTransactions.filter((entry) => entry.transaction.ticker === symbol);
    let quantity =
      (currentQuantities.get(symbol) ?? 0) -
      symbolTransactions.filter((entry) => entry.date > FROM_DATE).reduce((total, entry) => total + entry.shares, 0);
    const currency = currencyForTicker(symbol, transactions, positions);

    for (let index = 1; index < benchmarkReturns.length; index++) {
      const previousBenchmark = benchmarkReturns[index - 1];
      const benchmark = benchmarkReturns[index];
      if (updateQuantities) {
        for (const entry of symbolTransactions.filter(
          (candidate) => candidate.date > previousBenchmark.date && candidate.date < benchmark.date,
        )) {
          quantity += entry.shares;
        }
      }

      const previousPrice = latestPriceOnOrBefore(prices, previousBenchmark.date);
      const currentPrice = latestPriceOnOrBefore(prices, benchmark.date);
      const portfolio = portfoliosByDate.get(previousBenchmark.date);
      if (previousPrice && currentPrice && portfolio) {
        const previousLocalPrice = normalizedPrices.get(previousPrice.date.slice(0, 10)) as number;
        const currentLocalPrice = normalizedPrices.get(currentPrice.date.slice(0, 10)) as number;
        const previousBasePrice = currencies.getValue(currency, previousLocalPrice, previousBenchmark.date);
        const currentBasePrice = currencies.getValue(currency, currentLocalPrice, benchmark.date);
        const previousBenchmarkGrowth = 1 + previousBenchmark.value / 100;
        const currentBenchmarkGrowth = 1 + benchmark.value / 100;
        if (previousBasePrice > 0 && previousBenchmarkGrowth !== 0) {
          observations.push({
            date: benchmark.date,
            symbol,
            beginningValue: quantity * previousBasePrice,
            portfolioBeginningValue: portfolio.value,
            securityReturn: currentBasePrice / previousBasePrice - 1,
            localSecurityReturn: currentLocalPrice / previousLocalPrice - 1,
            benchmarkReturn: currentBenchmarkGrowth / previousBenchmarkGrowth - 1,
            sector: sectors.get(symbol) ?? 'Unknown',
          });
        }
      }

      if (updateQuantities) {
        for (const entry of symbolTransactions.filter((candidate) => candidate.date === benchmark.date)) {
          quantity += entry.shares;
        }
      }
    }
  }

  return observations;
}

function dailyReturnsByDate(returns: { date: string; value: number }[]): Map<string, number> {
  const result = new Map<string, number>();
  for (let index = 1; index < returns.length; index++) {
    const previousGrowth = 1 + returns[index - 1].value / 100;
    const currentGrowth = 1 + returns[index].value / 100;
    if (previousGrowth !== 0) result.set(returns[index].date, currentGrowth / previousGrowth - 1);
  }
  return result;
}

function accountCurrency(accountId: string): string {
  const currency = accountId?.split(':').at(-1)?.toLowerCase();
  return currency && currency.length === 3 ? currency : 'cad';
}

function convertRawAmount(rawTransaction: any, amount: number, currencies: Currencies): number {
  return currencies.getValue(accountCurrency(rawTransaction.investment), amount, rawTransaction.date.slice(0, 10));
}

function calculateCashDrag({
  institutions,
  transactions,
  benchmarkReturns,
  currencies,
}: {
  institutions: any[];
  transactions: any[];
  benchmarkReturns: { date: string; value: number }[];
  currencies: Currencies;
}) {
  const currentCashByAccount = new Map<string, { amount: number; currency: string }>();
  for (const institution of institutions) {
    for (const investment of institution.investments ?? []) {
      if (investment.ignored) continue;
      currentCashByAccount.set(investment._id, {
        amount: Number(investment.cash || 0),
        currency: investment.currency?.toLowerCase() ?? accountCurrency(investment._id),
      });
    }
  }

  const cashChanges = transactions
    .filter(
      (transaction) =>
        !transaction.deleted && transaction.investment && Number.isFinite(Number(transaction.currency_amount)),
    )
    .map((transaction) => ({
      account: transaction.investment,
      date: transaction.date.slice(0, 10),
      amount: Number(transaction.currency_amount),
    }));
  const openingCashByAccount = new Map(
    [...currentCashByAccount.entries()].map(([account, current]) => [
      account,
      {
        ...current,
        amount:
          current.amount -
          cashChanges
            .filter((change) => change.account === account && change.date > FROM_DATE)
            .reduce((total, change) => total + change.amount, 0),
      },
    ]),
  );

  let cashDrag = 0;
  let averageCash = 0;
  let observations = 0;
  for (let index = 1; index < benchmarkReturns.length; index++) {
    const previous = benchmarkReturns[index - 1];
    const current = benchmarkReturns[index];
    for (const change of cashChanges.filter((entry) => entry.date > previous.date && entry.date < current.date)) {
      const cash = openingCashByAccount.get(change.account);
      if (cash) cash.amount += change.amount;
    }
    const beginningCash = [...openingCashByAccount.values()].reduce(
      (total, cash) => total + currencies.getValue(cash.currency, cash.amount, previous.date),
      0,
    );
    const previousGrowth = 1 + previous.value / 100;
    const currentGrowth = 1 + current.value / 100;
    if (previousGrowth !== 0) {
      const benchmarkReturn = currentGrowth / previousGrowth - 1;
      cashDrag -= beginningCash * benchmarkReturn;
      averageCash += beginningCash;
      observations++;
    }
    for (const change of cashChanges.filter((entry) => entry.date === current.date)) {
      const cash = openingCashByAccount.get(change.account);
      if (cash) cash.amount += change.amount;
    }
  }

  const currentBaseCash = [...currentCashByAccount.values()].reduce(
    (total, cash) => total + currencies.getValue(cash.currency, cash.amount),
    0,
  );
  return {
    amount: cashDrag,
    averageCash: observations === 0 ? 0 : averageCash / observations,
    currentBaseCash,
  };
}

function summarizeIncomeAndFees(transactions: any[], currencies: Currencies, toDate: string) {
  const periodTransactions = transactions.filter(
    (transaction) =>
      !transaction.deleted && transaction.date.slice(0, 10) >= FROM_DATE && transaction.date.slice(0, 10) <= toDate,
  );
  const sumRawAmounts = (types: string[]) =>
    periodTransactions
      .filter((transaction) => types.includes(transaction.type))
      .reduce(
        (total, transaction) =>
          total + convertRawAmount(transaction, Number(transaction.currency_amount || 0), currencies),
        0,
      );
  const embeddedFeeMetadata = periodTransactions
    .filter((transaction) => Number(transaction.fee || 0) !== 0)
    .reduce(
      (total, transaction) => total + Math.abs(convertRawAmount(transaction, Number(transaction.fee), currencies)),
      0,
    );
  const standaloneFees = Math.abs(sumRawAmounts(['fee']));
  return {
    dividends: sumRawAmounts(['dividend']),
    distributions: sumRawAmounts(['distribution']),
    otherIncome: sumRawAmounts(['income', 'interest']),
    withholdingAndOtherTax: sumRawAmounts(['tax']),
    standaloneFees,
    embeddedFeeMetadata,
    totalExplicitFees: standaloneFees + embeddedFeeMetadata,
  };
}

async function main() {
  const [currencies, benchmarkReturns, sectorBenchmarkReturns] = await Promise.all([
    loadCurrencies(),
    loadBenchmarkReturns(),
    loadNormalizedReturns(SECTOR_PROXY_SYMBOLS),
  ]);
  const institutionsResponse = readJson('institutions-prod.json');
  const positionsResponse = readJson('positions-prod.json');
  const transactionsResponse = readJson('transactions-prod.json');
  const portfolioResponse = readJson('portfolio-prod.json');

  const accounts = parseInstitutionsResponse(institutionsResponse);
  const securityTransactions = parseSecurityTransactionsResponse(transactionsResponse, currencies);
  const cashFlowsByDate = computeCashFlowByDate(transactionsResponse, currencies);
  const allPortfolios = buildPortfolioSeries(parsePortfolioResponse(portfolioResponse), cashFlowsByDate);
  const portfolios = allPortfolios.filter(
    (portfolio) => portfolio.date >= FROM_DATE && portfolio.date <= REQUESTED_TO_DATE,
  );
  const portfolioReturns = normalizePortfolioToPercentageReturns(portfolios);
  const spyReturns = benchmarkReturns.SPY;
  const commonEndDate = [
    portfolios[portfolios.length - 1]?.date,
    ...Object.values(benchmarkReturns).map((returns) => returns[returns.length - 1]?.date),
  ]
    .filter(Boolean)
    .sort()[0];
  const comparisonPortfolios = portfolios.filter((portfolio) => portfolio.date <= commonEndDate);
  const comparisonPortfolioReturns = normalizePortfolioToPercentageReturns(comparisonPortfolios);
  const alignedSpyReturns = spyReturns.filter((point) => point.date <= commonEndDate);

  const transactionTypeCounts = transactionsResponse.reduce<Record<string, number>>((counts, transaction: any) => {
    const type = transaction.type ?? 'missing';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const activeTransactions = transactionsResponse.filter((transaction: any) => !transaction.deleted);
  const activeTransactionTypeCounts = activeTransactions.reduce<Record<string, number>>((counts, transaction: any) => {
    const type = transaction.type ?? 'missing';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const periodFlows = Object.values(cashFlowsByDate).filter(
    (flow) => flow.date >= FROM_DATE && flow.date <= commonEndDate,
  );
  const totalExternalFlow = periodFlows.reduce((total, flow) => total + flow.externalFlow, 0);

  const currentAndPeriodTickers = [
    ...positionsResponse.map((position: any) => getYahooSymbol(position.security)),
    ...securityTransactions
      .filter(
        (transaction) =>
          transaction.date.format('YYYY-MM-DD') >= FROM_DATE && transaction.date.format('YYYY-MM-DD') <= commonEndDate,
      )
      .map((transaction) => transaction.ticker),
  ];
  const candidateTickers = [...new Set(currentAndPeriodTickers)].filter(Boolean).sort();
  const quoteTypes = await loadQuoteTypes(candidateTickers);
  const individualStockTickers = candidateTickers.filter((symbol) => quoteTypes.get(symbol) === 'EQUITY');
  const marketableTickers = candidateTickers.filter((symbol) =>
    ['EQUITY', 'ETF', 'MUTUALFUND'].includes(quoteTypes.get(symbol) ?? ''),
  );
  const [sectors, marketablePriceHistories] = await Promise.all([
    loadSectors(individualStockTickers),
    loadPriceHistories(marketableTickers),
  ]);
  const activeContributionObservations = buildActiveContributionObservations({
    symbols: marketableTickers,
    priceHistories: marketablePriceHistories,
    transactions: securityTransactions,
    positions: positionsResponse,
    portfolios: comparisonPortfolios,
    benchmarkReturns: alignedSpyReturns,
    currencies,
    sectors,
  });
  const openingHoldingsObservations = buildActiveContributionObservations({
    symbols: marketableTickers,
    priceHistories: marketablePriceHistories,
    transactions: securityTransactions,
    positions: positionsResponse,
    portfolios: comparisonPortfolios,
    benchmarkReturns: alignedSpyReturns,
    currencies,
    sectors,
    updateQuantities: false,
  });
  const expectedMarketDates = alignedSpyReturns.slice(1).map((point) => point.date);
  const allDynamicContributions = calculateActiveContributions(activeContributionObservations, expectedMarketDates);
  const allOpeningContributions = calculateActiveContributions(openingHoldingsObservations, expectedMarketDates);
  const activeContributions = allDynamicContributions
    .filter((contribution) => quoteTypes.get(contribution.symbol) === 'EQUITY')
    .map((contribution) => ({
      symbol: contribution.symbol,
      sector: contribution.sector,
      averageWeightPercent: round(contribution.averageWeight * 100),
      portfolioContributionAmount: round(contribution.portfolioContributionAmount, 2),
      benchmarkContributionAmount: round(contribution.benchmarkContributionAmount, 2),
      activeContributionAmount: round(contribution.activeContributionAmount, 2),
      currencyEffectAmount: round(contribution.currencyEffectAmount, 2),
      marketDataCoveragePercent: round(contribution.coverage * 100, 2),
    }));

  const sectorDailyReturns = Object.fromEntries(
    Object.entries(sectorBenchmarkReturns).map(([symbol, returns]) => [
      symbol,
      dailyReturnsByDate(returns.filter((point) => point.date <= commonEndDate)),
    ]),
  ) as Record<string, Map<string, number>>;
  let stockSelection = 0;
  let sectorAllocation = 0;
  let currencyEffects = 0;
  let sectorProxyFallbackObservations = 0;
  for (const observation of openingHoldingsObservations) {
    const quoteType = quoteTypes.get(observation.symbol);
    const localReturn = observation.localSecurityReturn ?? observation.securityReturn;
    currencyEffects += observation.beginningValue * (observation.securityReturn - localReturn);
    if (quoteType === 'EQUITY') {
      const proxySymbol = SECTOR_PROXY_BY_NAME[observation.sector ?? ''];
      const sectorReturn = proxySymbol ? sectorDailyReturns[proxySymbol]?.get(observation.date) : undefined;
      if (sectorReturn === undefined) sectorProxyFallbackObservations++;
      const effectiveSectorReturn = sectorReturn ?? observation.benchmarkReturn;
      stockSelection += observation.beginningValue * (localReturn - effectiveSectorReturn);
      sectorAllocation += observation.beginningValue * (effectiveSectorReturn - observation.benchmarkReturn);
    } else {
      // Fund holdings are an allocation choice. Without historical look-through
      // weights, attribute their non-currency active return to sector/allocation.
      sectorAllocation += observation.beginningValue * (localReturn - observation.benchmarkReturn);
    }
  }
  const dynamicActiveContribution = allDynamicContributions.reduce(
    (total, contribution) => total + contribution.activeContributionAmount,
    0,
  );
  const openingActiveContribution = allOpeningContributions.reduce(
    (total, contribution) => total + contribution.activeContributionAmount,
    0,
  );
  const tradingTiming = dynamicActiveContribution - openingActiveContribution;
  const cashDrag = calculateCashDrag({
    institutions: institutionsResponse,
    transactions: transactionsResponse,
    benchmarkReturns: alignedSpyReturns,
    currencies,
  });
  const incomeAndFees = summarizeIncomeAndFees(transactionsResponse, currencies, commonEndDate);
  const currentHoldings = positionsResponse
    .map((position: any) => {
      const symbol = getYahooSymbol(position.security);
      return {
        symbol,
        name: position.security.name,
        securityType: quoteTypes.get(symbol) ?? position.security.type ?? 'Unknown',
        nativeCurrency: position.security.currency?.toUpperCase(),
        sector: sectors.get(symbol) ?? position.security.sector ?? 'Unknown',
        quantity: round(Number(position.quantity || 0), 6),
        marketValueUsd: round(Number(position.market_value || 0), 2),
        bookValueUsd: round(Number(position.book_value || 0), 2),
        unrealizedGainUsd: round(Number(position.gain_amount || 0), 2),
        accountCount: position.investments?.length ?? 0,
      };
    })
    .sort((left: any, right: any) => (right.marketValueUsd ?? 0) - (left.marketValueUsd ?? 0));

  const scenarios = SCENARIOS.map((definition) => {
    const result = simulateCashFlowMatchedScenario(
      comparisonPortfolios,
      Object.entries(definition.allocations).map(([symbol, allocation]) => ({
        symbol,
        allocation,
        returns: benchmarkReturns[symbol].filter((point) => point.date <= commonEndDate),
      })),
    );
    return {
      name: definition.name,
      allocations: definition.allocations,
      effectiveEndDate: result?.effectiveEndDate ?? null,
      returnPercent: round(result?.returnPercent ?? null),
      endingValue: round(result?.endingValue ?? null, 2),
      actualEndingValue: round(result?.actualEndingValue ?? null, 2),
      actualMinusScenario: round(result?.actualMinusScenario ?? null, 2),
    };
  });
  const spyScenario = scenarios.find((scenario) => scenario.name === 'S&P 500 baseline');
  const totalPerformanceGap = spyScenario?.actualMinusScenario ?? null;
  const feeEffect = -incomeAndFees.totalExplicitFees;
  const explainedGap =
    stockSelection + sectorAllocation + currencyEffects + tradingTiming + cashDrag.amount + feeEffect;
  const attributionResidual = totalPerformanceGap === null ? null : totalPerformanceGap - explainedGap;

  const accountInventory = accounts
    .map((account) => ({
      id: account.id,
      owner: account.instutitionName,
      name: account.name,
      type: account.type,
      currency: account.currency,
      baseValueUsd: round(account.value, 2),
      nativeValue: round(account.currency_value, 2),
      cashNative: round(account.cash, 2),
      positionCount: account.positions.length,
    }))
    .sort((left, right) => (right.baseValueUsd ?? 0) - (left.baseValueUsd ?? 0));
  const currentAccounts = accountInventory.filter((account) => (account.baseValueUsd ?? 0) !== 0);
  const independentlyCalculatedReturn = independentlyCalculateTwr(comparisonPortfolios);
  const pipelineReturn = comparisonPortfolioReturns.at(-1)?.value ?? null;
  const accountValueSum = accounts.reduce((total, account) => total + Number(account.value || 0), 0);
  const currentPositionValue = positionsResponse.reduce(
    (total: number, position: any) => total + Number(position.market_value || 0),
    0,
  );
  const validationChecks = {
    independentTwrMatchesPipeline:
      independentlyCalculatedReturn !== null && pipelineReturn !== null
        ? Math.abs(independentlyCalculatedReturn - pipelineReturn) < 1e-10
        : false,
    accountsReconcileToPortfolio: Math.abs(accountValueSum - Number(portfolioResponse.value)) < 0.01,
    positionsAndCashReconcileToPortfolio:
      Math.abs(currentPositionValue + cashDrag.currentBaseCash - Number(portfolioResponse.value)) < 0.1,
    attributionBridgeReconciles:
      totalPerformanceGap !== null && attributionResidual !== null
        ? Math.abs(explainedGap + attributionResidual - totalPerformanceGap) < 0.01
        : false,
    scenariosUseCommonEndDate: scenarios.every((scenario) => scenario.effectiveEndDate === commonEndDate),
  };
  if (Object.values(validationChecks).some((passed) => !passed)) {
    throw new Error(`Portfolio audit validation failed: ${JSON.stringify(validationChecks)}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    requestedPeriod: { fromDate: FROM_DATE, toDate: REQUESTED_TO_DATE },
    effectivePeriod: { fromDate: FROM_DATE, toDate: commonEndDate },
    assumptions: {
      baseCurrency: 'USD',
      valuationFrequency: 'daily calendar-day values from Wealthica',
      externalFlowTiming: 'end of day on the recorded transaction date',
      benchmarkReturnBasis: 'adjusted close when supplied by the market source',
      blendedScenarios: '80% VTI core / 20% growth sleeve; fixed sleeves with no daily rebalancing',
    },
    validationChecks,
    inventory: {
      institutions: institutionsResponse.length,
      accounts: accounts.length,
      currentNonzeroAccounts: currentAccounts.length,
      zeroValueOrStaleAccounts: accounts.length - currentAccounts.length,
      positions: positionsResponse.length,
      transactions: transactionsResponse.length,
      activeTransactions: activeTransactions.length,
      deletedTransactions: transactionsResponse.length - activeTransactions.length,
      transactionTypeCounts,
      activeTransactionTypeCounts,
      currencies: [...new Set(accounts.map((account) => account.currency.toUpperCase()))].sort(),
      dailyValuations: Object.keys(parsePortfolioResponse(portfolioResponse)).length,
      firstValuationDate: Object.keys(parsePortfolioResponse(portfolioResponse)).sort()[0],
      lastValuationDate: Object.keys(parsePortfolioResponse(portfolioResponse)).sort().at(-1),
      currentPortfolioValueUsd: round(portfolioResponse.value, 2),
      currentPositionsValueUsd: round(
        positionsResponse.reduce((total: number, position: any) => total + Number(position.market_value || 0), 0),
        2,
      ),
    },
    currentHoldings,
    periodCashFlows: {
      deposits: round(
        periodFlows.reduce((total, flow) => total + flow.deposit, 0),
        2,
      ),
      withdrawals: round(
        periodFlows.reduce((total, flow) => total + flow.withdrawal, 0),
        2,
      ),
      netExternalFlow: round(totalExternalFlow, 2),
      datesWithExternalFlows: periodFlows.filter((flow) => flow.externalFlow !== 0).length,
    },
    periodIncomeAndCosts: {
      dividends: round(incomeAndFees.dividends, 2),
      distributions: round(incomeAndFees.distributions, 2),
      otherIncomeAndInterest: round(incomeAndFees.otherIncome, 2),
      withholdingAndOtherTax: round(incomeAndFees.withholdingAndOtherTax, 2),
      standaloneFees: round(incomeAndFees.standaloneFees, 2),
      embeddedFeeMetadata: round(incomeAndFees.embeddedFeeMetadata, 2),
      totalExplicitFees: round(incomeAndFees.totalExplicitFees, 2),
    },
    validatedPerformance: {
      openingValue: round(comparisonPortfolios[0]?.value ?? null, 2),
      endingValue: round(comparisonPortfolios.at(-1)?.value ?? null, 2),
      portfolioReturnPercent: round(comparisonPortfolioReturns.at(-1)?.value ?? null),
      independentlyCalculatedReturnPercent: round(independentlyCalculatedReturn),
      independentVsPipelineDifferencePercentagePoints:
        independentlyCalculatedReturn === null || pipelineReturn === null
          ? null
          : round(independentlyCalculatedReturn - pipelineReturn, 12),
      sp500ReturnPercent: round(alignedSpyReturns.at(-1)?.value ?? null),
      alphaPercentagePoints: round(calculateAlpha(comparisonPortfolioReturns, alignedSpyReturns)),
      correlation: round(calculateCorrelation(comparisonPortfolioReturns, alignedSpyReturns)),
      beta: round(calculateBeta(comparisonPortfolioReturns, alignedSpyReturns)),
      consistencyScorePercent: round(calculateConsistencyScore(comparisonPortfolioReturns, alignedSpyReturns)),
      averageRecoveryDays: calculateAverageRecoveryTime(comparisonPortfolioReturns),
      riskLevel: calculateRiskLevel(comparisonPortfolioReturns, alignedSpyReturns),
    },
    scenarios,
    performanceGapAttribution: {
      totalCashFlowMatchedGap: round(totalPerformanceGap, 2),
      stockSelection: round(stockSelection, 2),
      sectorAllocation: round(sectorAllocation, 2),
      cashDrag: round(cashDrag.amount, 2),
      currencyEffects: round(currencyEffects, 2),
      tradingTiming: round(tradingTiming, 2),
      fees: round(feeEffect, 2),
      missingDividendsOrCorporateActions: null,
      residual: round(attributionResidual, 2),
      diagnostics: {
        method:
          'Opening holdings form the no-trade baseline. Stock local returns split against current-sector ETF proxies; fund active return is allocation; dynamic-minus-opening exposure is timing.',
        currentSectorClassifications: true,
        historicalFundLookThroughWeightsAvailable: false,
        sectorProxyFallbackObservations,
        arithmeticContributionVsGeometricEndingValueResidual: true,
        averageReconstructedCashUsd: round(cashDrag.averageCash, 2),
        currentReconstructedCashUsd: round(cashDrag.currentBaseCash, 2),
        missingDividendOrActionImpactQuantifiable: false,
      },
    },
    individualStockActiveContribution: {
      method:
        'Daily beginning base-currency exposure multiplied by the stock total return minus SPY total return over the same interval.',
      rankedMostNegativeFirst: activeContributions,
      requestedSymbols: individualStockTickers.length,
      symbolsWithUsableHistory: activeContributions.length,
      missingHistorySymbols: individualStockTickers.filter(
        (symbol) => (marketablePriceHistories.get(symbol)?.length ?? 0) < 2,
      ),
    },
    accounts: accountInventory,
    diagnostic: {
      requestedPortfolioReturnPercent: round(portfolioReturns.at(-1)?.value ?? null),
      note: 'Performance and scenarios are limited to the latest common completed market date; account tax treatment is intentionally not inferred here.',
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
