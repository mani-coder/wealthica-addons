import { AutoComplete, Card, Spin, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { trackEvent } from '../../analytics';
import { BENCHMARK_SERIES_OPTIONS, DATE_FORMAT, PORTFOLIO_SERIES_OPTIONS } from '../../constants';
import { useAddon, useAddonContext } from '../../context/AddonContext';
import { useBenchmark } from '../../context/BenchmarkContext';
import useCurrency from '../../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../../hooks/useSecurityHistory';
import type { Account, Portfolio, Position, Transaction } from '../../types';
import {
  BENCHMARKS,
  type BenchmarkType,
  calculateYearlyReturnsWithMonthlyBreakdown,
  normalizePortfolioToPercentageReturns,
  normalizeToPercentageReturns,
} from '../../utils/benchmarkData';
import { buildCorsFreeUrl } from '../../utils/common';
import Charts from '../Charts';
import AlternativeScenarios from './AlternativeScenarios';
import HoldingsRelativePerformance from './HoldingsRelativePerformance';
import Metrics from './Metrics';
import PeriodReturnsTable from './PeriodReturnsTable';

type SecuritySearchResult = {
  _id: string;
  symbol: string;
  name: string;
  currency: string;
  type: string;
};

type Props = {
  portfolios: Portfolio[];
  positions: Position[];
  transactions: Transaction[];
  accounts: Account[];
  rawTransactions: any[];
};

function BenchmarkComparison(props: Props) {
  const addon = useAddon();
  const { fromDate, toDate, isPrivateMode } = useAddonContext();
  const { setSelectedBenchmark, benchmarkInfo, fetchBenchmarkHistory } = useBenchmark();
  const { getValue: convertCurrency } = useCurrency();

  const [customSecurity, setCustomSecurity] = useState<SecuritySearchResult | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<SecurityPriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SecuritySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  /**
   * Search for securities using Wealthica API
   */
  const searchSecurities = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        let response: SecuritySearchResult[];
        if (addon) {
          response = await addon.request({ query: { search: query }, method: 'GET', endpoint: 'securities' });
        } else {
          const url = buildCorsFreeUrl(`https://app.wealthica.com/api/securities?search=${encodeURIComponent(query)}`);
          const fetchResponse = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
          });
          response = await fetchResponse.json();
        }

        // Filter to only USD equities and limit results
        const filtered = response.filter((sec) => sec.currency === 'usd' && sec.type === 'equity').slice(0, 10);
        setSearchResults(filtered);
      } catch (error) {
        console.error('Failed to search securities:', error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [addon],
  );

  /**
   * Fetch custom security historical data from Wealthica Securities API
   */
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });

  const fetchCustomSecurityData = useCallback(
    async (security: SecuritySearchResult, fromDate: Dayjs, toDate: Dayjs) => {
      try {
        console.debug('Fetching custom security data for', security.symbol);

        // Custom securities must use the same historical base-currency conversion as built-in benchmarks.
        const priceHistory = await fetchSecurityHistory(
          { securityId: security._id, yahooSymbol: security.symbol },
          fromDate,
          toDate,
        );
        return priceHistory.map((point) => ({
          ...point,
          closePrice: convertCurrency(security.currency, point.closePrice, point.timestamp),
          adjustedClosePrice:
            point.adjustedClosePrice === undefined
              ? undefined
              : convertCurrency(security.currency, point.adjustedClosePrice, point.timestamp),
        }));
      } catch (error) {
        console.error(`Failed to fetch custom security data for ${security.symbol}:`, error);
        return [];
      }
    },
    [convertCurrency, fetchSecurityHistory],
  );

  const effectiveEndDate = useMemo(() => {
    const requestedEndDate = dayjs(toDate, DATE_FORMAT);
    const lastBenchmarkPoint = [...benchmarkData]
      .filter((point) => point.timestamp.isSameOrBefore(requestedEndDate, 'day'))
      .sort((a, b) => b.timestamp.valueOf() - a.timestamp.valueOf())[0];
    return lastBenchmarkPoint?.timestamp.format(DATE_FORMAT) ?? toDate;
  }, [benchmarkData, toDate]);

  const comparisonPortfolios = useMemo(
    () => props.portfolios.filter((portfolio) => portfolio.date >= fromDate && portfolio.date <= effectiveEndDate),
    [effectiveEndDate, fromDate, props.portfolios],
  );

  const benchmarkDataFormatted = useMemo(
    () =>
      benchmarkData.map((point) => ({
        date: point.timestamp.format(DATE_FORMAT),
        value: point.adjustedClosePrice ?? point.closePrice,
      })),
    [benchmarkData],
  );

  // Normalize portfolio data using time-weighted returns and the same end date as the benchmark.
  const portfolioReturns = useMemo(() => {
    return normalizePortfolioToPercentageReturns(comparisonPortfolios);
  }, [comparisonPortfolios]);

  // Normalize benchmark adjusted-close data using the prior market close when the start is a non-trading day.
  const benchmarkReturns = useMemo(() => {
    return normalizeToPercentageReturns(benchmarkDataFormatted, fromDate).filter(
      (point) => point.date <= effectiveEndDate,
    );
  }, [benchmarkDataFormatted, effectiveEndDate, fromDate]);

  const benchmarkReturnBasis = useMemo(
    () => (benchmarkData.every((point) => point.returnBasis === 'total') ? 'total return' : 'price return'),
    [benchmarkData],
  );

  /*
   * Convert SecurityPriceData to BenchmarkData format for period calculations.
   * The prior-close observation is retained so the first period return has a valid baseline.
   */
  const periodBenchmarkData = useMemo(() => {
    return benchmarkDataFormatted.filter((point) => point.date <= effectiveEndDate);
  }, [benchmarkDataFormatted, effectiveEndDate]);

  // Calculate yearly returns with monthly breakdowns for nested table view
  const periodReturns = useMemo(() => {
    if (comparisonPortfolios.length === 0 || periodBenchmarkData.length === 0) return [];
    return calculateYearlyReturnsWithMonthlyBreakdown(comparisonPortfolios, periodBenchmarkData, fromDate);
  }, [comparisonPortfolios, fromDate, periodBenchmarkData]);

  // Fetch benchmark data when selection changes
  useEffect(() => {
    const loadBenchmarkData = async () => {
      setLoading(true);
      try {
        const _fromDate = dayjs(fromDate, DATE_FORMAT);
        const _toDate = dayjs(toDate, DATE_FORMAT);

        let data: SecurityPriceData[];
        const historyFromDate = _fromDate.subtract(7, 'days');
        if (customSecurity) {
          data = await fetchCustomSecurityData(customSecurity, historyFromDate, _toDate);
        } else {
          // Fetch benchmark data with automatic currency conversion
          data = await fetchBenchmarkHistory(historyFromDate, _toDate);
        }
        setBenchmarkData(data);
      } catch (error) {
        console.error('Failed to load benchmark data:', error);
        setBenchmarkData([]);
      } finally {
        setLoading(false);
      }
    };

    loadBenchmarkData();
  }, [customSecurity, fromDate, toDate, fetchBenchmarkHistory, fetchCustomSecurityData]);

  const currentBenchmarkInfo = useMemo(() => {
    if (customSecurity) {
      return {
        symbol: customSecurity.symbol,
        name: customSecurity.name,
        description: `${customSecurity.name} (${customSecurity.currency.toUpperCase()})`,
      };
    }
    return {
      symbol: benchmarkInfo.symbol,
      name: benchmarkInfo.name,
      description: benchmarkInfo.description,
    };
  }, [benchmarkInfo, customSecurity]);

  function getSeries(): any {
    return [
      {
        name: 'Your Portfolio',
        data: portfolioReturns.map((point) => ({
          x: dayjs(point.date).valueOf(),
          y: point.value,
          displayValue: isPrivateMode ? '-' : `${point.value.toFixed(2)}%`,
        })),
        ...PORTFOLIO_SERIES_OPTIONS,
      },
      {
        name: currentBenchmarkInfo?.name || 'Benchmark',
        data: benchmarkReturns.map((point) => ({
          x: dayjs(point.date).valueOf(),
          y: point.value,
          displayValue: `${point.value.toFixed(2)}%`,
        })),
        ...BENCHMARK_SERIES_OPTIONS,
      },
    ];
  }

  function getOptions(): Highcharts.Options {
    const info = currentBenchmarkInfo;
    if (!info) return { series: [] };

    return {
      chart: {
        height: 500,
      },
      title: {
        text: `Portfolio vs ${info.name} (${info.symbol}) Performance`,
      },
      subtitle: {
        text: info.description,
        style: { color: '#1F2A33' },
      },

      rangeSelector: { enabled: true, inputEnabled: true, selected: 1 },

      navigator: { enabled: true },
      scrollbar: { enabled: false },

      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        itemMarginTop: 8,
        itemDistance: 24,
      },

      yAxis: [
        {
          crosshair: {
            dashStyle: 'Dash',
          },
          labels: {
            enabled: true,
            format: '{value}%',
          },
          title: {
            text: 'Return (%)',
          },
          opposite: false,
        },
      ],

      plotOptions: {
        series: {
          marker: {
            enabled: false,
            states: {
              hover: {
                enabled: true,
              },
            },
          },
        },
      },

      tooltip: {
        pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.displayValue}</b><br/>',
        valueDecimals: 2,
        split: true,
      },

      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 500,
            },
            chartOptions: {
              chart: {
                height: 300,
              },
              subtitle: {
                text: undefined,
              },
              navigator: {
                enabled: false,
              },
            },
          },
        ],
      },

      series: getSeries(),
    };
  }

  // Prepare options for AutoComplete
  const autoCompleteOptions = useMemo(() => {
    const options: any[] = [];

    // Search results section (show first when available)
    if (searchResults.length > 0) {
      options.push({
        label: <div className="font-semibold text-gray-700">Search Results</div>,
        options: searchResults.map((sec) => ({
          value: `custom:${sec._id}`,
          label: (
            <div>
              <div className="font-medium">{`${sec.symbol} - ${sec.name}`}</div>
              <div className="text-xs text-gray-500">{sec.currency.toUpperCase()}</div>
            </div>
          ),
        })),
      });
    }

    // Popular benchmarks section
    options.push({
      label: <div className="font-semibold text-gray-700">Popular Benchmarks</div>,
      options: Object.values(BENCHMARKS).map((benchmark) => ({
        value: `benchmark:${benchmark.symbol}`,
        label: (
          <div>
            <div className="font-medium">{`${benchmark.name} (${benchmark.symbol}) - ${benchmark.currency}`}</div>
            <div className="text-xs text-gray-500">{benchmark.description}</div>
          </div>
        ),
      })),
    });

    return options;
  }, [searchResults]);

  // Display value for the selected item
  const displayValue = useMemo(() => {
    if (customSecurity) {
      return `${customSecurity.symbol} - ${customSecurity.name}`;
    }
    return `${benchmarkInfo.name} (${benchmarkInfo.symbol}) - ${benchmarkInfo.currency}`;
  }, [benchmarkInfo, customSecurity]);

  const formattedFromDate = dayjs(fromDate, DATE_FORMAT).format('MMM D, YYYY');
  const formattedToDate = dayjs(toDate, DATE_FORMAT).format('MMM D, YYYY');
  const formattedEffectiveEndDate = dayjs(effectiveEndDate, DATE_FORMAT).format('MMM D, YYYY');

  return (
    <div className="w-full">
      <Card
        title="Performance Benchmark Comparison"
        extra={
          <div className="text-right">
            <Typography.Text className="text-gray-600 text-sm block">
              {formattedFromDate} to {formattedToDate}
            </Typography.Text>
            {effectiveEndDate !== toDate && (
              <Typography.Text className="text-gray-500 text-xs">
                Market data through {formattedEffectiveEndDate}
              </Typography.Text>
            )}
          </div>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div className="p-4">
          <Typography.Text strong>Compare Against: </Typography.Text>
          <AutoComplete
            key={displayValue} // Force re-render when selection changes to update display
            className="w-[400px] ml-2"
            defaultValue={displayValue}
            options={autoCompleteOptions}
            showSearch={{ onSearch: searchSecurities }}
            onSelect={(value) => {
              if (value.startsWith('benchmark:')) {
                const symbol = value.replace('benchmark:', '') as BenchmarkType;
                setSelectedBenchmark(symbol);
                setCustomSecurity(null);
                trackEvent('benchmark-selection', { benchmarkId: symbol });
              } else if (value.startsWith('custom:')) {
                const securityId = value.replace('custom:', '');
                const security = searchResults.find((s) => s._id === securityId);
                if (security) {
                  setCustomSecurity(security);
                  trackEvent('custom-security-selection', { isCustom: true });
                }
              }
            }}
            placeholder="Search for any stock or ETF (e.g., AAPL, MSFT)..."
            notFoundContent={searching ? <Spin size="small" /> : null}
          />
          {currentBenchmarkInfo && <div className="text-xs text-gray-600 mt-1">{currentBenchmarkInfo.description}</div>}
        </div>

        {loading ? (
          <div className="flex justify-center items-center min-h-[200px]">
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Metrics
              portfolioReturns={portfolioReturns}
              benchmarkReturns={benchmarkReturns}
              portfolios={comparisonPortfolios}
              benchmarkName={currentBenchmarkInfo?.name || 'Benchmark'}
              benchmarkReturnBasis={benchmarkReturnBasis}
            />

            {benchmarkReturns.length > 0 ? (
              <>
                <div className="px-4 pb-2 text-sm text-slate-500 sm:px-6">
                  Time-weighted portfolio return · {benchmarkReturnBasis} benchmark · market data through{' '}
                  {formattedEffectiveEndDate}
                </div>
                <Charts constructorType="stockChart" options={getOptions()} />
              </>
            ) : (
              <div className="text-center p-8 text-gray-600">
                <Typography.Text>Unable to load benchmark data. Please try again later.</Typography.Text>
              </div>
            )}

            <AlternativeScenarios portfolios={props.portfolios} fromDate={fromDate} toDate={toDate} />

            <HoldingsRelativePerformance
              positions={props.positions}
              transactions={props.transactions}
              portfolios={props.portfolios}
              benchmarkReturns={benchmarkReturns}
              benchmarkName={currentBenchmarkInfo?.name || 'Benchmark'}
              benchmarkSymbol={currentBenchmarkInfo?.symbol || 'Benchmark'}
              fromDate={fromDate}
              toDate={effectiveEndDate}
              accounts={props.accounts}
              rawTransactions={props.rawTransactions}
            />

            <PeriodReturnsTable
              periods={periodReturns}
              benchmarkName={currentBenchmarkInfo?.name || 'Benchmark'}
              benchmarkSymbol={currentBenchmarkInfo?.symbol || 'Benchmark'}
              fromDate={fromDate}
              toDate={toDate}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export default React.memo(BenchmarkComparison);
