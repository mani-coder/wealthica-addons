import { Table, type TableColumnProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { formatDate, getYahooSymbol } from '../../utils/common';
import Collapsible from '../Collapsible';
import type { Earning } from './types';

function getEarningsColumns(): TableColumnProps<Earning>[] {
  return [
    {
      key: 'date',
      title: 'Date',
      dataIndex: 'date',
      render: (text) => dayjs(text).format('MMM DD, YYYY'),
      defaultSortOrder: 'ascend',
      sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
    },
    {
      key: 'symbol',
      title: 'Symbol',
      dataIndex: 'ticker',
      render: (ticker, earning: Earning) => {
        const symbol = getYahooSymbol(earning.position.security);
        return (
          <a href={`https://finance.yahoo.com/quote/${symbol}`} target="_blank" rel="noopener noreferrer">
            {ticker}
          </a>
        );
      },
    },
    {
      key: 'periodEnding',
      title: 'Period Ending',
      dataIndex: 'periodEnding',
    },
    {
      key: 'lastEps',
      title: 'Last EPS',
      dataIndex: 'lastEps',
      align: 'right',
    },
    {
      key: 'eps',
      title: 'EPS',
      dataIndex: 'eps',
      align: 'right',
    },
  ];
}

type Props = {
  loading: boolean;
  earnings: Earning[];
  startDate?: Dayjs;
  endDate?: Dayjs;
};

export default function EarningsTable({ loading, earnings, startDate, endDate }: Props) {
  return (
    <Collapsible
      title={
        <div>
          <div className="flex flex-row items-center justify-between space-x-2">
            <div className="font-bold text-lg">Earnings</div>
            {startDate && endDate && (
              <div className="text-gray-500 font-semibold">
                {formatDate(startDate)} - {formatDate(endDate)}
              </div>
            )}
          </div>
        </div>
      }
      trackingLabel="earnings-table"
    >
      <Table<Earning>
        loading={loading}
        columns={getEarningsColumns()}
        dataSource={earnings}
        rowKey={(record) => `${record.ticker}-${record.date}`}
      />
    </Collapsible>
  );
}
