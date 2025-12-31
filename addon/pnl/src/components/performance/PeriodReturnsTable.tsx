import { Table, Typography } from 'antd';
import React from 'react';
import type { PeriodReturn } from '../../utils/benchmarkData';

type Props = {
  periods: PeriodReturn[];
  periodType: 'yearly' | 'monthly';
  benchmarkName: string;
  benchmarkSymbol: string;
  isPrivateMode: boolean;
};

function PeriodReturnsTable(props: Props) {
  const { periods, periodType, benchmarkName, benchmarkSymbol, isPrivateMode } = props;

  if (periods.length === 0) return null;

  return (
    <div className="mt-6 bg-emerald-50 rounded">
      <Typography.Title level={5} className="pt-4 px-3">
        {periodType === 'yearly' ? 'Yearly' : 'Monthly'} Performance Breakdown
      </Typography.Title>
      <Table<PeriodReturn>
        dataSource={periods}
        rowKey="period"
        pagination={false}
        size="small"
        className="mt-4"
        rowClassName={(record) => (record.outperformed ? 'bg-green-50' : 'bg-red-50')}
        columns={[
          {
            title: 'Period',
            dataIndex: 'period',
            key: 'period',
            width: '20%',
            className: 'font-medium',
          },
          {
            title: 'Portfolio',
            dataIndex: 'portfolioReturn',
            key: 'portfolioReturn',
            width: '20%',
            align: 'right',
            render: (value: number) =>
              isPrivateMode ? (
                <span className="text-gray-500">-</span>
              ) : (
                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
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
              <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
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
            render: (value: number) =>
              isPrivateMode ? (
                <span className="text-gray-500">-</span>
              ) : (
                <span className={`font-semibold ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
                <span className="text-green-600 font-semibold">You</span>
              ) : (
                <span className="text-red-600 font-semibold">{benchmarkSymbol}</span>
              ),
          },
        ]}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row className="bg-gray-100 font-semibold">
              <Table.Summary.Cell index={0}>Summary</Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={3} align="right">
                {isPrivateMode
                  ? '-'
                  : `Outperformed in ${periods.filter((p) => p.outperformed).length} of ${periods.length} ${periodType === 'yearly' ? 'years' : 'months'}`}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="center">
                {((periods.filter((p) => p.outperformed).length / periods.length) * 100).toFixed(0)}%
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
}

export default React.memo(PeriodReturnsTable);
