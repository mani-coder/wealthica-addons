import { Collapse, List, Typography } from 'antd';
import React, { useMemo } from 'react';
import { trackEvent } from '../../analytics';
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
  portfolioReturn: 'Total percentage gain/loss of your portfolio over the selected time period.',
  benchmarkReturn: 'Total percentage gain/loss of the benchmark over the same time period.',
  alpha:
    "Measures your portfolio's excess return compared to the benchmark. Positive alpha means you're outperforming.",
  correlation:
    'Measures how closely your portfolio moves with the benchmark (ranges from -1 to 1). Higher correlation means your portfolio behaves similarly to the market.',
  consistencyScore:
    "Percentage of trading days your portfolio outperformed the benchmark. Higher % means you're beating the benchmark more often.",
  recoveryTime: 'Average number of days it takes for your portfolio to recover from a decline (shorter is better).',
  riskLevel:
    'How volatile your portfolio is compared to the market. Shown as "Lower Risk", "Similar Risk", or "Higher Risk" relative to the benchmark.',
  opportunityCost:
    'Dollar amount you gained or missed compared to investing in the benchmark instead. Shows whether you would have made more or less with the benchmark.',
} as const;

type Props = {
  portfolioReturns: { date: string; value: number }[];
  benchmarkReturns: { date: string; value: number }[];
  portfolios: { value: number }[];
  benchmarkName: string;
};

function Metrics(props: Props) {
  const { portfolioReturns, benchmarkReturns, portfolios, benchmarkName } = props;

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
    const initialValue = portfolios.length > 0 ? portfolios[0].value : 0;
    return calculateOpportunityCost(portfolioReturns, benchmarkReturns, initialValue);
  }, [portfolioReturns, benchmarkReturns, portfolios]);

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
          value={correlation.toFixed(3)}
          styles={{ content: { color: '#3b82f6' } }}
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
            value={`${consistencyScore.toFixed(1)}%`}
            styles={{
              content: { color: consistencyScore >= 60 ? '#10b981' : consistencyScore >= 40 ? '#f59e0b' : '#ef4444' },
            }}
            suffix={<span className="text-xs text-gray-500 block mt-1">of days beating {benchmarkName}</span>}
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
                color: riskLevel === 'Lower Risk' ? '#10b981' : riskLevel === 'Higher Risk' ? '#ef4444' : '#3b82f6',
              },
            }}
            suffix={<span className="text-xs text-gray-500 block mt-1">vs {benchmarkName}</span>}
          />
          <MetricsStatistics
            title="Opportunity Cost"
            tooltip={METRIC_DESCRIPTIONS.opportunityCost}
            value={`${opportunityCost >= 0 ? '+' : ''}$${formatMoney(opportunityCost)}`}
            styles={{ content: { color: opportunityCost >= 0 ? '#10b981' : '#ef4444' } }}
            suffix={
              <span className="text-xs text-gray-500 block mt-1">
                {opportunityCost >= 0 ? 'gained' : 'missed'} vs {benchmarkName}
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
