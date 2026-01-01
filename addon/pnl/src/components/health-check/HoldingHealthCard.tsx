/**
 * Holding Health Card Component
 *
 * Displays health information for a single holding with expandable details.
 */

import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { Card, Collapse, Progress, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { Position } from '../../types';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { SEVERITY_COLORS } from '../../types/healthCheck';
import { StockHealthCheck } from './StockHealthCheck';

const { Text, Title, Paragraph } = Typography;
const { Panel } = Collapse;

interface Props {
  report: HoldingHealthReport;
  position: Position;
}

export function HoldingHealthCard({ report, position }: Props) {
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

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

  function getSeverityIcon() {
    switch (report.severity) {
      case 'critical':
        return <ExclamationCircleOutlined style={{ color: SEVERITY_COLORS.critical }} />;
      case 'warning':
        return <WarningOutlined style={{ color: SEVERITY_COLORS.warning }} />;
      case 'info':
        return <InfoCircleOutlined style={{ color: SEVERITY_COLORS.info }} />;
      default:
        return <CheckCircleOutlined style={{ color: SEVERITY_COLORS.healthy }} />;
    }
  }

  return (
    <Card
      className="shadow-sm hover:shadow-md transition-shadow"
      styles={{
        body: {
          borderLeft: `4px solid ${getScoreColor(report.score)}`,
        },
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getSeverityIcon()}
          <div>
            <Title level={5} className="mb-0">
              {report.symbol}
            </Title>
            <Text type="secondary" className="text-sm">
              {report.name}
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <Text strong style={{ fontSize: 24, color: getScoreColor(report.score) }}>
              {report.score}
            </Text>
            <Text type="secondary" className="text-xs block">
              Health Score
            </Text>
          </div>

          <Tag color={getRecommendationColor(report.recommendation)} className="text-sm px-3 py-1">
            {report.recommendation}
          </Tag>
        </div>
      </div>

      <Progress
        percent={report.score}
        strokeColor={getScoreColor(report.score)}
        showInfo={false}
        size="small"
        className="mb-3"
      />

      {/* Issues */}
      {report.flagDescriptions.length > 0 && (
        <div className="mb-3">
          <Text strong className="text-sm">
            Issues Found:
          </Text>
          <ul className="list-none pl-0 mt-1 space-y-1">
            {report.flagDescriptions.map((desc) => (
              <li key={desc} className="text-sm">
                <WarningOutlined style={{ color: SEVERITY_COLORS.warning, marginRight: 8 }} />
                {desc}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunity Cost */}
      <div className="mb-3 p-3 bg-gray-50 rounded">
        <Text className="text-sm">{report.opportunityCostDescription}</Text>
        <Text type="secondary" className="text-xs block mt-1">
          * Simplified estimate. Expand for accurate calculation with historical data.
        </Text>
      </div>

      {/* Suggested Action */}
      <div className="mb-3">
        <Text strong className="text-sm">
          💡 Suggested Action:
        </Text>
        <Paragraph className="text-sm mt-1 mb-0">{report.suggestedAction}</Paragraph>
      </div>

      {/* Expandable Deep Analysis */}
      <div className="zero-padding">
        <Collapse
          ghost
          onChange={(keys) => {
            // Only load deep analysis when panel is expanded
            setShowDeepAnalysis(keys.length > 0);
          }}
        >
          <Panel header={<div className="text-sm font-medium">📊 View Deep Analysis with Historical Data</div>} key="1">
            {showDeepAnalysis && (
              <div className="-ml-2">
                {' '}
                <StockHealthCheck position={position} />
              </div>
            )}
          </Panel>
        </Collapse>
      </div>
    </Card>
  );
}
