import { Card, Tag, Typography } from 'antd';
import type React from 'react';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { SEVERITY_COLORS } from '../../types/healthCheck';
import { StockHealthCheck } from './StockHealthCheck';

const { Text } = Typography;

interface HealthCardProps {
  report: HoldingHealthReport;
  expanded: boolean;
  onClick?: () => void;
}

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

export const HealthCard: React.FC<HealthCardProps> = ({ report, expanded, onClick }) => {
  if (expanded) {
    // Expanded view - just show StockHealthCheck with full details
    return (
      <Card
        hoverable={false}
        className="h-full"
        style={{
          borderLeft: `4px solid ${getScoreColor(report.score)}`,
        }}
        styles={{
          body: {
            padding: 0,
          },
        }}
      >
        <div>
          {/* StockHealthCheck has all the details */}
          <StockHealthCheck position={report.position} />

          {/* Click to collapse */}
          <div className="text-center py-4 border-t border-gray-100">
            <Text
              className="text-sm cursor-pointer text-blue-500 hover:text-blue-700"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
            >
              Collapse ▲
            </Text>
          </div>
        </div>
      </Card>
    );
  }

  // Tile view - simple: just score and recommendation
  return (
    <Card
      hoverable
      className="h-full"
      style={{
        borderTop: `3px solid ${getScoreColor(report.score)}`,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
      styles={{
        body: {
          padding: 16,
        },
      }}
      onClick={onClick}
    >
      <div className="flex flex-col justify-center space-y-2">
        {/* Symbol with icon and subtle score */}
        <div className="flex w-full justify-between gap-2 items-start">
          <Text strong className="text-lg truncate flex-1 min-w-0">
            {report.symbol}
          </Text>
          <Text
            className="text-sm font-medium px-2 py-1 rounded-lg flex-shrink-0"
            style={{
              backgroundColor: `${getScoreColor(report.score)}15`,
              color: getScoreColor(report.score),
            }}
          >
            {report.score}
          </Text>
        </div>

        {/* Company Name */}
        <Text type="secondary" className="text-xs text-start truncate">
          {report.name}
        </Text>

        {/* Recommendation Tag */}
        <Tag color={getRecommendationColor(report.recommendation)} className="text-sm text-center px-4 py-1">
          {report.recommendation}
        </Tag>
      </div>
    </Card>
  );
};
