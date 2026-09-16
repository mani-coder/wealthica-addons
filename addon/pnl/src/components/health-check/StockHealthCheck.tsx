/**
 * Stock Health Check Component
 *
 * On-demand health analysis for a single stock position.
 * Loads historical data only for the specified symbol.
 */

import { Alert, Card, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/analytics';
import { formatDate, getSymbol, sumOf } from '@/utils/common';
import { calculateOpenTransactions } from '@/utils/transactionUtils';
import { DATE_FORMAT } from '../../constants';
import { useAddonContext } from '../../context/AddonContext';
import { useBenchmark } from '../../context/BenchmarkContext';
import useCurrency from '../../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../../hooks/useSecurityHistory';
import { HealthCheckService, type PriceHistory, type PricePoint } from '../../services/healthCheckService';
import type { Position } from '../../types';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { BenchmarkSelector } from '../common/BenchmarkSelector';
import { CloseButton } from '../common/CloseButton';
import { HealthCheckMetrics } from './HealthCheckMetrics';
import { OpportunityCostChart } from './OpportunityCostChart';

interface Props {
  position: Position;
  /** Show benchmark selector dropdown for quick benchmark switching (default: false) */
  showBenchmarkSelector?: boolean;
  onClose?: () => void;
}

function toPricePoints(prices: SecurityPriceData[]): PricePoint[] {
  return prices.map((price) => ({
    date: price.timestamp.toDate(),
    close: price.adjustedClosePrice ?? price.closePrice,
  }));
}

export const StockHealthCheck = memo<Props>(({ position, showBenchmarkSelector = false, onClose }) => {
  const { toDate, portfolioValue } = useAddonContext();
  const { currencies, getValue: convertCurrency } = useCurrency();
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 20 });
  const { selectedBenchmark, fetchBenchmarkHistory } = useBenchmark();
  const symbol = getSymbol(position.security);

  const [report, setReport] = useState<HoldingHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockHistory, setStockHistory] = useState<PriceHistory | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<PriceHistory | null>(null);

  const openTransactions = useMemo(() => {
    const _openTransactions = calculateOpenTransactions(position.transactions, currencies);
    console.debug(
      `Open transactions for ${getSymbol(position.security)}, openShares: ${sumOf(..._openTransactions.map((t) => t.shares))}`,
      _openTransactions.map((t) => ({ ...t, date: formatDate(t.date) })),
    );
    return _openTransactions;
  }, [position.transactions, currencies]);

  const positionStartDate = useMemo(
    () =>
      openTransactions[0]?.date ?? position.transactions?.[0]?.date ?? dayjs(toDate, DATE_FORMAT).subtract(1, 'year'),
    [openTransactions, position.transactions, toDate],
  );

  useEffect(() => {
    trackEvent('stock-health-check', { benchmark: selectedBenchmark });
  }, [symbol, selectedBenchmark]);

  /**
   * Fetch historical price data for a security
   */
  const fetchPriceHistory = useCallback(
    async (securityId: string, symbol: string, currency: string): Promise<PriceHistory | null> => {
      try {
        console.debug(
          '[DEBUG] fetching price history for',
          securityId,
          symbol,
          positionStartDate.format(DATE_FORMAT),
          toDate,
        );
        const data = await fetchSecurityHistory(
          { securityId, yahooSymbol: symbol },
          positionStartDate,
          dayjs(toDate, DATE_FORMAT),
        );
        const prices: PricePoint[] = data.map((point) => ({
          date: point.timestamp,
          close: convertCurrency(currency, point.adjustedClosePrice ?? point.closePrice, point.timestamp),
        }));
        return { symbol, prices };
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
      const [benchmarkPrices, fetchedStockHistory] = await Promise.all([
        fetchBenchmarkHistory(positionStartDate, dayjs(toDate, DATE_FORMAT)),
        fetchPriceHistory(position.security.id, symbol, position.security.currency),
      ]);

      if (!fetchedStockHistory || fetchedStockHistory.prices.length === 0) {
        throw new Error('Failed to fetch stock price history');
      }
      if (!benchmarkPrices || benchmarkPrices.length === 0) {
        throw new Error('Failed to fetch benchmark data');
      }
      const fetchedBenchmarkHistory = { symbol: selectedBenchmark, prices: toPricePoints(benchmarkPrices) };

      setBenchmarkHistory(fetchedBenchmarkHistory);
      setStockHistory(fetchedStockHistory);

      // Create a temporary portfolio with just this position
      const priceHistoriesMap = new Map<string, PriceHistory>();
      priceHistoriesMap.set(symbol, fetchedStockHistory);

      // Use HealthCheckService for detailed analysis with currency conversion
      const service = new HealthCheckService({ benchmarkSymbol: selectedBenchmark }, currencies);
      const holdingReport = service.analyzeHolding(
        position,
        position.transactions || [],
        openTransactions,
        fetchedStockHistory,
        fetchedBenchmarkHistory,
        portfolioValue, // Use actual total portfolio value from context
      );

      setReport(holdingReport);
    } catch (err) {
      console.error('Error analyzing stock:', err);
      setError('Failed to analyze stock. Historical data may not be available.');
    } finally {
      setLoading(false);
    }
  }, [
    position,
    symbol,
    selectedBenchmark,
    positionStartDate,
    toDate,
    fetchPriceHistory,
    fetchBenchmarkHistory,
    currencies,
    portfolioValue,
    openTransactions,
  ]);

  useEffect(() => {
    analyzeStock();
  }, [analyzeStock]);

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
          title="Analysis Unavailable"
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
          <span>Historical analysis: {symbol}</span>
          {showBenchmarkSelector && <BenchmarkSelector analyticsEvent="stock-health-check-benchmark-change" />}
        </div>
      }
      extra={onClose && <CloseButton onClick={onClose} />}
    >
      <div className="mt-3" />
      {/* Opportunity Cost Comparison Chart */}
      {stockHistory && benchmarkHistory && position.transactions && (
        <OpportunityCostChart
          openTransactions={openTransactions}
          stockHistory={stockHistory}
          benchmarkHistory={benchmarkHistory}
          stockCurrency={position.security.currency}
        />
      )}

      <Typography.Paragraph type="secondary" className="!mx-4 !mb-4 text-sm">
        Historical metrics are diagnostic only. Use the validated portfolio return and active-contribution analysis
        before making a transition decision.
      </Typography.Paragraph>

      {/* Issues and Strengths */}
      {(report.flagDescriptions.length > 0 || report.strengthDescriptions.length > 0) && (
        <div
          className={`grid grid-cols-1 ${
            report.flagDescriptions.length > 0 && report.strengthDescriptions.length > 0 ? 'md:grid-cols-2' : ''
          }`}
        >
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

          {/* Strengths Found */}
          {report.strengthDescriptions.length > 0 && (
            <div className="p-4 bg-emerald-50 border border-emerald-200">
              <h3 className="text-sm font-semibold text-emerald-900 mb-3">Strengths Identified</h3>
              <div className="space-y-2">
                {report.strengthDescriptions.map((desc, index) => (
                  <div key={`strength-${desc}`} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-emerald-200 text-emerald-900 rounded-full text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="flex-1">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Health Check Metrics */}
      <HealthCheckMetrics report={report} position={position} />
    </Card>
  );
});
