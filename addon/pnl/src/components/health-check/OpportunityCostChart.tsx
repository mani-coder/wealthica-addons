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
import { formatDate } from '@/utils/common';
import { useAddonContext } from '../../context/AddonContext';
import useCurrency from '../../hooks/useCurrency';
import type { PriceHistory } from '../../services/healthCheckService';
import type { Transaction } from '../../types';
import type { BenchmarkType } from '../../utils/benchmarkData';
import { BENCHMARKS } from '../../utils/benchmarkData';
import { calculateOpenTransactions } from '../../utils/transactionUtils';
import { Charts } from '../Charts';

interface Props {
  transactions: Transaction[];
  stockHistory: PriceHistory;
  benchmarkHistory: PriceHistory;
  benchmark: BenchmarkType;
  stockCurrency: string; // Currency of the stock (e.g., "CAD", "USD")
}

interface TimelinePoint {
  date: Date;
  stockValue: number;
  benchmarkValue: number;
  stockPnl: number;
  benchmarkPnl: number;
}

export function OpportunityCostChart({
  transactions,
  stockHistory,
  benchmarkHistory,
  benchmark,
  stockCurrency,
}: Props) {
  const { isPrivateMode } = useAddonContext();
  const { currencies } = useCurrency();

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
    return calculateOpenTransactions(transactions, currencies);
  }, [transactions, currencies]);

  /**
   * Build timeline data comparing stock vs benchmark performance
   * OPTIMIZED: Pre-calculate transaction prices once, not for every timeline date
   */
  const timelineData = useMemo((): TimelinePoint[] => {
    if (openTransactions.length === 0) return [];

    // Find the earliest open transaction date
    const earliestDate = openTransactions.reduce(
      (earliest, tx) => {
        const txDate = new Date(tx.transaction.date.toDate());
        return !earliest || txDate < earliest ? txDate : earliest;
      },
      null as Date | null,
    );

    if (!earliestDate) return [];

    // PRE-CALCULATE: Get prices at transaction dates ONCE (not for every timeline date!)
    interface TransactionShares {
      txDate: Date;
      amount: number;
      stockShares: number;
      benchmarkShares: number;
    }

    const txShares: TransactionShares[] = openTransactions.map((openTx) => {
      const txDate = new Date(openTx.transaction.date.toDate());
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
      type: 'spline',
      id: 'stockSeries',
      name: `${stockHistory.symbol} P/L`,
      data: timelineData.map((point) => ({
        x: point.date.valueOf(),
        y: point.stockPnl,
        stockValue: point.stockValue,
        benchmarkValue: point.benchmarkValue,
      })),
      color: '#1890ff',
    };

    const benchmarkSeries: Highcharts.SeriesSplineOptions = {
      type: 'spline',
      id: 'benchmarkSeries',
      name: `${BENCHMARKS[benchmark].name} (${benchmark}) P/L`,
      data: timelineData.map((point) => ({
        x: point.date.valueOf(),
        y: point.benchmarkPnl,
        stockValue: point.stockValue,
        benchmarkValue: point.benchmarkValue,
      })),
      color: '#52c41a',
    };

    // Add buy transaction flags
    const buyFlags: Highcharts.SeriesFlagsOptions = {
      type: 'flags',
      name: 'Buys',
      shape: 'squarepin',
      onSeries: 'stockSeries',
      width: 25,
      color: '#1890ff',
      fillColor: '#1890ff',
      style: {
        color: 'white',
      },
      enableMouseTracking: false,
      data: openTransactions.map((t) => {
        return {
          x: t.transaction.date.toDate().getTime(),
          title: Math.round(t.shares).toLocaleString(),
          text: `Buy: ${t.shares.toFixed(0)}@$${t.transaction.price?.toFixed(2) || 0}`,
        };
      }),
    };

    return {
      chart: {
        height: 600,
      },
      rangeSelector: {
        enabled: true,
      },
      navigator: {
        enabled: true,
      },
      title: {
        text: `Opportunity Cost Analysis: ${stockHistory.symbol} vs ${BENCHMARKS[benchmark].name} (${benchmark})`,
        style: {
          fontSize: '16px',
          fontWeight: 'bold',
        },
      },
      subtitle: {
        text: 'Performance comparison if same amounts were invested in benchmark on same dates',
        style: {
          fontSize: '12px',
        },
      },

      yAxis: {
        title: {
          text: 'P/L (%)',
        },
        labels: {
          enabled: true,
          format: '{value}%',
        },
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
      legend: {
        enabled: true,
        align: 'center',
      },
      series: [stockSeries, benchmarkSeries, buyFlags],
    };
  }, [timelineData, stockHistory.symbol, benchmark, isPrivateMode, openTransactions]);

  if (timelineData.length === 0) {
    return null;
  }

  return (
    <div className="my-4">
      <Charts options={chartOptions} constructorType="stockChart" />
    </div>
  );
}
