/**
 * Health Check Metrics Component
 *
 * Displays performance metrics for individual stock health check analysis.
 * Shows key metrics with tooltips in a colored section layout.
 */

import { Collapse, List, Typography } from 'antd';
import { useAddonContext } from '../../context/AddonContext';
import type { Position } from '../../types';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { formatMoneyWithCurrency } from '../../utils/common';
import { MetricsStatistics } from '../common/MetricsStatistics';

const { Title, Text } = Typography;

// Metric descriptions for tooltips
const METRIC_DESCRIPTIONS = {
  return3Y: 'Total percentage return over the past 3 years',
  xirr: 'Extended Internal Rate of Return - annualized return accounting for timing of cash flows',
  alpha: (benchmark: string) =>
    `Performance difference compared to ${benchmark} benchmark. Positive means you're beating ${benchmark}, negative means ${benchmark} would have been better`,
  volatility: 'How much the stock price bounces around. Higher volatility means bigger swings up and down',
  sharpeRatio:
    'Risk-adjusted return score. Above 1 is good, above 2 is excellent. It shows if the returns justify the volatility',
  maxDrawdown:
    'The biggest peak-to-trough drop this stock experienced. Shows worst-case scenario if you bought at the top',
  marketValue: 'Current market value of your position',
  buyValue: 'Total amount you invested in this position',
  daysUnderwater: 'Number of days your position has been below its cost basis / buy value',
} as const;

interface Props {
  report: HoldingHealthReport;
  benchmark: string;
  position: Position;
}

export function HealthCheckMetrics({ report, benchmark, position }: Props) {
  const { isPrivateMode } = useAddonContext();
  return (
    <>
      {/* Performance Metrics */}
      <div className="p-4 bg-purple-50 rounded">
        <Title level={5} className="mt-0">
          Performance Metrics
        </Title>
        <div className="flex justify-between flex-wrap gap-4">
          <MetricsStatistics
            title="3Y Return"
            value={`${report.metrics.return3Y.toFixed(1)}%`}
            styles={{ content: { color: report.metrics.return3Y >= 0 ? '#10b981' : '#ef4444' } }}
            tooltip={METRIC_DESCRIPTIONS.return3Y}
          />
          <MetricsStatistics
            title="XIRR"
            value={`${report.metrics.xirr.toFixed(1)}%`}
            styles={{ content: { color: report.metrics.xirr >= 0 ? '#10b981' : '#ef4444' } }}
            tooltip={METRIC_DESCRIPTIONS.xirr}
          />
          <MetricsStatistics
            title={`Alpha vs ${benchmark}`}
            value={`${report.metrics.alpha3Y.toFixed(1)}%`}
            styles={{ content: { color: report.metrics.alpha3Y >= 0 ? '#10b981' : '#ef4444' } }}
            tooltip={METRIC_DESCRIPTIONS.alpha(benchmark)}
          />
          <MetricsStatistics
            title="Volatility"
            value={`${report.metrics.volatility.toFixed(1)}%`}
            tooltip={METRIC_DESCRIPTIONS.volatility}
          />
          <MetricsStatistics
            title="Sharpe Ratio"
            value={report.metrics.sharpeRatio}
            precision={2}
            tooltip={METRIC_DESCRIPTIONS.sharpeRatio}
          />
          <MetricsStatistics
            title="Max Drawdown"
            value={`${Math.abs(report.metrics.maxDrawdown).toFixed(1)}%`}
            tooltip={METRIC_DESCRIPTIONS.maxDrawdown}
          />
        </div>
      </div>

      {/* Position Details */}
      <div className="p-4 bg-emerald-50 rounded">
        <Title level={5} className="mt-0">
          Position Details
        </Title>
        <div className="flex justify-between flex-wrap gap-4">
          <MetricsStatistics
            title="Market Value"
            value={isPrivateMode ? '-' : formatMoneyWithCurrency(report.metrics.positionSize, position.currency)}
            tooltip={METRIC_DESCRIPTIONS.marketValue}
          />
          <MetricsStatistics
            title="Cost Basis / Buy Value"
            value={isPrivateMode ? '-' : formatMoneyWithCurrency(report.metrics.costBasis, position.currency)}
            tooltip={METRIC_DESCRIPTIONS.buyValue}
          />
          <MetricsStatistics
            title="Days Underwater"
            value={report.metrics.daysUnderwater}
            suffix=" days"
            styles={{ content: { color: report.metrics.daysUnderwater > 365 ? '#ef4444' : '#10b981' } }}
            tooltip={METRIC_DESCRIPTIONS.daysUnderwater}
          />
        </div>
      </div>

      {/* Understanding the Metrics */}
      <div className="w-full">
        <Collapse ghost>
          <Collapse.Panel key="1" header="Understanding the Metrics">
            <List
              size="small"
              dataSource={[
                { title: '3Y Return', description: METRIC_DESCRIPTIONS.return3Y },
                { title: 'XIRR', description: METRIC_DESCRIPTIONS.xirr },
                { title: `Alpha vs ${benchmark}`, description: METRIC_DESCRIPTIONS.alpha(benchmark) },
                { title: 'Volatility', description: METRIC_DESCRIPTIONS.volatility },
                { title: 'Sharpe Ratio', description: METRIC_DESCRIPTIONS.sharpeRatio },
                { title: 'Max Drawdown', description: METRIC_DESCRIPTIONS.maxDrawdown },
                { title: 'Market Value', description: METRIC_DESCRIPTIONS.marketValue },
                { title: 'Cost Basis / Buy Value', description: METRIC_DESCRIPTIONS.buyValue },
                { title: 'Days Underwater', description: METRIC_DESCRIPTIONS.daysUnderwater },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text strong>{item.title}:</Typography.Text> {item.description}
                </List.Item>
              )}
            />
          </Collapse.Panel>
        </Collapse>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200">
        <Text type="secondary" className="text-xs">
          Analysis based on 3-year historical data vs {benchmark}
        </Text>
      </div>
    </>
  );
}
