import { Collapse, List, Typography } from 'antd';
import React, { useMemo } from 'react';
import { trackEvent } from '../../analytics';
import useCurrency from '../../hooks/useCurrency';
import type { Portfolio } from '../../types';
import {
  calculateAlpha,
  calculateAverageRecoveryTime,
  calculateConsistencyScore,
  calculateCorrelation,
  calculateOpportunityCost,
  calculateRiskLevel,
} from '../../utils/benchmarkData';
import { formatMoney } from '../../utils/common';
import { MetricsStatistics } from '../common/MetricsStatistics';

// Metric descriptions used in tooltips and "Understanding the Metrics" section
export const METRIC_DESCRIPTIONS = {
  portfolioReturn: 'Time-weighted return after removing the effect of external deposits and withdrawals.',
  benchmarkReturn: 'Benchmark total return over the same dates when adjusted-close data is available.',
  alpha:
    "Measures your portfolio's excess return compared to the benchmark. Positive alpha means you're outperforming.",
  correlation: 'Pearson correlation of aligned daily portfolio and benchmark returns (ranges from -1 to 1).',
  consistencyScore:
    "Percentage of aligned trading days when the portfolio's daily return exceeded the benchmark's daily return.",
  recoveryTime: 'Average calendar days for completed drawdowns to recover their prior peak.',
  riskLevel:
    'How volatile your portfolio is compared to the market. Shown as "Lower Risk", "Similar Risk", or "Higher Risk" relative to the benchmark.',
  opportunityCost:
    'Actual ending value minus a benchmark counterfactual using the same opening value and external cash-flow dates.',
} as const;

type Props = {
  portfolioReturns: { date: string; value: number }[];
  benchmarkReturns: { date: string; value: number }[];
  portfolios: Portfolio[];
  benchmarkName: string;
  benchmarkReturnBasis: string;
};

function Metrics(props: Props) {
  const { portfolioReturns, benchmarkReturns, portfolios, benchmarkName, benchmarkReturnBasis } = props;
  const { baseCurrencyDisplay } = useCurrency();

  // Calculate metrics
  const alpha = useMemo(() => {
    return calculateAlpha(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  const correlation = useMemo(() => {
    return calculateCorrelation(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  const consistencyScore = useMemo(() => {
    return calculateConsistencyScore(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  const recoveryTime = useMemo(() => {
    return calculateAverageRecoveryTime(portfolioReturns);
  }, [portfolioReturns]);

  const riskLevel = useMemo(() => {
    return calculateRiskLevel(portfolioReturns, benchmarkReturns);
  }, [portfolioReturns, benchmarkReturns]);

  const opportunityCost = useMemo(() => {
    return calculateOpportunityCost(portfolios, benchmarkReturns);
  }, [benchmarkReturns, portfolios]);

  const portfolioFinalReturn = portfolioReturns.length > 0 ? portfolioReturns[portfolioReturns.length - 1].value : 0;
  const benchmarkFinalReturn = benchmarkReturns.length > 0 ? benchmarkReturns[benchmarkReturns.length - 1].value : 0;

  return (
    <div className="w-full mb-6">
      <div className="flex justify-between flex-wrap p-4 bg-purple-50">
        <MetricsStatistics
          title="Your Portfolio Return"
          tooltip={METRIC_DESCRIPTIONS.portfolioReturn}
          value={`${portfolioFinalReturn.toFixed(2)}%`}
          styles={{ content: { color: portfolioFinalReturn >= 0 ? '#10b981' : '#ef4444' } }}
        />
        <MetricsStatistics
          title={`${benchmarkName} Return`}
          tooltip={METRIC_DESCRIPTIONS.benchmarkReturn}
          value={`${benchmarkFinalReturn.toFixed(2)}%`}
          styles={{ content: { color: benchmarkFinalReturn >= 0 ? '#10b981' : '#ef4444' } }}
          suffix={<span className="text-xs text-gray-500 block mt-1">{benchmarkReturnBasis}</span>}
        />
        <MetricsStatistics
          title="Alpha (Outperformance)"
          tooltip={METRIC_DESCRIPTIONS.alpha}
          value={`${alpha.toFixed(2)}%`}
          styles={{ content: { color: alpha >= 0 ? '#10b981' : '#ef4444' } }}
          prefix={alpha >= 0 ? '+' : ''}
        />
        <MetricsStatistics
          title="Correlation"
          tooltip={METRIC_DESCRIPTIONS.correlation}
          value={correlation === null ? '—' : correlation.toFixed(3)}
          styles={{ content: { color: correlation === null ? '#6b7280' : '#3b82f6' } }}
        />
      </div>

      <div className="p-4 bg-emerald-50">
        <Typography.Title level={5} className="mt-0">
          Performance Insights
        </Typography.Title>
        <div className="flex justify-between flex-wrap gap-4">
          <MetricsStatistics
            title="Consistency Score"
            tooltip={METRIC_DESCRIPTIONS.consistencyScore}
            value={consistencyScore === null ? '—' : `${consistencyScore.toFixed(1)}%`}
            styles={{
              content: {
                color:
                  consistencyScore === null
                    ? '#6b7280'
                    : consistencyScore >= 60
                      ? '#10b981'
                      : consistencyScore >= 40
                        ? '#f59e0b'
                        : '#ef4444',
              },
            }}
            suffix={
              <span className="text-xs text-gray-500 block mt-1">
                {consistencyScore === null ? 'insufficient data' : `of days beating ${benchmarkName}`}
              </span>
            }
          />
          <MetricsStatistics
            title="Average Recovery Time"
            tooltip={METRIC_DESCRIPTIONS.recoveryTime}
            value={recoveryTime}
            styles={{ content: { color: recoveryTime <= 30 ? '#10b981' : recoveryTime <= 60 ? '#f59e0b' : '#ef4444' } }}
            suffix={<span className="text-xs text-gray-500 block mt-1">days to bounce back</span>}
          />
          <MetricsStatistics
            title="Risk Level"
            tooltip={METRIC_DESCRIPTIONS.riskLevel}
            value={riskLevel}
            styles={{
              content: {
                color:
                  riskLevel === 'Insufficient Data'
                    ? '#6b7280'
                    : riskLevel === 'Lower Risk'
                      ? '#10b981'
                      : riskLevel === 'Higher Risk'
                        ? '#ef4444'
                        : '#3b82f6',
              },
            }}
            suffix={<span className="text-xs text-gray-500 block mt-1">vs {benchmarkName}</span>}
          />
          <MetricsStatistics
            title="Ending Value Gap"
            tooltip={METRIC_DESCRIPTIONS.opportunityCost}
            value={
              opportunityCost === null
                ? '—'
                : `${opportunityCost >= 0 ? '+' : '-'}${baseCurrencyDisplay} ${formatMoney(Math.abs(opportunityCost))}`
            }
            styles={{
              content: { color: opportunityCost === null ? '#6b7280' : opportunityCost >= 0 ? '#10b981' : '#ef4444' },
            }}
            suffix={
              <span className="text-xs text-gray-500 block mt-1">
                {opportunityCost === null
                  ? 'insufficient data'
                  : `portfolio ended ${opportunityCost >= 0 ? 'above' : 'below'} ${benchmarkName}`}
              </span>
            }
          />
        </div>
      </div>

      <div className=" w-full">
        <Collapse
          ghost
          onChange={(keys) => {
            trackEvent('performance-metrics-info-toggle', {
              expanded: keys.includes('1'),
            });
          }}
        >
          <Collapse.Panel key="1" header="Understanding the Metrics">
            <List
              size="small"
              dataSource={[
                { title: 'Alpha', description: METRIC_DESCRIPTIONS.alpha },
                { title: 'Correlation', description: METRIC_DESCRIPTIONS.correlation },
                { title: 'Consistency Score', description: METRIC_DESCRIPTIONS.consistencyScore },
                { title: 'Recovery Time', description: METRIC_DESCRIPTIONS.recoveryTime },
                { title: 'Risk Level', description: METRIC_DESCRIPTIONS.riskLevel },
                { title: 'Opportunity Cost', description: METRIC_DESCRIPTIONS.opportunityCost },
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
    </div>
  );
}

export default React.memo(Metrics);
