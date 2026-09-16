import {
  Card,
  Col,
  Collapse,
  Divider,
  Empty,
  Input,
  Row,
  Segmented,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../../analytics';
import { DATE_FORMAT } from '../../constants';
import { useAddonContext } from '../../context/AddonContext';
import useCurrency from '../../hooks/useCurrency';
import { useSectorData } from '../../hooks/useSectorData';
import { useSecurityHistory } from '../../hooks/useSecurityHistory';
import type { Account, Portfolio, Position, Transaction } from '../../types';
import { normalizeToPercentageReturns } from '../../utils/benchmarkData';
import { formatCurrency, formatMoney, getYahooSymbol } from '../../utils/common';
import {
  calculateCashDragFromTransactions,
  calculateExplicitFeeEffect,
  calculateHoldingRelativePerformances,
  calculatePerformanceGapAttribution,
  type HoldingPerformanceSecurity,
  type HoldingRelativePerformance,
  type HoldingTrade,
  normalizePricesForDocumentedSplits,
  type PerformanceGapAttribution,
} from '../../utils/portfolioAttribution';
import { calculateCashFlowMatchedOpportunityCost } from '../../utils/portfolioPerformance';
import { getSecurityTypesForSymbols } from '../../utils/positionEnricher';
import Charts from '../Charts';

type Props = {
  positions: Position[];
  transactions: Transaction[];
  portfolios: Portfolio[];
  benchmarkReturns: { date: string; value: number }[];
  benchmarkName: string;
  benchmarkSymbol: string;
  fromDate: string;
  toDate: string;
  accounts: Account[];
  rawTransactions: any[];
};

type CandidateSecurity = {
  symbol: string;
  name: string;
  currency: string;
  securityId: string;
  currentQuantity: number;
  knownType?: Position['type'];
};

type ViewMode = 'bottom5' | 'bottom10' | 'top5' | 'top10' | 'all' | 'custom';
type ImpactView = 'drags' | 'contributors';
type HoldingScope = 'all' | 'current' | 'exited';

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

function buildCandidateSecurities(
  positions: Position[],
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): CandidateSecurity[] {
  const candidates = new Map<string, CandidateSecurity>();
  for (const position of positions) {
    const symbol = getYahooSymbol(position.security);
    const existing = candidates.get(symbol);
    candidates.set(symbol, {
      symbol,
      name: position.security.name || symbol,
      currency: position.security.currency || 'usd',
      securityId: position.security.id || (position.security as any)._id || '',
      currentQuantity: (existing?.currentQuantity ?? 0) + Number(position.quantity || 0),
      knownType: position.type,
    });
  }

  for (const transaction of transactions) {
    const transactionDate = transaction.date.format(DATE_FORMAT);
    if (transactionDate < fromDate || transactionDate > toDate || !transaction.ticker) continue;
    if (!['buy', 'sell', 'reinvest', 'split'].includes(transaction.type)) continue;
    const existing = candidates.get(transaction.ticker);
    if (existing) continue;
    candidates.set(transaction.ticker, {
      symbol: transaction.ticker,
      name: transaction.security?.name || transaction.symbol || transaction.ticker,
      currency: transaction.currency || transaction.security?.currency || 'usd',
      securityId: transaction.security?.id || (transaction.security as any)?._id || '',
      currentQuantity: 0,
    });
  }
  return [...candidates.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function toHoldingTrades(transactions: Transaction[]): HoldingTrade[] {
  return transactions.flatMap((transaction) => {
    if (!['buy', 'sell', 'reinvest', 'split'].includes(transaction.type) || !transaction.ticker) return [];
    return [
      {
        date: transaction.date.format(DATE_FORMAT),
        symbol: transaction.ticker,
        account: transaction.account,
        type: transaction.type as HoldingTrade['type'],
        shares: transaction.shares,
        splitRatio: transaction.splitRatio,
      },
    ];
  });
}

export default function HoldingsRelativePerformance({
  positions,
  transactions,
  portfolios,
  benchmarkReturns,
  benchmarkName,
  benchmarkSymbol,
  fromDate,
  toDate,
  accounts,
  rawTransactions,
}: Props) {
  const { isPrivateMode } = useAddonContext();
  const { baseCurrencyDisplay, getValue: convertCurrency } = useCurrency();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 50 });
  const { fetchSectorData } = useSectorData();
  const [performances, setPerformances] = useState<HoldingRelativePerformance[]>([]);
  const [attribution, setAttribution] = useState<PerformanceGapAttribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadIssues, setLoadIssues] = useState<string[]>([]);
  const [marketThroughDate, setMarketThroughDate] = useState(toDate);
  const [requestedStockCount, setRequestedStockCount] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('bottom10');
  const [impactView, setImpactView] = useState<ImpactView>('drags');
  const [holdingScope, setHoldingScope] = useState<HoldingScope>('all');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [focusedSymbol, setFocusedSymbol] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const candidates = useMemo(
    () => buildCandidateSecurities(positions, transactions, fromDate, toDate),
    [fromDate, positions, toDate, transactions],
  );
  const holdingTrades = useMemo(() => toHoldingTrades(transactions), [transactions]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadIssues([]);
      setAttribution(null);
      try {
        const typeMap = await getSecurityTypesForSymbols(candidates.map((candidate) => candidate.symbol));
        const typedCandidates = candidates.map((candidate) => ({
          ...candidate,
          resolvedType: typeMap.get(candidate.symbol) ?? candidate.knownType,
        }));
        const equityCandidates = typedCandidates.filter((candidate) => candidate.resolvedType === 'equity');
        const marketableCandidates = typedCandidates.filter((candidate) =>
          ['equity', 'etf', 'mutual_fund'].includes(candidate.resolvedType ?? ''),
        );
        setRequestedStockCount(equityCandidates.length);
        const historyFromDate = dayjs(fromDate, DATE_FORMAT).subtract(7, 'days');
        const historyToDate = dayjs(toDate, DATE_FORMAT);
        const [sectorMap, securityHistories] = await Promise.all([
          fetchSectorData(equityCandidates.map((candidate) => candidate.symbol)),
          Promise.all(
            marketableCandidates.map(async (candidate) => {
              if (!candidate.securityId) return [candidate, []] as const;
              try {
                const history = await fetchSecurityHistory(
                  { securityId: candidate.securityId, yahooSymbol: candidate.symbol },
                  historyFromDate,
                  historyToDate,
                );
                return [candidate, history] as const;
              } catch (error) {
                console.error(`Unable to load ${candidate.symbol} history:`, error);
                return [candidate, []] as const;
              }
            }),
          ),
        ]);

        const commonEndDate = benchmarkReturns.at(-1)?.date ?? toDate;
        setMarketThroughDate(commonEndDate);
        const securities: HoldingPerformanceSecurity[] = securityHistories.flatMap(([candidate, history]) => {
          if (history.length < 2) return [];
          const splitTransactions = transactions
            .filter(
              (transaction) =>
                transaction.ticker === candidate.symbol && transaction.type === 'split' && transaction.splitRatio,
            )
            .map((transaction) => ({
              date: transaction.date.format(DATE_FORMAT),
              ratio: transaction.splitRatio as number,
            }));
          const localPrices = normalizePricesForDocumentedSplits(
            history.map((point) => ({
              date: point.timestamp.format(DATE_FORMAT),
              value: point.adjustedClosePrice ?? point.closePrice,
            })),
            splitTransactions,
          );
          const prices = localPrices.map((point) => ({
            ...point,
            value: convertCurrency(candidate.currency, point.value, point.date),
          }));
          return [
            {
              ...candidate,
              prices,
              localPrices,
              sector: sectorMap.get(candidate.symbol)?.sector,
              securityType: candidate.resolvedType as HoldingPerformanceSecurity['securityType'],
            },
          ];
        });
        const missingHistory = equityCandidates
          .filter((candidate) => !securities.some((security) => security.symbol === candidate.symbol))
          .map((candidate) => candidate.symbol);
        const unresolvedTypes = candidates
          .filter((candidate) => !typeMap.has(candidate.symbol) && !candidate.knownType)
          .map((candidate) => candidate.symbol);

        const comparisonBenchmark = benchmarkReturns.filter((point) => point.date <= commonEndDate);
        const comparisonPortfolios = portfolios
          .filter((portfolio) => portfolio.date >= fromDate && portfolio.date <= commonEndDate)
          .map((portfolio) => ({ date: portfolio.date, value: portfolio.value }));
        const equitySecurities = securities.filter((security) => security.securityType === 'equity');
        const result = calculateHoldingRelativePerformances({
          securities: equitySecurities,
          trades: holdingTrades,
          benchmarkReturns: comparisonBenchmark,
          portfolios: comparisonPortfolios,
          fromDate,
        });
        const incompleteCoverage = result
          .filter((performance) => performance.priceCoverage < 0.98)
          .map((performance) => `${performance.symbol} (${Math.round(performance.priceCoverage * 100)}%)`);

        const sectorNames = [
          ...new Set(
            equitySecurities
              .map((security) => security.sector)
              .filter((sector): sector is string => Boolean(sector && SECTOR_PROXY_BY_NAME[sector])),
          ),
        ];
        const sectorReturnEntries = await Promise.all(
          sectorNames.map(async (sector) => {
            const proxySymbol = SECTOR_PROXY_BY_NAME[sector];
            try {
              const history = await fetchSecurityHistory(
                { securityId: proxySymbol, yahooSymbol: proxySymbol },
                historyFromDate,
                historyToDate,
              );
              const normalized = normalizeToPercentageReturns(
                history.map((point) => ({
                  date: point.timestamp.format(DATE_FORMAT),
                  value: convertCurrency('usd', point.adjustedClosePrice ?? point.closePrice, point.timestamp),
                })),
                fromDate,
              ).filter((point) => point.date <= commonEndDate);
              return [sector, normalized] as const;
            } catch (error) {
              console.error(`Unable to load ${proxySymbol} sector history:`, error);
              return [sector, []] as const;
            }
          }),
        );
        const totalGap = calculateCashFlowMatchedOpportunityCost(
          portfolios.filter((portfolio) => portfolio.date >= fromDate && portfolio.date <= commonEndDate),
          comparisonBenchmark,
        );
        const periodRawTransactions = rawTransactions.filter((transaction) => {
          const date = transaction.date?.slice(0, 10) ?? '';
          return !transaction.deleted && date >= fromDate && date <= commonEndDate;
        });
        const cashDrag = calculateCashDragFromTransactions({
          accounts,
          transactions: rawTransactions,
          benchmarkReturns: comparisonBenchmark,
          fromDate,
          convertCurrency,
        });
        const fees = calculateExplicitFeeEffect({
          accounts,
          transactions: rawTransactions,
          fromDate,
          toDate: commonEndDate,
          convertCurrency,
        });
        const attributionResult =
          totalGap === null
            ? null
            : calculatePerformanceGapAttribution({
                securities,
                trades: holdingTrades,
                benchmarkReturns: comparisonBenchmark,
                portfolios: comparisonPortfolios,
                fromDate,
                totalGap,
                sectorReturns: Object.fromEntries(sectorReturnEntries),
                cashDrag,
                fees,
                detectedDividendTransactions: periodRawTransactions.filter((transaction) =>
                  ['dividend', 'distribution'].includes(transaction.type?.toLowerCase()),
                ).length,
                detectedCorporateActionTransactions: periodRawTransactions.filter((transaction) =>
                  ['split', 'merger', 'spinoff'].includes(transaction.type?.toLowerCase()),
                ).length,
              });
        if (!cancelled) {
          setPerformances(result);
          setAttribution(attributionResult);
          setLoadIssues([
            ...(missingHistory.length ? [`No usable price history: ${missingHistory.join(', ')}`] : []),
            ...(unresolvedTypes.length ? [`Could not classify: ${unresolvedTypes.join(', ')}`] : []),
            ...(incompleteCoverage.length ? [`Incomplete held-period pricing: ${incompleteCoverage.join(', ')}`] : []),
          ]);
        }
      } catch (error) {
        console.error('Unable to calculate individual stock performance:', error);
        if (!cancelled) {
          setPerformances([]);
          setAttribution(null);
          setLoadIssues(['The individual-stock comparison could not be calculated.']);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    benchmarkReturns,
    accounts,
    candidates,
    convertCurrency,
    fetchSectorData,
    fetchSecurityHistory,
    fromDate,
    holdingTrades,
    portfolios,
    rawTransactions,
    toDate,
    transactions,
  ]);

  const scopedPerformances = useMemo(
    () =>
      performances.filter(
        (performance) =>
          holdingScope === 'all' ||
          (holdingScope === 'current' && performance.isCurrent) ||
          (holdingScope === 'exited' && !performance.isCurrent),
      ),
    [holdingScope, performances],
  );
  const currentCount = performances.filter((performance) => performance.isCurrent).length;
  const exitedCount = performances.length - currentCount;

  const defaultSymbols = useMemo(() => {
    if (viewMode === 'bottom5') return scopedPerformances.slice(0, 5).map((performance) => performance.symbol);
    if (viewMode === 'top5' || viewMode === 'top10') {
      const count = viewMode === 'top5' ? 5 : 10;
      return [...scopedPerformances]
        .filter((performance) => performance.activeContributionAmount > 0)
        .sort((left, right) => right.activeContributionAmount - left.activeContributionAmount)
        .slice(0, count)
        .map((performance) => performance.symbol);
    }
    if (viewMode === 'all') return scopedPerformances.map((performance) => performance.symbol);
    if (viewMode === 'custom') {
      const scopedSymbols = new Set(scopedPerformances.map((performance) => performance.symbol));
      return customSymbols.filter((symbol) => scopedSymbols.has(symbol));
    }
    return scopedPerformances.slice(0, 10).map((performance) => performance.symbol);
  }, [customSymbols, scopedPerformances, viewMode]);
  const performancesBySymbol = new Map(performances.map((performance) => [performance.symbol, performance]));
  const visiblePerformances = defaultSymbols.flatMap((symbol) => {
    const performance = performancesBySymbol.get(symbol);
    return performance ? [performance] : [];
  });
  const filteredPerformances = scopedPerformances.filter((performance) => {
    const query = search.trim().toLowerCase();
    return !query || performance.symbol.toLowerCase().includes(query) || performance.name.toLowerCase().includes(query);
  });
  const behindCount = scopedPerformances.filter((performance) => performance.excessReturn < 0).length;
  const negativeActiveContribution = scopedPerformances.reduce(
    (total, performance) => total + Math.min(0, performance.activeContributionAmount),
    0,
  );
  const underperformers = scopedPerformances.filter((performance) => performance.excessReturn < 0);
  const topContributors = [...scopedPerformances]
    .filter((performance) => performance.activeContributionAmount > 0)
    .sort((left, right) => right.activeContributionAmount - left.activeContributionAmount);
  const largestDrag = underperformers[0];

  function selectCustomSymbols(symbols: React.Key[]) {
    setCustomSymbols(symbols.map(String));
    setFocusedSymbol(symbols.length === 1 ? String(symbols[0]) : null);
    setViewMode('custom');
  }

  function focusStock(symbol: string) {
    setFocusedSymbol(symbol);
    setCustomSymbols([symbol]);
    setViewMode('custom');
    setSearch(symbol);
  }

  const columns: ColumnsType<HoldingRelativePerformance> = [
    {
      title: 'Rank',
      width: 64,
      render: (_value, record) => performances.findIndex((performance) => performance.symbol === record.symbol) + 1,
    },
    {
      title: 'Stock',
      dataIndex: 'symbol',
      fixed: 'left',
      width: 105,
      sorter: (left, right) => left.symbol.localeCompare(right.symbol),
      render: (symbol, record) => (
        <span>
          <Typography.Text strong>{symbol}</Typography.Text>
          {!record.isCurrent && <Tag className="ml-2">Exited</Tag>}
          {record.holdingEpisodes > 1 && <Tag className="ml-2">{record.holdingEpisodes} episodes</Tag>}
        </span>
      ),
    },
    {
      title: 'Stock return',
      dataIndex: 'stockReturn',
      align: 'right',
      width: 125,
      sorter: (left, right) => left.stockReturn - right.stockReturn,
      render: (value) => `${value.toFixed(2)}%`,
    },
    {
      title: benchmarkSymbol,
      dataIndex: 'benchmarkReturn',
      align: 'right',
      width: 155,
      sorter: (left, right) => left.benchmarkReturn - right.benchmarkReturn,
      render: (value) => `${value.toFixed(2)}%`,
    },
    {
      title: 'Return gap',
      dataIndex: 'excessReturn',
      align: 'right',
      width: 130,
      sorter: (left, right) => left.excessReturn - right.excessReturn,
      render: (value) => (
        <Typography.Text type={value < 0 ? 'danger' : 'success'}>{value.toFixed(2)} pts</Typography.Text>
      ),
    },
    {
      title: 'Avg. weight',
      dataIndex: 'averageWeight',
      align: 'right',
      width: 120,
      sorter: (left, right) => left.averageWeight - right.averageWeight,
      render: (value) => `${(value * 100).toFixed(2)}%`,
    },
    {
      title: 'Active contribution',
      dataIndex: 'activeContributionAmount',
      align: 'right',
      width: 155,
      defaultSortOrder: 'ascend',
      sorter: (left, right) => left.activeContributionAmount - right.activeContributionAmount,
      render: (value) => (
        <Typography.Text type={value < 0 ? 'danger' : 'success'}>
          {isPrivateMode ? '—' : `${value < 0 ? '-' : '+'}${baseCurrencyDisplay} ${formatMoney(Math.abs(value))}`}
        </Typography.Text>
      ),
    },
    {
      title: 'Period held',
      dataIndex: 'periodHeld',
      align: 'right',
      width: 110,
      sorter: (left, right) => left.periodHeld - right.periodHeld,
      render: (value, record) => (
        <span>
          {(value * 100).toFixed(0)}%
          {record.priceCoverage < 0.995 && (
            <Tag color="warning" className="ml-2">
              partial prices
            </Tag>
          )}
        </span>
      ),
    },
  ];

  const impactChartRows = (impactView === 'drags' ? underperformers : topContributors).slice(0, 10);
  const impactChartColor = impactView === 'drags' ? '#ef4444' : '#10b981';
  const impactChartTitle =
    impactView === 'drags'
      ? `Largest 10 Drags vs ${benchmarkName} (${benchmarkSymbol})`
      : `Top 10 Contributors vs ${benchmarkName} (${benchmarkSymbol})`;
  const impactChartOptions: Highcharts.Options = {
    chart: { type: 'bar', height: Math.max(360, impactChartRows.length * 34 + 150) },
    title: { text: impactChartTitle },
    subtitle: {
      text: isPrivateMode
        ? 'Ranked by active contribution; values show excess return while private mode is enabled'
        : `Ranked by active contribution in ${baseCurrencyDisplay}; position size and time held are included`,
    },
    xAxis: {
      categories: impactChartRows.map((performance) => performance.symbol),
      title: { text: undefined },
      labels: { style: { fontWeight: '600' } },
    },
    yAxis: {
      title: {
        text: isPrivateMode ? 'Return gap (percentage points)' : `Active contribution (${baseCurrencyDisplay})`,
      },
      labels: {
        formatter() {
          return isPrivateMode ? `${this.value} pts` : formatCurrency(Number(this.value), 1);
        },
      },
      plotLines: [{ value: 0, color: '#475569', width: 1, zIndex: 3 }],
    },
    legend: { enabled: false },
    navigator: { enabled: false },
    scrollbar: { enabled: false },
    rangeSelector: { enabled: false },
    plotOptions: {
      bar: {
        borderWidth: 0,
        color: impactChartColor,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          formatter() {
            return isPrivateMode
              ? `${formatMoney(Number(this.y), 2)} pts`
              : `${baseCurrencyDisplay} ${formatCurrency(Number(this.y), 1)}`;
          },
          style: { textOutline: 'none', fontWeight: '600' },
        },
      },
      series: {
        point: {
          events: {
            click() {
              if (this.name) focusStock(this.name);
            },
          },
        },
      },
    },
    tooltip: {
      useHTML: true,
      headerFormat: '<b>{point.key}</b><br/>',
      pointFormat:
        '<span>Stock return: <b>{point.custom.stockReturn:.2f}%</b></span><br/>' +
        `<span>${benchmarkSymbol}: <b>{point.custom.benchmarkReturn:.2f}%</b></span><br/>` +
        '<span>Return gap: <b>{point.custom.excessReturn:.2f} pts</b></span><br/>' +
        '<span>Average weight: <b>{point.custom.averageWeight:.2f}%</b></span>',
    },
    series: [
      {
        type: 'bar',
        name: isPrivateMode ? 'Excess return' : 'Active contribution',
        data: impactChartRows.map((performance) => ({
          name: performance.symbol,
          y: isPrivateMode ? performance.excessReturn : performance.activeContributionAmount,
          color: impactChartColor,
          custom: {
            stockReturn: performance.stockReturn,
            benchmarkReturn: performance.benchmarkReturn,
            excessReturn: performance.excessReturn,
            averageWeight: performance.averageWeight * 100,
          },
        })),
      },
    ],
  };

  const chartOptions: Highcharts.Options = {
    chart: { height: 500 },
    title: { text: `Selected Stocks vs ${benchmarkName} (${benchmarkSymbol})` },
    subtitle: { text: 'Cumulative return gap while each stock was held; each holding episode starts at 0%' },
    rangeSelector: { enabled: false },
    navigator: { enabled: true },
    scrollbar: { enabled: false },
    legend: {
      enabled: visiblePerformances.length <= 20,
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
    },
    yAxis: {
      title: { text: 'Return gap (percentage points)' },
      labels: { format: '{value} pts' },
      opposite: false,
      plotLines: [
        {
          value: 0,
          color: '#334155',
          dashStyle: 'ShortDash',
          width: 2,
          zIndex: 4,
          label: {
            text: `${benchmarkSymbol} baseline`,
            align: 'left',
            style: { color: '#334155', fontWeight: '600' },
          },
        },
      ],
    },
    plotOptions: {
      series: {
        connectNulls: false,
        marker: { enabled: false, states: { hover: { enabled: true } } },
        states: { inactive: { opacity: 0.15 } },
      },
    },
    tooltip: {
      pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y:.2f} pts</b><br/>',
      valueDecimals: 2,
    },
    responsive: {
      rules: [
        {
          condition: { maxWidth: 500 },
          chartOptions: { chart: { height: 340 }, navigator: { enabled: false }, subtitle: { text: undefined } },
        },
      ],
    },
    series: visiblePerformances.map((performance) => ({
      type: 'line',
      name: performance.symbol,
      data: performance.relativePerformance.map((point) => [dayjs(point.date, DATE_FORMAT).valueOf(), point.value]),
      lineWidth: 2,
    })),
  };

  const attributionComponents = attribution
    ? [
        { name: 'Stock selection', value: attribution.stockSelection },
        { name: 'Sector / fund allocation', value: attribution.sectorAllocation },
        { name: 'Cash drag', value: attribution.cashDrag },
        { name: 'Currency effects', value: attribution.currencyEffects },
        { name: 'Trading timing', value: attribution.tradingTiming },
        { name: 'Fees', value: attribution.fees },
        { name: 'Unexplained / interaction', value: attribution.residual, color: '#64748b' },
      ]
    : [];
  const attributionChartOptions: Highcharts.Options = {
    chart: { type: 'waterfall', height: 420 },
    title: { text: `Cash-flow-matched gap vs ${benchmarkName} (${benchmarkSymbol})` },
    subtitle: {
      text: 'Every displayed component, including the explicit residual, reconciles to the ending-value gap',
    },
    xAxis: { type: 'category' },
    yAxis: {
      title: { text: `Ending-value effect (${baseCurrencyDisplay})` },
      labels: {
        formatter() {
          return formatCurrency(Number(this.value), 1);
        },
      },
      plotLines: [{ value: 0, color: '#475569', width: 1, zIndex: 3 }],
    },
    legend: { enabled: false },
    navigator: { enabled: false },
    scrollbar: { enabled: false },
    rangeSelector: { enabled: false },
    tooltip: {
      pointFormatter() {
        return `<b>${baseCurrencyDisplay} ${formatMoney(Number(this.y), 2)}</b>`;
      },
    },
    plotOptions: {
      waterfall: {
        upColor: '#10b981',
        color: '#ef4444',
        borderWidth: 0,
        dataLabels: {
          enabled: true,
          formatter() {
            return `${baseCurrencyDisplay} ${formatCurrency(Number(this.y), 1)}`;
          },
          style: { textOutline: 'none', fontWeight: '600' },
        },
      },
    },
    series: attribution
      ? [
          {
            type: 'waterfall',
            name: 'Gap driver',
            data: [
              ...attributionComponents.map((component) => ({
                name: component.name,
                y: component.value,
                color: component.color,
              })),
              { name: 'Total gap', isSum: true, color: attribution.totalGap >= 0 ? '#10b981' : '#ef4444' },
            ],
          },
        ]
      : [],
  };

  return (
    <Card
      className="mt-6 rounded-none"
      title={`Individual Stocks vs ${benchmarkName} (${benchmarkSymbol})`}
      styles={{ body: { padding: 0 } }}
    >
      {loading ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6">
          <Spin size="large" />
          <Typography.Text type="secondary">Comparing each stock over the dates it was held...</Typography.Text>
        </div>
      ) : performances.length === 0 ? (
        <div className="p-6">
          <Empty description="No individual-stock comparisons are available for this period" />
        </div>
      ) : (
        <>
          <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
            <Typography.Paragraph type="secondary" className="mb-4">
              How to read: the impact chart ranks portfolio impact; the timeline shows when each stock diverged. Each
              holding episode starts at the 0% {benchmarkSymbol} baseline, and active contribution includes the amount
              invested and time held. Return gap means the stock return minus the benchmark return, measured in
              percentage points.
            </Typography.Paragraph>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <span>
                {performances.length} of {requestedStockCount} stocks analyzed · {currentCount} current · {exitedCount}{' '}
                exited · benchmark data through {dayjs(marketThroughDate, DATE_FORMAT).format('MMM D, YYYY')}
              </span>
              <Segmented
                size="small"
                aria-label="Filter stocks by holding status"
                value={holdingScope}
                options={[
                  { label: `All (${performances.length})`, value: 'all' },
                  { label: `Current (${currentCount})`, value: 'current' },
                  { label: `Exited (${exitedCount})`, value: 'exited' },
                ]}
                onChange={(value) => {
                  setHoldingScope(value as HoldingScope);
                  setFocusedSymbol(null);
                  setCustomSymbols([]);
                  setViewMode('bottom10');
                  setSearch('');
                  trackEvent('holding-comparison-scope-change', { scope: value });
                }}
              />
            </div>
            {loadIssues.length > 0 && (
              <div className="mb-3 text-sm">
                <Typography.Text type="warning">Some holdings were excluded:</Typography.Text>{' '}
                <Typography.Text type="secondary">{loadIssues.join(' · ')}</Typography.Text>
              </div>
            )}
            <Divider className="!my-4" />

            <Row gutter={[16, 16]} className="mb-5">
              <Col xs={12} lg={6}>
                <Statistic
                  title={`Stocks behind ${benchmarkSymbol}`}
                  value={behindCount}
                  suffix={`/ ${scopedPerformances.length}`}
                />
              </Col>
              <Col xs={12} lg={6}>
                <Statistic
                  title="Negative active contribution"
                  value={isPrivateMode ? '—' : Math.abs(negativeActiveContribution)}
                  precision={isPrivateMode ? undefined : 0}
                  prefix={isPrivateMode ? undefined : `-${baseCurrencyDisplay}`}
                  styles={{ content: { color: '#ef4444' } }}
                />
              </Col>
              <Col xs={12} lg={6}>
                <Statistic title="Largest drag" value={largestDrag?.symbol ?? '—'} />
              </Col>
              <Col xs={12} lg={6}>
                <Statistic
                  title="Largest drag impact"
                  value={isPrivateMode || !largestDrag ? '—' : Math.abs(largestDrag.activeContributionAmount)}
                  precision={isPrivateMode ? undefined : 0}
                  prefix={isPrivateMode ? undefined : `-${baseCurrencyDisplay}`}
                  styles={{ content: { color: '#ef4444' } }}
                />
              </Col>
            </Row>

            <div className="mb-3 flex justify-center">
              <Segmented
                value={impactView}
                options={[
                  { label: 'Largest 10 drags', value: 'drags' },
                  { label: 'Top 10 contributors', value: 'contributors' },
                ]}
                onChange={(value) => setImpactView(value as ImpactView)}
              />
            </div>
            <Typography.Paragraph type="secondary" className="!mb-2 text-center text-sm">
              Select a bar to isolate that stock in the timeline and highlight its ranking row.
            </Typography.Paragraph>
            {impactChartRows.length > 0 ? (
              <Charts options={impactChartOptions} />
            ) : (
              <Empty
                description={`No ${impactView === 'drags' ? 'negative' : 'positive'} contributors for this period`}
              />
            )}

            <div className="mt-6 mb-3">
              <Typography.Title level={5} className="!mb-0">
                When selected stocks diverged
              </Typography.Title>
              <Typography.Text type="secondary">
                Each line is the stock&apos;s cumulative return minus {benchmarkSymbol} over identical held dates.
              </Typography.Text>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Segmented
                value={viewMode}
                options={[
                  { label: 'Bottom 5', value: 'bottom5' },
                  { label: 'Bottom 10', value: 'bottom10' },
                  { label: 'Top 5', value: 'top5' },
                  { label: 'Top 10', value: 'top10' },
                  { label: 'All stocks', value: 'all' },
                  ...(viewMode === 'custom' ? [{ label: `Custom (${customSymbols.length})`, value: 'custom' }] : []),
                ]}
                onChange={(value) => setViewMode(value as ViewMode)}
              />
              <Typography.Text type="secondary">
                {visiblePerformances.length} stock{visiblePerformances.length === 1 ? '' : 's'} shown · use table
                checkboxes to customize
              </Typography.Text>
            </div>

            {visiblePerformances.length > 0 ? (
              <Charts constructorType="stockChart" options={chartOptions} />
            ) : (
              <Empty description="Select at least one stock from the table" />
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <Typography.Title level={5} className="!mb-0">
                  Active-contribution ranking
                </Typography.Title>
                <Typography.Text type="secondary">
                  Most negative dollar impact is ranked first by default.
                </Typography.Text>
              </div>
              <Input.Search
                allowClear
                className="w-full sm:w-[280px]"
                placeholder="Search ticker or company"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <Table
            rowKey="symbol"
            columns={columns}
            dataSource={filteredPerformances}
            scroll={{ x: 1060 }}
            pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100] }}
            rowSelection={{
              preserveSelectedRowKeys: true,
              selectedRowKeys: defaultSymbols,
              onChange: selectCustomSymbols,
            }}
            rowClassName={(record) => (record.symbol === focusedSymbol ? 'performance-focused-row' : '')}
          />
          <Typography.Paragraph type="secondary" className="!mb-0 px-4 py-3 text-xs sm:px-6">
            Returns use adjusted closing prices converted to {baseCurrencyDisplay}. Purchases and sales take effect
            after that market day’s close. A complete sale ends an episode; a later repurchase starts a new line at 0%.
          </Typography.Paragraph>
          <div className="border-t border-slate-200 px-4 py-5 sm:px-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <Typography.Title level={5} className="!mb-0">
                  Performance gap drivers
                </Typography.Title>
                <Typography.Text type="secondary">
                  A transparent bridge from the cash-flow-matched ending-value gap to the observable drivers.
                </Typography.Text>
              </div>
              {attribution && (
                <Tag color={attribution.reconciled ? 'green' : 'red'}>
                  {attribution.reconciled ? 'Arithmetic bridge reconciled' : 'Does not reconcile'}
                </Tag>
              )}
            </div>
            {isPrivateMode ? (
              <Typography.Text type="secondary">
                Dollar attribution is hidden while private mode is enabled.
              </Typography.Text>
            ) : attribution?.reconciled ? (
              <>
                <Charts options={attributionChartOptions} />
                <Collapse
                  ghost
                  items={[
                    {
                      key: 'attribution-notes',
                      label: 'Calculation and data-quality notes',
                      children: (
                        <div className="space-y-2 text-sm text-slate-600">
                          <p>
                            Stock selection compares opening stock holdings with current-sector ETF proxies. Sector and
                            fund allocation contains sector-proxy effects plus funds without historical look-through
                            weights. Trading timing is the difference between actual changing exposures and holding the
                            opening exposures unchanged.
                          </p>
                          <p>
                            Currency effects use local-price return versus base-currency return. Cash drag reconstructs
                            account cash from current balances and recorded cash movements. Fees include explicit fee
                            transactions and fee metadata.
                          </p>
                          <p>
                            {attribution.sectorProxyFallbackObservations} stock observations used the selected benchmark
                            because a sector proxy was unavailable. {attribution.detectedDividendTransactions}{' '}
                            dividend/distribution transactions and {attribution.detectedCorporateActionTransactions}{' '}
                            split, merger, or spinoff transactions were detected. Completeness cannot be verified
                            without an external corporate-actions feed.
                          </p>
                          <p>
                            “Unexplained / interaction” is shown explicitly and includes compounding differences,
                            unclassified assets, income not captured by security prices, missing records, and other
                            interactions. It is not silently assigned to stock selection.
                          </p>
                        </div>
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Typography.Text type="secondary">
                The attribution bridge is unavailable because the required portfolio, market, or cash data did not
                reconcile.
              </Typography.Text>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
