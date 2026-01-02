/**
 * Opportunity Cost Comparison Chart
 *
 * Visualizes the performance comparison between actual stock holdings
 * and what the same investments would have returned in a benchmark.
 *
 * Shows two lines starting from the earliest open transaction:
 * 1. Stock P/L: Actual stock performance
 * 2. Benchmark P/L: What you would have if invested in benchmark on same dates
 */

import dayjs from 'dayjs';
import type * as Highcharts from 'highcharts';
import { useMemo } from 'react';
import { BENCHMARK_SERIES_OPTIONS, PORTFOLIO_SERIES_OPTIONS, TYPE_TO_COLOR } from '@/constants';
import { formatCurrency, formatDate, sumOf } from '@/utils/common';
import { useAddonContext } from '../../context/AddonContext';
import { useBenchmark } from '../../context/BenchmarkContext';
import useCurrency from '../../hooks/useCurrency';
import type { PriceHistory } from '../../services/healthCheckService';
import type { Transaction } from '../../types';
import { calculateOpenTransactions } from '../../utils/transactionUtils';
import { Charts } from '../Charts';

interface Props {
  transactions: Transaction[];
  stockHistory: PriceHistory;
  benchmarkHistory: PriceHistory;
  stockCurrency: string; // Currency of the stock (e.g., "CAD", "USD")
}

interface TimelinePoint {
  date: Date;
  stockValue: number;
  benchmarkValue: number;
  stockPnl: number;
  benchmarkPnl: number;
}

export function OpportunityCostChart({ transactions, stockHistory, benchmarkHistory, stockCurrency }: Props) {
  const { isPrivateMode } = useAddonContext();
  const { currencies } = useCurrency();
  const { benchmarkInfo } = useBenchmark();

  /**
   * Convert a date value to a Date object
   */
  function toDate(date: Date | dayjs.Dayjs | string | number): Date {
    if (date instanceof Date) {
      return date;
    }
    if (dayjs.isDayjs(date)) {
      return date.toDate();
    }
    return new Date(date);
  }

  /**
   * Helper to normalize date to YYYY-MM-DD format for hash map keys
   */
  function toDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Build a hash map of date -> price with gaps pre-filled using previous price
   * This makes lookups O(1) instead of O(n) and automatically handles missing dates
   */
  function buildPriceMap(prices: Array<{ date: Date | dayjs.Dayjs | string | number; close: number }>): {
    priceMap: Map<string, number>;
    dates: Date[];
  } {
    // Sort prices by date
    const sortedPrices = [...prices]
      .map((p) => ({ date: toDate(p.date), close: p.close }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sortedPrices.length === 0) {
      return { priceMap: new Map(), dates: [] };
    }

    const priceMap = new Map<string, number>();
    const dates: Date[] = [];

    // Get first and last dates
    const firstDate = sortedPrices[0].date;
    const lastDate = sortedPrices[sortedPrices.length - 1].date;

    // Build a map of existing prices
    const existingPrices = new Map<string, number>();
    for (const price of sortedPrices) {
      existingPrices.set(toDateKey(price.date), price.close);
    }

    // Fill in all dates from first to last, using previous price for gaps
    const currentDate = new Date(firstDate);
    let lastKnownPrice = sortedPrices[0].close;

    while (currentDate <= lastDate) {
      const dateKey = toDateKey(currentDate);
      const price = existingPrices.get(dateKey);

      if (price !== undefined) {
        lastKnownPrice = price;
      }

      priceMap.set(dateKey, lastKnownPrice);
      dates.push(new Date(currentDate));

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { priceMap, dates };
  }

  /**
   * Create price hash maps with gap-filling (memoized)
   */
  const stockPriceData = useMemo(() => {
    return buildPriceMap(stockHistory.prices);
  }, [stockHistory]);

  const benchmarkPriceData = useMemo(() => {
    return buildPriceMap(benchmarkHistory.prices);
  }, [benchmarkHistory]);

  /**
   * Get price on a specific date from hash map (O(1) lookup)
   */
  function getPriceOnDate(priceMap: Map<string, number>, date: Date): number {
    return priceMap.get(toDateKey(date)) || 0;
  }

  /**
   * Memoize open transactions separately with currency conversion
   */
  const openTransactions = useMemo(() => {
    const _openTransactions = calculateOpenTransactions(transactions, currencies);
    console.debug(
      `Open transactions for ${stockHistory.symbol}, openShares: ${sumOf(..._openTransactions.map((t) => t.shares))}`,
      _openTransactions.map((t) => ({ ...t, date: formatDate(t.date) })),
    );
    return _openTransactions;
  }, [transactions, currencies, stockHistory.symbol]);

  /**
   * Build timeline data comparing stock vs benchmark performance
   * OPTIMIZED: Pre-calculate transaction prices once, not for every timeline date
   */
  const timelineData = useMemo((): TimelinePoint[] => {
    if (openTransactions.length === 0) return [];

    // PRE-CALCULATE: Get prices at transaction dates ONCE (not for every timeline date!)
    interface TransactionShares {
      txDate: Date;
      amount: number;
      stockShares: number;
      benchmarkShares: number;
    }

    // Find the earliest open transaction date
    const earliestDate = openTransactions[0].date.toDate();
    const txShares: TransactionShares[] = openTransactions.map((openTx) => {
      const txDate = openTx.date.toDate();
      const benchmarkPriceAtTx = getPriceOnDate(benchmarkPriceData.priceMap, txDate);

      return {
        txDate,
        amount: openTx.amount,
        // Use the actual shares from OpenTransaction (accounts for splits and partial sells)
        stockShares: openTx.shares,
        // Calculate benchmark shares based on the cost basis
        benchmarkShares: benchmarkPriceAtTx > 0 ? openTx.amount / benchmarkPriceAtTx : 0,
      };
    });

    // Get all dates from stock price history, starting from earliest transaction
    const allDates = stockPriceData.dates.filter((date) => date >= earliestDate);

    if (allDates.length === 0) return [];

    // Build timeline with pre-calculated shares
    const timeline: TimelinePoint[] = [];

    for (const currentDate of allDates) {
      let stockValue = 0;
      let benchmarkValue = 0;
      let totalInvested = 0;

      // Get current prices ONCE per date (not per transaction!) - O(1) hash map lookup
      const stockPriceAtDate = getPriceOnDate(stockPriceData.priceMap, currentDate);
      const benchmarkPriceAtDate = getPriceOnDate(benchmarkPriceData.priceMap, currentDate);

      // Convert stock price to USD if needed
      const stockPriceInUSD = currencies.getValue(stockCurrency, stockPriceAtDate, dayjs(currentDate));

      // For each transaction, use pre-calculated shares
      for (const tx of txShares) {
        if (tx.txDate <= currentDate) {
          totalInvested += tx.amount;
          stockValue += tx.stockShares * stockPriceInUSD;
          benchmarkValue += tx.benchmarkShares * benchmarkPriceAtDate;
        }
      }

      if (totalInvested > 0) {
        const stockPnl = ((stockValue - totalInvested) / totalInvested) * 100;
        const benchmarkPnl = ((benchmarkValue - totalInvested) / totalInvested) * 100;

        timeline.push({
          date: currentDate,
          stockValue,
          benchmarkValue,
          stockPnl,
          benchmarkPnl,
        });
      }
    }

    return timeline;
  }, [openTransactions, stockPriceData, benchmarkPriceData]);

  const chartOptions = useMemo((): Highcharts.Options => {
    const stockSeries: Highcharts.SeriesSplineOptions = {
      ...PORTFOLIO_SERIES_OPTIONS,
      name: `${stockHistory.symbol} P/L`,
      data: timelineData.map((point) => ({
        x: point.date.valueOf(),
        y: point.stockPnl,
        stockValue: point.stockValue,
        benchmarkValue: point.benchmarkValue,
      })),
    };

    const benchmarkSeries: Highcharts.SeriesSplineOptions = {
      ...BENCHMARK_SERIES_OPTIONS,
      name: `${benchmarkInfo.name} P/L`,
      data: timelineData.map((point) => ({
        x: point.date.valueOf(),
        y: point.benchmarkPnl,
        stockValue: point.stockValue,
        benchmarkValue: point.benchmarkValue,
      })),
    };

    // Add buy transaction flags
    const buyFlags: Highcharts.SeriesFlagsOptions = {
      id: 'buys',
      name: 'Buy Amounts',
      type: 'flags',
      shape: 'squarepin',
      width: 50,
      color: TYPE_TO_COLOR.buy,
      fillColor: TYPE_TO_COLOR.buy,
      style: { color: 'white' },
      enableMouseTracking: false,
      data: openTransactions
        .filter((t) => t.amount > 0)
        .map((t) => {
          return {
            x: t.date.valueOf(),
            title: `$${formatCurrency(Math.round(t.amount), 1)}`,
          };
        }),
    };

    return {
      chart: { height: 600 },
      rangeSelector: { enabled: true, inputEnabled: true },
      navigator: { enabled: true },
      title: {
        text: `Opportunity Cost Analysis: ${stockHistory.symbol} vs ${benchmarkInfo.name}`,
        style: { fontSize: '16px', fontWeight: 'bold' },
      },
      subtitle: {
        text: 'Performance comparison if same amounts were invested in benchmark on same dates',
        style: { fontSize: '12px' },
      },

      yAxis: {
        title: { text: 'P/L (%)' },
        labels: { enabled: true, format: '{value}%' },
        opposite: false,
      },
      tooltip: {
        shared: true,
        useHTML: true,
        formatter() {
          const points = this.points || [];
          if (points.length === 0) return '';

          const date = formatDate(dayjs(this.x || 0));
          let html = `<b>${date}</b><br/>`;

          for (const point of points) {
            const pnl = point.y?.toFixed(2) || '0';
            // Use the correct value based on the series
            const isStockSeries = point.series.options.id === 'stockSeries';
            const value = isStockSeries ? (point.point as any).stockValue : (point.point as any).benchmarkValue;
            const valueFormatted = isPrivateMode
              ? '-'
              : `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

            html += `<span style="color:${point.color}">\u25CF</span> ${point.series.name}: <b>${pnl}%</b> (${valueFormatted})<br/>`;
          }

          return html;
        },
      },
      legend: { enabled: true, align: 'center' },
      series: [stockSeries, benchmarkSeries, buyFlags],
    };
  }, [timelineData, stockHistory.symbol, benchmarkInfo.name, isPrivateMode, openTransactions]);

  if (timelineData.length === 0) {
    return null;
  }

  return (
    <div className="my-4">
      <Charts options={chartOptions} constructorType="stockChart" />
    </div>
  );
}
