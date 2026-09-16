import { Button, Empty, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../../analytics';
import type { PortfolioReviewItem, PortfolioReviewReason } from '../../utils/portfolioHealth';
import { StockHealthCheck } from './StockHealthCheck';

interface HealthCardsProps {
  reports: PortfolioReviewItem[];
}

function reasonColor(reason: PortfolioReviewReason): string {
  if (reason.tone === 'error') return 'red';
  if (reason.tone === 'warning') return 'orange';
  return 'blue';
}

export const HealthCards: React.FC<HealthCardsProps> = ({ reports }) => {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  const expandedReport = reports.find((report) => report.symbol === expandedSymbol);

  useEffect(() => {
    if (!expandedSymbol || !expandedRef.current) return;
    const timeoutId = window.setTimeout(() => {
      expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }, 100);
    return () => window.clearTimeout(timeoutId);
  }, [expandedSymbol]);

  const openReport = (report: PortfolioReviewItem) => {
    setExpandedSymbol(report.symbol);
    trackEvent('health-row-expand', {
      dataComplete: report.dataComplete,
      reasonCount: report.reasons.length,
    });
  };

  const columns: ColumnsType<PortfolioReviewItem> = [
    {
      title: 'Holding',
      dataIndex: 'symbol',
      width: 120,
      fixed: 'left',
      sorter: (left, right) => left.symbol.localeCompare(right.symbol),
      render: (symbol: string) => <Typography.Text strong>{symbol}</Typography.Text>,
    },
    {
      title: 'Why it is listed',
      dataIndex: 'reasons',
      render: (reasons: PortfolioReviewReason[]) =>
        reasons.length === 0 ? (
          <Typography.Text type="secondary">No snapshot flags</Typography.Text>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((reason) => (
              <Tag key={`${reason.category}:${reason.label}`} color={reasonColor(reason)} title={reason.detail}>
                {reason.label}: {reason.detail}
              </Tag>
            ))}
          </div>
        ),
    },
    {
      title: 'Weight',
      dataIndex: 'portfolioWeight',
      width: 100,
      align: 'right',
      sorter: (left, right) => left.portfolioWeight - right.portfolioWeight,
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
    },
    {
      title: 'Return vs cost basis',
      dataIndex: 'returnVsCostBasis',
      width: 160,
      align: 'right',
      sorter: (left, right) => (left.returnVsCostBasis ?? 0) - (right.returnVsCostBasis ?? 0),
      render: (value: number | null) =>
        value === null ? (
          <Typography.Text type="secondary">Unavailable</Typography.Text>
        ) : (
          <Typography.Text type={value < 0 ? 'danger' : value > 0 ? 'success' : undefined}>
            {value > 0 ? '+' : ''}
            {value.toFixed(2)}%
          </Typography.Text>
        ),
    },
    {
      title: 'Snapshot data',
      dataIndex: 'dataComplete',
      width: 110,
      align: 'center',
      filters: [
        { text: 'Available', value: true },
        { text: 'Check data', value: false },
      ],
      onFilter: (value, record) => record.dataComplete === value,
      render: (complete: boolean) => (
        <Tag color={complete ? 'green' : 'red'}>{complete ? 'Available' : 'Check data'}</Tag>
      ),
    },
    {
      title: '',
      key: 'details',
      width: 92,
      align: 'right',
      render: (_value, report) => (
        <Button type="link" onClick={() => openReport(report)}>
          Details
        </Button>
      ),
    },
  ];

  if (reports.length === 0) {
    return <Empty className="border-t border-slate-200 py-10" description="No holdings match these filters" />;
  }

  return (
    <div className="border-t border-slate-200">
      {expandedReport && (
        <div ref={expandedRef} className="border-b border-slate-200">
          <StockHealthCheck position={expandedReport.position} showBenchmarkSelector={false} />
          <div className="border-t border-slate-100 py-2 text-center">
            <Button type="link" onClick={() => setExpandedSymbol(null)}>
              Collapse details
            </Button>
          </div>
        </div>
      )}
      <Table
        rowKey="symbol"
        columns={columns}
        dataSource={reports}
        size="small"
        scroll={{ x: 900 }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        onRow={(report) => ({
          onDoubleClick: () => openReport(report),
        })}
      />
    </div>
  );
};
