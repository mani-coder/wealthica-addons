export type ActiveContributionObservation = {
  date: string;
  symbol: string;
  beginningValue: number;
  portfolioBeginningValue: number;
  securityReturn: number;
  localSecurityReturn?: number;
  benchmarkReturn: number;
  sector?: string;
};

export type ActiveContribution = {
  symbol: string;
  sector: string | null;
  averageWeight: number;
  portfolioContributionAmount: number;
  benchmarkContributionAmount: number;
  activeContributionAmount: number;
  currencyEffectAmount: number;
  coveredObservations: number;
  coverage: number;
};

export type MarketValuePoint = { date: string; value: number };
export type DocumentedSplit = { date: string; ratio: number };

export type HoldingTrade = {
  date: string;
  symbol: string;
  account?: string;
  type: 'buy' | 'sell' | 'reinvest' | 'split';
  shares: number;
  splitRatio?: number;
};

export type HoldingPerformanceSecurity = {
  symbol: string;
  name: string;
  currentQuantity: number;
  prices: MarketValuePoint[];
  localPrices?: MarketValuePoint[];
  sector?: string;
  securityType?: 'equity' | 'etf' | 'mutual_fund';
};

export type RelativePerformancePoint = {
  date: string;
  value: number | null;
};

export type HoldingRelativePerformance = ActiveContribution & {
  name: string;
  isCurrent: boolean;
  stockReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  firstHeldDate: string;
  lastHeldDate: string;
  holdingEpisodes: number;
  periodHeld: number;
  priceCoverage: number;
  relativePerformance: RelativePerformancePoint[];
};

export type PerformanceGapAttribution = {
  totalGap: number;
  stockSelection: number;
  sectorAllocation: number;
  cashDrag: number;
  currencyEffects: number;
  tradingTiming: number;
  fees: number;
  residual: number;
  reconciled: boolean;
  sectorProxyFallbackObservations: number;
  detectedDividendTransactions: number;
  detectedCorporateActionTransactions: number;
};

export type CashAccountSnapshot = {
  id: string;
  cash: number;
  currency: string;
};

export type RawPortfolioTransaction = {
  date?: string;
  deleted?: boolean;
  investment?: string;
  currency_amount?: number | string;
  fee?: number | string;
  type?: string;
};

type ConvertCurrency = (currency: string, value: number, date?: string) => number;

type PortfolioGapAttributionInput = HoldingRelativePerformanceInput & {
  totalGap: number;
  sectorReturns: Record<string, MarketValuePoint[]>;
  cashDrag: number;
  fees: number;
  detectedDividendTransactions?: number;
  detectedCorporateActionTransactions?: number;
};

function rawTransactionDate(transaction: RawPortfolioTransaction): string {
  return transaction.date?.slice(0, 10) ?? '';
}

function accountCurrencyFromId(accountId?: string): string | undefined {
  const currency = accountId?.split(':').at(-1)?.toLowerCase();
  return currency && currency.length === 3 ? currency : undefined;
}

/** Reconstruct beginning cash from current account cash and recorded cash movements. */
export function calculateCashDragFromTransactions({
  accounts,
  transactions,
  benchmarkReturns,
  fromDate,
  convertCurrency,
}: {
  accounts: CashAccountSnapshot[];
  transactions: RawPortfolioTransaction[];
  benchmarkReturns: MarketValuePoint[];
  fromDate: string;
  convertCurrency: ConvertCurrency;
}): number {
  const currentCashByAccount = new Map(
    accounts.flatMap((account) => {
      const currency = account.currency?.toLowerCase() || accountCurrencyFromId(account.id);
      return currency
        ? [
            [
              account.id,
              {
                amount: Number(account.cash || 0),
                currency,
              },
            ] as const,
          ]
        : [];
    }),
  );
  const cashChanges = transactions.flatMap((transaction) => {
    const amount = Number(transaction.currency_amount);
    if (transaction.deleted || !transaction.investment || !Number.isFinite(amount)) return [];
    return [{ account: transaction.investment, date: rawTransactionDate(transaction), amount }];
  });
  const reconstructedCash = new Map(
    [...currentCashByAccount.entries()].map(([account, current]) => [
      account,
      {
        ...current,
        amount:
          current.amount -
          cashChanges
            .filter((change) => change.account === account && change.date > fromDate)
            .reduce((total, change) => total + change.amount, 0),
      },
    ]),
  );

  const sortedBenchmark = [...benchmarkReturns].sort((left, right) => left.date.localeCompare(right.date));
  let cashDrag = 0;
  for (let index = 1; index < sortedBenchmark.length; index++) {
    const previous = sortedBenchmark[index - 1];
    const current = sortedBenchmark[index];
    for (const change of cashChanges.filter((entry) => entry.date > previous.date && entry.date < current.date)) {
      const cash = reconstructedCash.get(change.account);
      if (cash) cash.amount += change.amount;
    }
    const beginningCash = [...reconstructedCash.values()].reduce(
      (total, cash) => total + convertCurrency(cash.currency, cash.amount, previous.date),
      0,
    );
    const previousGrowth = 1 + previous.value / 100;
    const currentGrowth = 1 + current.value / 100;
    if (previousGrowth !== 0) cashDrag -= beginningCash * (currentGrowth / previousGrowth - 1);
    for (const change of cashChanges.filter((entry) => entry.date === current.date)) {
      const cash = reconstructedCash.get(change.account);
      if (cash) cash.amount += change.amount;
    }
  }
  return cashDrag;
}

/** Return explicit fees as a negative contribution in the portfolio base currency. */
export function calculateExplicitFeeEffect({
  accounts,
  transactions,
  fromDate,
  toDate,
  convertCurrency,
}: {
  accounts: CashAccountSnapshot[];
  transactions: RawPortfolioTransaction[];
  fromDate: string;
  toDate: string;
  convertCurrency: ConvertCurrency;
}): number {
  const accountCurrencies = new Map(accounts.map((account) => [account.id, account.currency.toLowerCase()]));
  let explicitFees = 0;
  for (const transaction of transactions) {
    const date = rawTransactionDate(transaction);
    if (transaction.deleted || date < fromDate || date > toDate) continue;
    const currency =
      accountCurrencies.get(transaction.investment ?? '') ?? accountCurrencyFromId(transaction.investment);
    if (!currency) continue;
    const embeddedFee = Math.abs(Number(transaction.fee || 0));
    if (transaction.type?.toLowerCase() === 'fee') {
      const standaloneFee = Math.abs(Number(transaction.currency_amount || 0));
      const feeAmount = standaloneFee || embeddedFee;
      if (feeAmount > 0) explicitFees += Math.abs(convertCurrency(currency, feeAmount, date));
    } else if (embeddedFee > 0) {
      explicitFees += Math.abs(convertCurrency(currency, embeddedFee, date));
    }
  }
  return -explicitFees;
}

type HoldingRelativePerformanceInput = {
  securities: HoldingPerformanceSecurity[];
  trades: HoldingTrade[];
  benchmarkReturns: MarketValuePoint[];
  portfolios: MarketValuePoint[];
  fromDate: string;
};

/**
 * Correct a market series when its reported adjusted close still contains a
 * documented split discontinuity. Feeds that already normalized the split are
 * returned unchanged.
 */
export function normalizePricesForDocumentedSplits(
  prices: MarketValuePoint[],
  splits: DocumentedSplit[],
): MarketValuePoint[] {
  const sortedPrices = [...prices].sort((left, right) => left.date.localeCompare(right.date));
  const uniqueSplits = [
    ...new Map(
      splits
        .filter((split) => split.date && Number.isFinite(split.ratio) && split.ratio > 0)
        .map((split) => [`${split.date}:${split.ratio}`, split]),
    ).values(),
  ];
  const unadjustedSplits = uniqueSplits.filter((split) => {
    const prior = [...sortedPrices].reverse().find((price) => price.date < split.date);
    const after = sortedPrices.find((price) => price.date >= split.date);
    if (!prior || !after || prior.value <= 0 || after.value <= 0) return false;
    const reportedMove = after.value / prior.value - 1;
    const splitNormalizedMove = (after.value * split.ratio) / prior.value - 1;
    return Math.abs(reportedMove) > 0.5 && Math.abs(splitNormalizedMove) < Math.abs(reportedMove);
  });

  return sortedPrices.map((price) => ({
    ...price,
    value:
      price.value /
      unadjustedSplits
        .filter((split) => price.date < split.date)
        .reduce((futureRatio, split) => futureRatio * split.ratio, 1),
  }));
}

/**
 * Aggregate daily beginning-of-period exposures into dollar active
 * contribution. Returns are decimals and the benchmark/security observations
 * must cover the identical interval.
 */
export function calculateActiveContributions(
  observations: ActiveContributionObservation[],
  expectedObservationDates?: string[],
): ActiveContribution[] {
  const expectedDates = new Set(expectedObservationDates ?? observations.map((observation) => observation.date));
  const expectedObservationCount = expectedDates.size;
  const bySymbol = new Map<
    string,
    {
      sector: string | null;
      weights: number[];
      portfolioContributionAmount: number;
      benchmarkContributionAmount: number;
      currencyEffectAmount: number;
      dates: Set<string>;
    }
  >();

  for (const observation of observations) {
    if (
      !observation.symbol ||
      !Number.isFinite(observation.beginningValue) ||
      !Number.isFinite(observation.portfolioBeginningValue) ||
      observation.portfolioBeginningValue <= 0 ||
      !Number.isFinite(observation.securityReturn) ||
      !Number.isFinite(observation.benchmarkReturn)
    ) {
      continue;
    }

    const aggregate = bySymbol.get(observation.symbol) ?? {
      sector: observation.sector ?? null,
      weights: [],
      portfolioContributionAmount: 0,
      benchmarkContributionAmount: 0,
      currencyEffectAmount: 0,
      dates: new Set<string>(),
    };
    aggregate.sector = aggregate.sector ?? observation.sector ?? null;
    aggregate.weights.push(observation.beginningValue / observation.portfolioBeginningValue);
    aggregate.portfolioContributionAmount += observation.beginningValue * observation.securityReturn;
    aggregate.benchmarkContributionAmount += observation.beginningValue * observation.benchmarkReturn;
    aggregate.currencyEffectAmount +=
      observation.beginningValue *
      (observation.securityReturn - (observation.localSecurityReturn ?? observation.securityReturn));
    aggregate.dates.add(observation.date);
    bySymbol.set(observation.symbol, aggregate);
  }

  return [...bySymbol.entries()]
    .map(([symbol, aggregate]) => ({
      symbol,
      sector: aggregate.sector,
      averageWeight:
        aggregate.weights.length === 0
          ? 0
          : aggregate.weights.reduce((total, weight) => total + weight, 0) / aggregate.weights.length,
      portfolioContributionAmount: aggregate.portfolioContributionAmount,
      benchmarkContributionAmount: aggregate.benchmarkContributionAmount,
      activeContributionAmount: aggregate.portfolioContributionAmount - aggregate.benchmarkContributionAmount,
      currencyEffectAmount: aggregate.currencyEffectAmount,
      coveredObservations: aggregate.dates.size,
      coverage: expectedObservationCount === 0 ? 0 : aggregate.dates.size / expectedObservationCount,
    }))
    .sort((left, right) => left.activeContributionAmount - right.activeContributionAmount);
}

function latestPriceOnOrBefore(prices: MarketValuePoint[], date: string): MarketValuePoint | undefined {
  const price = [...prices].reverse().find((candidate) => candidate.date <= date);
  if (!price) return undefined;
  const ageInDays = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${price.date}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(ageInDays) && ageInDays <= 7 ? price : undefined;
}

function sharesInCurrentUnits(trade: HoldingTrade, trades: HoldingTrade[]): number {
  if (!['buy', 'sell', 'reinvest'].includes(trade.type)) return 0;
  const futureSplitAdjustment = trades
    .filter(
      (candidate) =>
        candidate.type === 'split' &&
        candidate.symbol === trade.symbol &&
        candidate.account === trade.account &&
        candidate.date > trade.date &&
        candidate.splitRatio,
    )
    .reduce((ratio, split) => ratio * (split.splitRatio as number), 1);
  return trade.shares * futureSplitAdjustment;
}

function dailyReturnsByDate(returns: MarketValuePoint[]): Map<string, number> {
  const result = new Map<string, number>();
  const sorted = [...returns].sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 1; index < sorted.length; index++) {
    const previousGrowth = 1 + sorted[index - 1].value / 100;
    const currentGrowth = 1 + sorted[index].value / 100;
    if (previousGrowth !== 0) result.set(sorted[index].date, currentGrowth / previousGrowth - 1);
  }
  return result;
}

function buildAttributionObservations(
  input: HoldingRelativePerformanceInput,
  updateQuantities: boolean,
): ActiveContributionObservation[] {
  const sortedBenchmark = [...input.benchmarkReturns].sort((left, right) => left.date.localeCompare(right.date));
  const portfolioByDate = new Map(input.portfolios.map((portfolio) => [portfolio.date, portfolio.value]));
  const observations: ActiveContributionObservation[] = [];

  for (const security of input.securities) {
    const prices = [...security.prices].sort((left, right) => left.date.localeCompare(right.date));
    const localPrices = [...(security.localPrices ?? security.prices)].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    if (prices.length < 2 || localPrices.length < 2) continue;

    const symbolTrades = input.trades.filter((trade) => trade.symbol === security.symbol);
    const quantityEvents = symbolTrades
      .filter((trade) => ['buy', 'sell', 'reinvest'].includes(trade.type))
      .map((trade) => ({ ...trade, shares: sharesInCurrentUnits(trade, input.trades) }));
    let quantity =
      security.currentQuantity -
      quantityEvents.filter((event) => event.date > input.fromDate).reduce((total, event) => total + event.shares, 0);

    for (let index = 1; index < sortedBenchmark.length; index++) {
      const previousBenchmark = sortedBenchmark[index - 1];
      const benchmark = sortedBenchmark[index];
      if (updateQuantities) {
        for (const event of quantityEvents.filter(
          (candidate) => candidate.date > previousBenchmark.date && candidate.date < benchmark.date,
        )) {
          quantity += event.shares;
        }
      }

      const previousPrice = latestPriceOnOrBefore(prices, previousBenchmark.date);
      const currentPrice = latestPriceOnOrBefore(prices, benchmark.date);
      const previousLocalPrice = latestPriceOnOrBefore(localPrices, previousBenchmark.date);
      const currentLocalPrice = latestPriceOnOrBefore(localPrices, benchmark.date);
      const portfolioBeginningValue = portfolioByDate.get(previousBenchmark.date);
      const previousBenchmarkGrowth = 1 + previousBenchmark.value / 100;
      const currentBenchmarkGrowth = 1 + benchmark.value / 100;
      if (
        quantity > 1e-8 &&
        previousPrice &&
        currentPrice &&
        previousLocalPrice &&
        currentLocalPrice &&
        previousPrice.value > 0 &&
        previousLocalPrice.value > 0 &&
        portfolioBeginningValue !== undefined &&
        portfolioBeginningValue > 0 &&
        previousBenchmarkGrowth !== 0
      ) {
        observations.push({
          date: benchmark.date,
          symbol: security.symbol,
          beginningValue: quantity * previousPrice.value,
          portfolioBeginningValue,
          securityReturn: currentPrice.value / previousPrice.value - 1,
          localSecurityReturn: currentLocalPrice.value / previousLocalPrice.value - 1,
          benchmarkReturn: currentBenchmarkGrowth / previousBenchmarkGrowth - 1,
          sector: security.sector,
        });
      }

      if (updateQuantities) {
        for (const event of quantityEvents.filter((candidate) => candidate.date === benchmark.date)) {
          quantity += event.shares;
        }
      }
    }
  }
  return observations;
}

/**
 * Build an arithmetic bridge from the cash-flow-matched ending-value gap to
 * observable portfolio drivers. The residual is explicit so the displayed
 * components always reconcile without pretending that unavailable corporate-
 * action or historical look-through data is known.
 */
export function calculatePerformanceGapAttribution(input: PortfolioGapAttributionInput): PerformanceGapAttribution {
  const dynamicObservations = buildAttributionObservations(input, true);
  const openingObservations = buildAttributionObservations(input, false);
  const expectedDates = [...input.benchmarkReturns]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(1)
    .map((point) => point.date);
  const dynamicActive = calculateActiveContributions(dynamicObservations, expectedDates).reduce(
    (total, contribution) => total + contribution.activeContributionAmount,
    0,
  );
  const openingActive = calculateActiveContributions(openingObservations, expectedDates).reduce(
    (total, contribution) => total + contribution.activeContributionAmount,
    0,
  );
  const securityBySymbol = new Map(input.securities.map((security) => [security.symbol, security]));
  const sectorDailyReturns = Object.fromEntries(
    Object.entries(input.sectorReturns).map(([sector, returns]) => [sector, dailyReturnsByDate(returns)]),
  ) as Record<string, Map<string, number>>;

  let stockSelection = 0;
  let sectorAllocation = 0;
  let currencyEffects = 0;
  let sectorProxyFallbackObservations = 0;
  for (const observation of openingObservations) {
    const security = securityBySymbol.get(observation.symbol);
    const localReturn = observation.localSecurityReturn ?? observation.securityReturn;
    currencyEffects += observation.beginningValue * (observation.securityReturn - localReturn);
    if (security?.securityType === 'equity') {
      const sectorReturn = security.sector ? sectorDailyReturns[security.sector]?.get(observation.date) : undefined;
      if (sectorReturn === undefined) sectorProxyFallbackObservations++;
      const effectiveSectorReturn = sectorReturn ?? observation.benchmarkReturn;
      stockSelection += observation.beginningValue * (localReturn - effectiveSectorReturn);
      sectorAllocation += observation.beginningValue * (effectiveSectorReturn - observation.benchmarkReturn);
    } else {
      // Without historical fund look-through weights, a fund's local active
      // return is an allocation effect rather than individual-stock selection.
      sectorAllocation += observation.beginningValue * (localReturn - observation.benchmarkReturn);
    }
  }

  const tradingTiming = dynamicActive - openingActive;
  const explained = stockSelection + sectorAllocation + input.cashDrag + currencyEffects + tradingTiming + input.fees;
  const residual = input.totalGap - explained;
  const reconciled =
    Math.abs(
      stockSelection +
        sectorAllocation +
        input.cashDrag +
        currencyEffects +
        tradingTiming +
        input.fees +
        residual -
        input.totalGap,
    ) < 0.01;

  return {
    totalGap: input.totalGap,
    stockSelection,
    sectorAllocation,
    cashDrag: input.cashDrag,
    currencyEffects,
    tradingTiming,
    fees: input.fees,
    residual,
    reconciled,
    sectorProxyFallbackObservations,
    detectedDividendTransactions: input.detectedDividendTransactions ?? 0,
    detectedCorporateActionTransactions: input.detectedCorporateActionTransactions ?? 0,
  };
}

/**
 * Compare every individual holding with the benchmark over the exact market
 * intervals during which it was owned. Chart data resets to zero for each
 * holding episode, while the ranking uses beginning-of-interval dollar exposure.
 */
export function calculateHoldingRelativePerformances({
  securities,
  trades,
  benchmarkReturns,
  portfolios,
  fromDate,
}: HoldingRelativePerformanceInput): HoldingRelativePerformance[] {
  const sortedBenchmark = [...benchmarkReturns].sort((left, right) => left.date.localeCompare(right.date));
  if (sortedBenchmark.length < 2) return [];

  const portfolioByDate = new Map(portfolios.map((portfolio) => [portfolio.date, portfolio.value]));
  const observations: ActiveContributionObservation[] = [];
  const detailsBySymbol = new Map<
    string,
    Omit<
      HoldingRelativePerformance,
      | keyof ActiveContribution
      | 'averageWeight'
      | 'portfolioContributionAmount'
      | 'benchmarkContributionAmount'
      | 'activeContributionAmount'
      | 'currencyEffectAmount'
      | 'coveredObservations'
      | 'coverage'
    > & { coveredIntervals: number; expectedHeldIntervals: number }
  >();

  for (const security of securities) {
    const prices = [...security.prices].sort((left, right) => left.date.localeCompare(right.date));
    if (prices.length < 2) continue;

    const symbolTrades = trades.filter((trade) => trade.symbol === security.symbol);
    const quantityEvents = symbolTrades
      .filter((trade) => ['buy', 'sell', 'reinvest'].includes(trade.type))
      .map((trade) => ({ ...trade, shares: sharesInCurrentUnits(trade, trades) }));
    let quantity =
      security.currentQuantity -
      quantityEvents.filter((event) => event.date > fromDate).reduce((total, event) => total + event.shares, 0);
    let stockGrowth = 1;
    let benchmarkGrowth = 1;
    let episodeStockGrowth = 1;
    let episodeBenchmarkGrowth = 1;
    let holdingEpisodes = 0;
    let episodeActive = false;
    let firstHeldDate = '';
    let lastHeldDate = '';
    let coveredIntervals = 0;
    let expectedHeldIntervals = 0;
    const relativePerformance: RelativePerformancePoint[] = [];

    for (let index = 1; index < sortedBenchmark.length; index++) {
      const previousBenchmark = sortedBenchmark[index - 1];
      const benchmark = sortedBenchmark[index];

      // A transaction between market observations is effective for the next
      // observed interval. Same-day activity is applied after that day's close.
      for (const event of quantityEvents.filter(
        (candidate) => candidate.date > previousBenchmark.date && candidate.date < benchmark.date,
      )) {
        quantity += event.shares;
      }

      const heldAtBeginning = quantity > 1e-8;
      if (heldAtBeginning) expectedHeldIntervals++;
      const previousPrice = latestPriceOnOrBefore(prices, previousBenchmark.date);
      const currentPrice = latestPriceOnOrBefore(prices, benchmark.date);
      const portfolioBeginningValue = portfolioByDate.get(previousBenchmark.date);

      if (
        heldAtBeginning &&
        previousPrice &&
        currentPrice &&
        previousPrice.value > 0 &&
        portfolioBeginningValue !== undefined &&
        portfolioBeginningValue > 0
      ) {
        const previousBenchmarkGrowth = 1 + previousBenchmark.value / 100;
        const currentBenchmarkGrowth = 1 + benchmark.value / 100;
        if (previousBenchmarkGrowth !== 0) {
          const securityReturn = currentPrice.value / previousPrice.value - 1;
          const benchmarkReturn = currentBenchmarkGrowth / previousBenchmarkGrowth - 1;
          if (!episodeActive) {
            if (relativePerformance.length > 0 && relativePerformance.at(-1)?.value !== null) {
              relativePerformance.push({ date: previousBenchmark.date, value: null });
            }
            relativePerformance.push({ date: previousBenchmark.date, value: 0 });
            episodeStockGrowth = 1;
            episodeBenchmarkGrowth = 1;
            holdingEpisodes++;
            episodeActive = true;
          }

          stockGrowth *= 1 + securityReturn;
          benchmarkGrowth *= 1 + benchmarkReturn;
          episodeStockGrowth *= 1 + securityReturn;
          episodeBenchmarkGrowth *= 1 + benchmarkReturn;
          coveredIntervals++;
          firstHeldDate ||= previousBenchmark.date;
          lastHeldDate = benchmark.date;
          relativePerformance.push({
            date: benchmark.date,
            value: (episodeStockGrowth - episodeBenchmarkGrowth) * 100,
          });
          observations.push({
            date: benchmark.date,
            symbol: security.symbol,
            beginningValue: quantity * previousPrice.value,
            portfolioBeginningValue,
            securityReturn,
            benchmarkReturn,
          });
        }
      } else if (episodeActive) {
        relativePerformance.push({ date: benchmark.date, value: null });
        episodeActive = false;
      }

      for (const event of quantityEvents.filter((candidate) => candidate.date === benchmark.date)) {
        quantity += event.shares;
      }
    }

    if (coveredIntervals > 0) {
      detailsBySymbol.set(security.symbol, {
        name: security.name,
        isCurrent: security.currentQuantity > 1e-8,
        stockReturn: (stockGrowth - 1) * 100,
        benchmarkReturn: (benchmarkGrowth - 1) * 100,
        excessReturn: (stockGrowth - benchmarkGrowth) * 100,
        firstHeldDate,
        lastHeldDate,
        holdingEpisodes,
        periodHeld: coveredIntervals / (sortedBenchmark.length - 1),
        priceCoverage: expectedHeldIntervals === 0 ? 0 : coveredIntervals / expectedHeldIntervals,
        relativePerformance,
        coveredIntervals,
        expectedHeldIntervals,
      });
    }
  }

  const contributions = calculateActiveContributions(
    observations,
    sortedBenchmark.slice(1).map((point) => point.date),
  );
  return contributions.flatMap((contribution) => {
    const details = detailsBySymbol.get(contribution.symbol);
    if (!details) return [];
    const {
      coveredIntervals: _coveredIntervals,
      expectedHeldIntervals: _expectedHeldIntervals,
      ...publicDetails
    } = details;
    return [{ ...contribution, ...publicDetails }];
  });
}
