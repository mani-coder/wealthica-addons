import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React from 'react';
import { trackEvent } from '../../analytics';
import { DATE_FORMAT } from '../../constants';
import type { PeriodReturn } from '../../utils/benchmarkData';

type Props = {
  periods: PeriodReturn[];
  benchmarkName: string;
  benchmarkSymbol: string;
  fromDate: string;
  toDate: string;
};

type MonthlyBreakdownTableProps = {
  monthlyData: PeriodReturn[];
  benchmarkSymbol: string;
  benchmarkName: string;
};

/**
 * Generate table columns for period returns
 * @param isNested - Whether this is a nested monthly breakdown table (affects styling)
 * @param benchmarkSymbol - Symbol to display for benchmark winner
 * @param benchmarkName - Name for benchmark column header (only used when not nested)
 */
function getPeriodColumns(
  isNested: boolean,
  benchmarkSymbol: string,
  benchmarkName: string,
): ColumnsType<PeriodReturn> {
  const textStyle = isNested ? 'text-sm' : '';
  const differenceClassName = isNested ? textStyle : 'font-semibold';
  const winnerClassName = isNested ? textStyle : 'font-semibold';

  return [
    {
      title: 'Period',
      dataIndex: 'period',
      key: 'period',
      width: '20%',
      className: 'text-sm',
    },
    {
      title: 'Portfolio',
      dataIndex: 'portfolioReturn',
      key: 'portfolioReturn',
      width: '20%',
      align: 'right',
      render: (value: number) => (
        <span className={`${textStyle} ${value >= 0 ? 'text-green-600' : 'text-red-600'}`.trim()}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}%
        </span>
      ),
    },
    {
      title: benchmarkName,
      dataIndex: 'benchmarkReturn',
      key: 'benchmarkReturn',
      width: '20%',
      align: 'right',
      render: (value: number) => (
        <span className={`${textStyle} ${value >= 0 ? 'text-green-600' : 'text-red-600'}`.trim()}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}%
        </span>
      ),
    },
    {
      title: 'Difference',
      dataIndex: 'difference',
      key: 'difference',
      width: '20%',
      align: 'right',
      render: (value: number) => (
        <span className={`${differenceClassName} ${value >= 0 ? 'text-green-600' : 'text-red-600'}`.trim()}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}%
        </span>
      ),
    },
    {
      title: 'Winner',
      dataIndex: 'outperformed',
      key: 'winner',
      width: '20%',
      align: 'center',
      render: (outperformed: boolean) =>
        outperformed ? (
          <span className={`text-green-600 ${winnerClassName}`.trim()}>You</span>
        ) : (
          <span className={`text-red-600 ${winnerClassName}`.trim()}>{benchmarkSymbol}</span>
        ),
    },
  ];
}

function MonthlyBreakdownTable({ monthlyData, benchmarkSymbol, benchmarkName }: MonthlyBreakdownTableProps) {
  return (
    <Table<PeriodReturn>
      dataSource={monthlyData}
      rowKey="period"
      pagination={false}
      size="small"
      showHeader={false}
      rowClassName={(record) => (record.outperformed ? 'bg-green-50' : 'bg-red-50')}
      columns={getPeriodColumns(true, benchmarkSymbol, benchmarkName)}
    />
  );
}

function PeriodReturnsTable(props: Props) {
  const { periods, benchmarkName, benchmarkSymbol, fromDate, toDate } = props;

  if (periods.length === 0) return null;

  const formattedFromDate = dayjs(fromDate, DATE_FORMAT).format('MMM D, YYYY');
  const formattedToDate = dayjs(toDate, DATE_FORMAT).format('MMM D, YYYY');

  // Check if we have nested data (children)
  const hasNestedData = periods.some((period) => period.children && period.children.length > 0);

  return (
    <Card
      className="mt-6 rounded-none"
      title="Yearly Performance Breakdown"
      extra={
        <Typography.Text className="text-gray-600 text-sm">
          {formattedFromDate} to {formattedToDate}
        </Typography.Text>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table<PeriodReturn>
        dataSource={periods}
        rowKey="period"
        pagination={false}
        size="small"
        rowClassName={(record) => (record.outperformed ? 'bg-green-50' : 'bg-red-50')}
        expandable={
          hasNestedData
            ? {
                childrenColumnName: '__none__',
                expandedRowRender: (record) => {
                  if (!record.children || record.children.length === 0) return null;
                  return (
                    <MonthlyBreakdownTable
                      monthlyData={record.children}
                      benchmarkSymbol={benchmarkSymbol}
                      benchmarkName={benchmarkName}
                    />
                  );
                },
                onExpand: (expanded, record) => {
                  trackEvent('performance-period-expand', {
                    expanded,
                    year: record.period,
                  });
                },
              }
            : undefined
        }
        columns={getPeriodColumns(false, benchmarkSymbol, benchmarkName)}
      />
    </Card>
  );
}

export default React.memo(PeriodReturnsTable);
