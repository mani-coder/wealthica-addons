import { AutoComplete, Spin, Statistic, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { trackEvent } from '../analytics';
import { DATE_FORMAT } from '../constants';
import { useAddon } from '../context/AddonContext';
import { useSecurityHistory } from '../hooks/useSecurityHistory';
import type { Portfolio } from '../types';
import {
  BENCHMARKS,
  type BenchmarkType,
  calculateAlpha,
  calculateCorrelation,
  normalizePortfolioToPercentageReturns,
  normalizeToPercentageReturns,
} from '../utils/benchmarkData';
import { buildCorsFreeUrl } from '../utils/common';
import Charts from './Charts';
import Collapsible from './Collapsible';

type SecuritySearchResult = {
  _id: string;
  symbol: string;
  name: string;
  currency: string;
  type: string;
};

type Props = {
  portfolios: Portfolio[];
  isPrivateMode: boolean;
  fromDate: string;
  toDate: string;
};

function BenchmarkComparison(props: Props) {
  const addon = useAddon();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });

  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkType | null>('SPY');
  const [customSecurity, setCustomSecurity] = useState<SecuritySearchResult | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<{ date: string; value: number }[]>([]);
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
   * Fetch benchmark historical data from Wealthica Securities API
   */
  const fetchBenchmarkData = useCallback(
    async (securityId: string, fromDate: Dayjs, toDate: Dayjs): Promise<{ date: string; value: number }[]> => {
      try {
        console.debug('Fetching benchmark data for security', securityId);

        // Use the shared fetchSecurityHistory callback
        const parsedData = await fetchSecurityHistory(securityId, fromDate, toDate);

        // Convert to BenchmarkData format
        return parsedData.map((point) => ({
          date: point.timestamp.format(DATE_FORMAT),
          value: point.closePrice,
        }));
      } catch (error) {
        console.error(`Failed to fetch benchmark data for ${securityId}:`, error);
        return [];
      }
    },
    [fetchSecurityHistory],
  );

  // Normalize portfolio data to percentage returns (accounting for deposits/withdrawals)
  const portfolioReturns = useMemo(() => {
    return normalizePortfolioToPercentageReturns(props.portfolios);
  }, [props.portfolios]);

  // Normalize benchmark data to percentage returns
  const benchmarkReturns = useMemo(() => {
    return normalizeToPercentageReturns(benchmarkData);
  }, [benchmarkData]);

  // Calculate metrics
  const alpha = useMemo(() => {
    return calculateAlpha(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  const correlation = useMemo(() => {
    return calculateCorrelation(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  // Fetch benchmark data when selection changes
  useEffect(() => {
    const loadBenchmarkData = async () => {
      const securityId = customSecurity?._id || (selectedBenchmark ? BENCHMARKS[selectedBenchmark]?.securityId : null);

      if (!securityId) {
        setBenchmarkData([]);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchBenchmarkData(
          securityId,
          dayjs(props.fromDate, DATE_FORMAT),
          dayjs(props.toDate, DATE_FORMAT),
        );
        setBenchmarkData(data);
      } catch (error) {
        console.error('Failed to load benchmark data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBenchmarkData();
  }, [selectedBenchmark, customSecurity, props.fromDate, props.toDate, fetchBenchmarkData]);

  const currentBenchmarkInfo = useMemo(() => {
    if (customSecurity) {
      return {
        symbol: customSecurity.symbol,
        name: customSecurity.name,
        description: `${customSecurity.name} (${customSecurity.currency.toUpperCase()})`,
      };
    }
    if (selectedBenchmark) {
      return BENCHMARKS[selectedBenchmark];
    }
    return null;
  }, [selectedBenchmark, customSecurity]);

  function getSeries(): any {
    return [
      {
        id: 'portfolio',
        name: 'Your Portfolio',
        data: portfolioReturns.map((point) => ({
          x: dayjs(point.date).valueOf(),
          y: point.value,
          displayValue: props.isPrivateMode ? '-' : `${point.value.toFixed(2)}%`,
        })),
        type: 'spline',
        color: '#10b981',
        lineWidth: 2,
      },
      {
        id: 'benchmark',
        name: currentBenchmarkInfo?.name || 'Benchmark',
        data: benchmarkReturns.map((point) => ({
          x: dayjs(point.date).valueOf(),
          y: point.value,
          displayValue: `${point.value.toFixed(2)}%`,
        })),
        type: 'spline',
        color: '#f59e0b',
        lineWidth: 2,
        dashStyle: 'ShortDash',
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

      rangeSelector: {
        buttonTheme: {
          style: {
            display: 'none',
          },
        },
        dropdown: 'always',
        buttonPosition: {
          align: 'right',
        },
        selected: 1,
        enabled: true as any,
        inputEnabled: false,
      },

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

  const portfolioFinalReturn = portfolioReturns.length > 0 ? portfolioReturns[portfolioReturns.length - 1].value : 0;
  const benchmarkFinalReturn = benchmarkReturns.length > 0 ? benchmarkReturns[benchmarkReturns.length - 1].value : 0;

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
            <div className="font-medium">{`${benchmark.name} (${benchmark.symbol})`}</div>
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
    if (selectedBenchmark) {
      return `${BENCHMARKS[selectedBenchmark].name} (${selectedBenchmark})`;
    }
    return '';
  }, [selectedBenchmark, customSecurity]);

  return (
    <div className="zero-padding w-full">
      <Collapsible title="Benchmark Comparison">
        <div className="p-4">
          <Typography.Text strong>Compare Against: </Typography.Text>
          <AutoComplete
            key={displayValue} // Force re-render when selection changes to update display
            style={{ width: 400, marginLeft: 8 }}
            defaultValue={displayValue}
            options={autoCompleteOptions}
            onSearch={searchSecurities}
            onSelect={(value) => {
              if (value.startsWith('benchmark:')) {
                const symbol = value.replace('benchmark:', '') as BenchmarkType;
                setSelectedBenchmark(symbol);
                setCustomSecurity(null);
                trackEvent('benchmark-selection', { benchmark: symbol });
              } else if (value.startsWith('custom:')) {
                const securityId = value.replace('custom:', '');
                const security = searchResults.find((s) => s._id === securityId);
                if (security) {
                  setCustomSecurity(security);
                  setSelectedBenchmark(null);
                  trackEvent('custom-security-selection', { symbol: security.symbol });
                }
              }
            }}
            placeholder="Search for any stock or ETF (e.g., AAPL, MSFT)..."
            notFoundContent={searching ? <Spin size="small" /> : null}
          />
          {currentBenchmarkInfo && <div className="text-xs text-gray-600 mt-1">{currentBenchmarkInfo.description}</div>}
        </div>

        {loading ? (
          <div className="flex justify-center items-center" style={{ minHeight: 200 }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <div className="flex justify-evenly flex-wrap mb-6 p-4" style={{ backgroundColor: '#f9fafb' }}>
              <Statistic
                title="Your Portfolio Return"
                value={props.isPrivateMode ? '-' : `${portfolioFinalReturn.toFixed(2)}%`}
                valueStyle={{ color: portfolioFinalReturn >= 0 ? '#10b981' : '#ef4444' }}
              />
              <Statistic
                title={`${currentBenchmarkInfo?.name || 'Benchmark'} Return`}
                value={`${benchmarkFinalReturn.toFixed(2)}%`}
                valueStyle={{ color: benchmarkFinalReturn >= 0 ? '#10b981' : '#ef4444' }}
              />
              <Statistic
                title="Alpha (Outperformance)"
                value={props.isPrivateMode ? '-' : `${alpha.toFixed(2)}%`}
                valueStyle={{ color: alpha >= 0 ? '#10b981' : '#ef4444' }}
                prefix={alpha >= 0 ? '+' : ''}
              />
              <Statistic
                title="Correlation"
                value={props.isPrivateMode ? '-' : correlation.toFixed(3)}
                valueStyle={{ color: '#3b82f6' }}
              />
            </div>

            {benchmarkReturns.length > 0 ? (
              <Charts constructorType="stockChart" options={getOptions()} />
            ) : (
              <div className="text-center p-8 text-gray-600">
                <Typography.Text>Unable to load benchmark data. Please try again later.</Typography.Text>
              </div>
            )}

            <div className="mt-4 p-4" style={{ backgroundColor: '#f9fafb', borderRadius: 4 }}>
              <Typography.Title level={5}>Understanding the Metrics</Typography.Title>
              <ul className="space-y-2">
                <li>
                  <strong>Alpha:</strong> Measures your portfolio's excess return compared to the benchmark. Positive
                  alpha means you're outperforming.
                </li>
                <li>
                  <strong>Correlation:</strong> Measures how closely your portfolio moves with the benchmark (ranges
                  from -1 to 1). Higher correlation means your portfolio behaves similarly to the market.
                </li>
              </ul>
            </div>
          </>
        )}
      </Collapsible>
    </div>
  );
}

export default React.memo(BenchmarkComparison);
