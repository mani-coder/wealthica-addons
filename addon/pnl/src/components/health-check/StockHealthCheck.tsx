/**
 * Stock Health Check Component
 *
 * On-demand health analysis for a single stock position.
 * Loads historical data only for the specified symbol.
 */

import { Alert, Card, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { getSymbol } from '@/utils/common';
import { DATE_FORMAT } from '../../constants';
import { useAddonContext } from '../../context/AddonContext';
import useCurrency from '../../hooks/useCurrency';
import { useSecurityHistory } from '../../hooks/useSecurityHistory';
import { HealthCheckService, type PriceHistory } from '../../services/healthCheckService';
import type { Position } from '../../types';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { SEVERITY_COLORS } from '../../types/healthCheck';
import { BENCHMARKS, type BenchmarkType } from '../../utils/benchmarkData';
import { HealthCheckMetrics } from './HealthCheckMetrics';
import { OpportunityCostChart } from './OpportunityCostChart';

const { Text } = Typography;

interface Props {
  position: Position;
  benchmark?: BenchmarkType; // Optional, defaults to SPY (S&P 500)
}

function StockHealthCheckComponent({ position, benchmark = 'SPY' }: Props) {
  const { toDate } = useAddonContext();
  const { currencies } = useCurrency();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });
  const symbol = getSymbol(position.security);

  const [report, setReport] = useState<HoldingHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockHistory, setStockHistory] = useState<PriceHistory | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<PriceHistory | null>(null);

  const positionStartDate = useMemo(() => {
    return position.transactions?.length ? position.transactions[0].date : dayjs();
  }, [position.transactions]);

  /**
   * Fetch historical price data for a security
   */
  const fetchPriceHistory = useCallback(
    async (securityId: string, symbol: string): Promise<PriceHistory | null> => {
      try {
        console.debug(
          '[DEBUG] fetching price history for',
          securityId,
          symbol,
          positionStartDate.format(DATE_FORMAT),
          toDate,
        );
        const data = await fetchSecurityHistory(securityId, positionStartDate, dayjs(toDate, DATE_FORMAT));
        return {
          symbol,
          prices: data.map((point) => ({ date: point.timestamp.toDate(), close: point.closePrice })),
        };
      } catch (error) {
        console.error(`Failed to fetch price history for ${symbol}:`, error);
        return null;
      }
    },
    [fetchSecurityHistory, positionStartDate, toDate],
  );

  /**
   * Analyze the stock with real historical data
   */
  const analyzeStock = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch benchmark data
      const benchmarkInfo = BENCHMARKS[benchmark];
      const fetchedBenchmarkHistory = await fetchPriceHistory(benchmarkInfo.securityId, benchmarkInfo.symbol);

      if (!fetchedBenchmarkHistory || fetchedBenchmarkHistory.prices.length === 0) {
        throw new Error('Failed to fetch benchmark data');
      }

      // Fetch stock price history
      const fetchedStockHistory = await fetchPriceHistory(position.security.id, symbol);

      if (!fetchedStockHistory || fetchedStockHistory.prices.length === 0) {
        throw new Error('Failed to fetch stock price history');
      }

      // Save to state for the chart
      setStockHistory(fetchedStockHistory);
      setBenchmarkHistory(fetchedBenchmarkHistory);

      // Calculate total portfolio value (just this position for individual analysis)
      const totalPortfolioValue = position.market_value;

      // Create a temporary portfolio with just this position
      const priceHistoriesMap = new Map<string, PriceHistory>();
      priceHistoriesMap.set(symbol, fetchedStockHistory);

      // Use HealthCheckService for detailed analysis with currency conversion
      const service = new HealthCheckService({ benchmarkSymbol: benchmark }, currencies);
      const holdingReport = await service.analyzeHolding(
        position,
        position.transactions || [],
        fetchedStockHistory,
        fetchedBenchmarkHistory,
        totalPortfolioValue,
      );

      setReport(holdingReport);
    } catch (err) {
      console.error('Error analyzing stock:', err);
      setError('Failed to analyze stock. Historical data may not be available.');
    } finally {
      setLoading(false);
    }
  }, [position, symbol, benchmark, fetchPriceHistory, currencies]);

  useEffect(() => {
    analyzeStock();
  }, [analyzeStock]);

  function getScoreColor(score: number): string {
    if (score <= 30) return SEVERITY_COLORS.critical;
    if (score <= 50) return SEVERITY_COLORS.warning;
    if (score <= 70) return SEVERITY_COLORS.info;
    return SEVERITY_COLORS.healthy;
  }

  function getRecommendationColor(recommendation: string): string {
    switch (recommendation) {
      case 'SELL':
        return 'error';
      case 'REVIEW':
        return 'warning';
      case 'ACCUMULATE':
        return 'success';
      default:
        return 'default';
    }
  }

  if (loading) {
    return (
      <Card title={`Health Check Analysis: ${symbol}`}>
        <div className="flex justify-center items-center py-8">
          <Spin size="large" tip="Analyzing stock health..." />
        </div>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card title={`Health Check Analysis: ${symbol}`}>
        <Alert
          message="Analysis Unavailable"
          description={error || 'Unable to analyze this stock at the moment.'}
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      styles={{ body: { padding: 0 } }}
      title={
        <div className="flex items-center justify-between">
          <span>Health Check Analysis: {symbol}</span>
          <div className="flex items-center gap-3">
            <Text strong style={{ fontSize: 20, color: getScoreColor(report.score) }}>
              {report.score}/100
            </Text>
            <Tag color={getRecommendationColor(report.recommendation)}>{report.recommendation}</Tag>
          </div>
        </div>
      }
    >
      <div className="mt-3" />
      {/* Opportunity Cost Comparison Chart */}
      {stockHistory && benchmarkHistory && position.transactions && (
        <OpportunityCostChart
          transactions={position.transactions}
          stockHistory={stockHistory}
          benchmarkHistory={benchmarkHistory}
          benchmark={benchmark}
          stockCurrency={position.security.currency}
        />
      )}

      {/* Issues Found */}
      {report.flagDescriptions.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200">
          <h3 className="text-sm font-semibold text-amber-900 mb-3">Issues Identified</h3>
          <div className="space-y-2">
            {report.flagDescriptions.map((desc, index) => (
              <div key={`issue-${desc}`} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-amber-200 text-amber-900 rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="flex-1">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health Check Metrics */}
      <HealthCheckMetrics report={report} benchmark={benchmark} position={position} />
    </Card>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export const StockHealthCheck = memo(StockHealthCheckComponent);
