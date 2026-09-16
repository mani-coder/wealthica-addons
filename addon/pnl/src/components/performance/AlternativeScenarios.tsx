import { Alert, Card, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { DATE_FORMAT } from '../../constants';
import { useAddonContext } from '../../context/AddonContext';
import useCurrency from '../../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../../hooks/useSecurityHistory';
import type { Portfolio } from '../../types';
import { BENCHMARKS, normalizeToPercentageReturns } from '../../utils/benchmarkData';
import { formatMoney } from '../../utils/common';
import { simulateCashFlowMatchedScenario } from '../../utils/portfolioPerformance';

const MARKET_SYMBOLS = ['SPY', 'QQQM', 'VOOG', 'VTI'] as const;
type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

const SCENARIOS = [
  { key: 'spy', name: 'S&P 500 baseline', allocations: { SPY: 1 } },
  { key: 'qqqm', name: 'QQQM', allocations: { QQQM: 1 } },
  { key: 'voog', name: 'VOOG', allocations: { VOOG: 1 } },
  { key: 'vti-qqqm', name: 'Broad-market core + QQQM', allocations: { VTI: 0.8, QQQM: 0.2 } },
  { key: 'vti-voog', name: 'Broad-market core + VOOG', allocations: { VTI: 0.8, VOOG: 0.2 } },
] as const;

type Props = {
  portfolios: Portfolio[];
  fromDate: string;
  toDate: string;
};

type ScenarioRow = {
  key: string;
  name: string;
  mix: string;
  returnPercent: number;
  endingValue: number;
  actualMinusScenario: number;
};

function AlternativeScenarios({ portfolios, fromDate, toDate }: Props) {
  const { isPrivateMode } = useAddonContext();
  const { baseCurrencyDisplay, getValue: convertCurrency } = useCurrency();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });
  const [histories, setHistories] = useState<Partial<Record<MarketSymbol, SecurityPriceData[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const start = dayjs(fromDate, DATE_FORMAT).subtract(7, 'days');
        const end = dayjs(toDate, DATE_FORMAT);
        const entries = await Promise.all(
          MARKET_SYMBOLS.map(async (symbol) => {
            const benchmark = BENCHMARKS[symbol];
            const history = await fetchSecurityHistory(
              { securityId: benchmark.securityId, yahooSymbol: benchmark.symbol },
              start,
              end,
            );
            return [
              symbol,
              history.map((point) => ({
                ...point,
                closePrice: convertCurrency(benchmark.currency, point.closePrice, point.timestamp),
                adjustedClosePrice:
                  point.adjustedClosePrice === undefined
                    ? undefined
                    : convertCurrency(benchmark.currency, point.adjustedClosePrice, point.timestamp),
              })),
            ] as const;
          }),
        );
        if (!cancelled) setHistories(Object.fromEntries(entries));
      } catch (loadError) {
        console.error('Failed to load alternative scenarios:', loadError);
        if (!cancelled) setError('Alternative market histories are temporarily unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [convertCurrency, fetchSecurityHistory, fromDate, toDate]);

  const normalizedReturns = useMemo(() => {
    return Object.fromEntries(
      MARKET_SYMBOLS.map((symbol) => {
        const formatted = (histories[symbol] ?? []).map((point) => ({
          date: point.timestamp.format(DATE_FORMAT),
          value: point.adjustedClosePrice ?? point.closePrice,
        }));
        return [symbol, normalizeToPercentageReturns(formatted, fromDate).filter((point) => point.date <= toDate)];
      }),
    ) as Record<MarketSymbol, { date: string; value: number }[]>;
  }, [fromDate, histories, toDate]);

  const commonEndDate = useMemo(() => {
    const lastDates = [
      portfolios.filter((portfolio) => portfolio.date >= fromDate && portfolio.date <= toDate).at(-1)?.date,
      ...MARKET_SYMBOLS.map((symbol) => normalizedReturns[symbol].at(-1)?.date),
    ].filter((date): date is string => Boolean(date));
    return lastDates.length === MARKET_SYMBOLS.length + 1 ? lastDates.sort()[0] : null;
  }, [fromDate, normalizedReturns, portfolios, toDate]);

  const rows = useMemo<ScenarioRow[]>(() => {
    if (!commonEndDate) return [];
    const comparisonPortfolios = portfolios.filter(
      (portfolio) => portfolio.date >= fromDate && portfolio.date <= commonEndDate,
    );
    return SCENARIOS.flatMap((scenario) => {
      const result = simulateCashFlowMatchedScenario(
        comparisonPortfolios,
        Object.entries(scenario.allocations).map(([symbol, allocation]) => ({
          symbol,
          allocation,
          returns: normalizedReturns[symbol as MarketSymbol].filter((point) => point.date <= commonEndDate),
        })),
      );
      if (!result) return [];
      return [
        {
          key: scenario.key,
          name: scenario.name,
          mix: Object.entries(scenario.allocations)
            .map(([symbol, allocation]) => `${Math.round(allocation * 100)}% ${symbol}`)
            .join(' / '),
          returnPercent: result.returnPercent,
          endingValue: result.endingValue,
          actualMinusScenario: result.actualMinusScenario,
        },
      ];
    });
  }, [commonEndDate, fromDate, normalizedReturns, portfolios]);

  const columns: ColumnsType<ScenarioRow> = [
    { title: 'Alternative', dataIndex: 'name', key: 'name' },
    { title: 'Fixed sleeves', dataIndex: 'mix', key: 'mix' },
    {
      title: 'Return',
      dataIndex: 'returnPercent',
      key: 'returnPercent',
      align: 'right',
      render: (value: number) => `${value.toFixed(2)}%`,
    },
    {
      title: 'Ending value',
      dataIndex: 'endingValue',
      key: 'endingValue',
      align: 'right',
      render: (value: number) => (isPrivateMode ? '—' : `${baseCurrencyDisplay} ${formatMoney(value)}`),
    },
    {
      title: 'Actual minus alternative',
      dataIndex: 'actualMinusScenario',
      key: 'actualMinusScenario',
      align: 'right',
      render: (value: number) =>
        isPrivateMode ? (
          '—'
        ) : (
          <Typography.Text type={value >= 0 ? 'success' : 'danger'}>
            {value >= 0 ? '+' : '−'}
            {baseCurrencyDisplay} {formatMoney(Math.abs(value))}
          </Typography.Text>
        ),
    },
  ];

  const usesOnlyTotalReturn = MARKET_SYMBOLS.every((symbol) =>
    (histories[symbol] ?? []).every((point) => point.returnBasis === 'total'),
  );

  return (
    <Card title="Cash-flow-matched alternatives" className="mt-6 rounded-none" styles={{ body: { padding: 0 } }}>
      <div className="p-4 sm:p-6">
        <Typography.Paragraph type="secondary" className="!mb-0">
          Each alternative starts with the same opening value and receives every contribution and withdrawal on the
          portfolio&apos;s recorded date. The 80/20 blends use separate drifting sleeves with no daily rebalancing.
        </Typography.Paragraph>
        {loading ? (
          <div className="flex justify-center pt-6">
            <Spin />
          </div>
        ) : error ? (
          <Alert className="mt-4" type="warning" showIcon title={error} />
        ) : rows.length === 0 ? (
          <Alert
            className="mt-4"
            type="warning"
            showIcon
            title="Not enough common portfolio and market history to run alternatives."
          />
        ) : (
          !usesOnlyTotalReturn && (
            <Alert
              className="mt-4"
              type="warning"
              showIcon
              title="At least one market source supplied price return rather than adjusted-close total return."
            />
          )
        )}
      </div>
      {!loading && !error && rows.length > 0 && (
        <Table columns={columns} dataSource={rows} pagination={false} size="small" scroll={{ x: 720 }} />
      )}
    </Card>
  );
}

export default React.memo(AlternativeScenarios);
