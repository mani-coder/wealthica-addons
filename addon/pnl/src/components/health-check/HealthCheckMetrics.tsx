/**
 * Health Check Metrics Component
 *
 * Displays performance metrics for individual stock health check analysis.
 * Shows key metrics with tooltips in a colored section layout.
 */

import { Collapse, List, type StatisticProps, Typography } from 'antd';
import dayjs from 'dayjs';
import { useAddonContext } from '../../context/AddonContext';
import { useBenchmark } from '../../context/BenchmarkContext';
import type { Position } from '../../types';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { formatMoney, formatMoneyWithCurrency } from '../../utils/common';
import { MetricsStatistics } from '../common/MetricsStatistics';

const { Title } = Typography;

// Metric descriptions for tooltips
const METRIC_DESCRIPTIONS = {
  return1Y: { title: '1Y Return', description: 'Total percentage return over the past 1 year' },
  return3Y: { title: '3Y Return', description: 'Total percentage return over the past 3 years' },
  return5Y: { title: '5Y Return', description: 'Total percentage return over the past 5 years' },
  returnSinceInception: { title: 'Overall Return', description: 'Total percentage return since the first purchase' },
  xirr: {
    title: 'XIRR',
    description: 'Extended Internal Rate of Return - annualized return accounting for timing of cash flows',
  },
  alpha: (context: { benchmark: string }) => ({
    title: `Alpha vs ${context.benchmark}`,
    description: `Performance difference compared to ${context.benchmark} benchmark. Positive means you're beating ${context.benchmark}, negative means ${context.benchmark} would have been better`,
  }),
  volatility: {
    title: 'Volatility',
    description: 'How much the stock price bounces around. Higher volatility means bigger swings up and down',
  },
  sharpeRatio: {
    title: 'Sharpe Ratio',
    description:
      'Risk-adjusted return score. Above 1 is good, above 2 is excellent. It shows if the returns justify the volatility',
  },
  maxDrawdown: {
    title: 'Max Drawdown',
    description:
      'The biggest peak-to-trough drop this stock experienced. Shows worst-case scenario if you bought at the top',
  },
  marketValue: { title: 'Market Value', description: 'Current market value of your position' },
  buyValue: { title: 'Cost Basis / Buy Value', description: 'Total amount you invested in this position' },
  daysUnderwater: {
    title: 'Days Underwater',
    description: 'Number of days your position has been below its cost basis / buy value',
  },
  weight: { title: 'Weight', description: 'Percentage of your total portfolio that this position represents' },
  holdingPeriod: { title: 'Holding Period', description: 'Number of days since the first purchase of this position' },
  opportunityCost: {
    title: 'Opportunity Cost',
    description: 'Amount you missed out on by not investing in the benchmark',
  },
  dividendYield: { title: 'Dividend Yield', description: 'Current dividend yield as a percentage of the stock price' },
  dividendGrowth3Y: {
    title: 'Dividend Growth 3Y',
    description: 'Average annual dividend growth over the past 3 years',
  },
  dividendTrend: {
    title: 'Dividend Trend',
    description:
      'Trend of dividend payments over time. Growing means dividends are increasing, flat means they are stable, declining means they are decreasing, and suspended means they are suspended',
  },
} as const;

interface Props {
  report: HoldingHealthReport;
  position: Position;
}

const MetricStats = (
  props: Omit<StatisticProps, 'title'> & { context?: { benchmark: string }; metric: keyof typeof METRIC_DESCRIPTIONS },
) => {
  const metric = METRIC_DESCRIPTIONS[props.metric];
  if (typeof metric === 'function' && props.context) {
    return (
      <MetricsStatistics {...props} title={metric(props.context).title} tooltip={metric(props.context).description} />
    );
  } else if (typeof metric === 'object') {
    return <MetricsStatistics {...props} title={metric.title} tooltip={metric.description} />;
  } else {
    <MetricsStatistics {...props} />;
  }
};

export function HealthCheckMetrics({ report, position }: Props) {
  const { isPrivateMode } = useAddonContext();
  const { benchmarkInfo } = useBenchmark();
  const metricDescriptions = Object.values(METRIC_DESCRIPTIONS).map((metric) => {
    if (typeof metric === 'function') {
      return metric({ benchmark: benchmarkInfo.name });
    } else {
      return metric;
    }
  });
  return (
    <>
      {/* Performance Metrics */}
      <div className="p-4 bg-purple-50 rounded">
        <Title level={5} className="mt-0">
          Performance Metrics
        </Title>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {!!report.metrics.return1Y && (
            <MetricStats
              metric="return1Y"
              value={`${report.metrics.return1Y.toFixed(1)}%`}
              styles={{ content: { color: report.metrics.return1Y >= 0 ? '#10b981' : '#ef4444' } }}
            />
          )}
          {!!report.metrics.return3Y && (
            <MetricStats
              metric="return3Y"
              value={`${report.metrics.return3Y.toFixed(1)}%`}
              styles={{ content: { color: report.metrics.return3Y >= 0 ? '#10b981' : '#ef4444' } }}
            />
          )}
          {!!report.metrics.return5Y && (
            <MetricStats
              metric="return5Y"
              value={`${report.metrics.return5Y.toFixed(1)}%`}
              styles={{ content: { color: report.metrics.return5Y >= 0 ? '#10b981' : '#ef4444' } }}
            />
          )}
          {!!report.metrics.returnSinceInception && (
            <MetricStats
              metric="returnSinceInception"
              value={`${report.metrics.returnSinceInception.toFixed(1)}%`}
              styles={{ content: { color: report.metrics.returnSinceInception >= 0 ? '#10b981' : '#ef4444' } }}
            />
          )}
          <MetricStats
            metric="xirr"
            value={`${report.metrics.xirr.toFixed(1)}%`}
            styles={{ content: { color: report.metrics.xirr >= 0 ? '#10b981' : '#ef4444' } }}
          />
          <MetricStats
            metric="alpha"
            context={{ benchmark: benchmarkInfo.name }}
            value={`${report.metrics.alphaSinceInception.toFixed(1)}%`}
            styles={{ content: { color: report.metrics.alphaSinceInception >= 0 ? '#10b981' : '#ef4444' } }}
          />
          {report.metrics.volatility > 0 && (
            <MetricStats metric="volatility" value={`${report.metrics.volatility.toFixed(2)}%`} />
          )}
          {report.metrics.sharpeRatio > 0 && (
            <MetricStats metric="sharpeRatio" value={report.metrics.sharpeRatio} precision={2} />
          )}
          {report.metrics.maxDrawdown > 0 && (
            <MetricStats metric="maxDrawdown" value={`${Math.abs(report.metrics.maxDrawdown).toFixed(1)}%`} />
          )}
          {report.metrics.opportunityCost > 0 && (
            <MetricStats metric="opportunityCost" value={formatMoney(report.metrics.opportunityCost)} />
          )}
          {report.metrics.dividendYield > 0 && (
            <>
              <MetricStats metric="dividendYield" value={`${report.metrics.dividendYield.toFixed(2)}%`} />
              <MetricStats
                metric="dividendGrowth3Y"
                value={`${report.metrics.dividendGrowth3Y.toFixed(1)}%`}
                precision={1}
              />
              <MetricStats metric="dividendTrend" value={report.metrics.dividendTrend} />
            </>
          )}
        </div>
      </div>

      {/* Position Details */}
      <div className="p-4 bg-emerald-50 rounded">
        <Title level={5} className="mt-0">
          Position Details
        </Title>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <MetricStats
            metric="marketValue"
            value={isPrivateMode ? '-' : formatMoneyWithCurrency(report.metrics.positionSize, position.currency)}
          />
          <MetricStats
            metric="buyValue"
            value={isPrivateMode ? '-' : formatMoneyWithCurrency(report.metrics.costBasis, position.currency)}
          />
          <MetricStats metric="weight" value={`${(report.metrics.portfolioWeight * 100).toFixed(1)}%`} />
          <MetricStats
            metric="daysUnderwater"
            value={`${report.metrics.daysUnderwater} days`}
            styles={{ content: { color: report.metrics.daysUnderwater > 365 ? '#ef4444' : undefined } }}
          />
          <MetricStats
            metric="holdingPeriod"
            value={dayjs.duration(report.metrics.holdingPeriodDays, 'days').humanize()}
          />
        </div>
      </div>

      {/* Understanding the Metrics */}
      <div className="w-full">
        <Collapse ghost>
          <Collapse.Panel key="1" header="Understanding the Metrics">
            <List
              size="small"
              dataSource={metricDescriptions}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text strong>{item.title}:</Typography.Text> {item.description}
                </List.Item>
              )}
            />
          </Collapse.Panel>
        </Collapse>
      </div>
    </>
  );
}
