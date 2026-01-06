import { Table, type TableColumnProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import useCurrency from '@/hooks/useCurrency';
import { formatDate, formatMoney, formatMoneyWithCurrency, getYahooSymbol, sumOf } from '../../utils/common';
import Collapsible from '../Collapsible';
import type { Dividend } from './types';

function getDividendsColumns(baseCurrencyDisplay: string): TableColumnProps<Dividend>[] {
  return [
    {
      key: 'date',
      title: 'Date',
      dataIndex: 'payDate',
      render: (text) => dayjs(text).format('MMM DD, YYYY'),
      defaultSortOrder: 'ascend',
      sorter: (a, b) => dayjs(a.payDate).valueOf() - dayjs(b.payDate).valueOf(),
    },
    {
      key: 'symbol',
      title: 'Symbol',
      dataIndex: 'ticker',
      render: (ticker, dividend: Dividend) => {
        const symbol = getYahooSymbol(dividend.position.security);
        return (
          <a
            href={`https://finance.yahoo.com/quote/${symbol}/history/?filter=div`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ticker}
          </a>
        );
      },
    },
    {
      key: 'amount',
      title: 'Amount/Share',
      dataIndex: 'amount',
      align: 'right',
      render: (amount, dividend: Dividend) =>
        amount > 0 ? formatMoneyWithCurrency(amount, dividend.position.security.currency) : '-',
    },
    {
      key: 'yield',
      title: 'Yield %',
      dataIndex: 'yield',
      align: 'right',
      render: (yieldVal) => (yieldVal > 0 ? `${yieldVal.toFixed(2)}%` : '-'),
    },
    {
      key: 'shares',
      title: 'Shares',
      dataIndex: 'position',
      align: 'right',
      render: (position) => position.quantity.toLocaleString(),
    },
    {
      key: 'estimatedIncome',
      title: `Est. Income (${baseCurrencyDisplay})`,
      dataIndex: 'estimatedIncome',
      align: 'right',
      render: (income) =>
        income && income > 0 ? <span className="font-semibold text-slate-800">${formatMoney(income)}</span> : '-',
    },
  ];
}

type Props = {
  loading: boolean;
  dividends: Dividend[];
  startDate?: Dayjs;
  endDate?: Dayjs;
};
export default function DividendsTable({ loading, dividends, endDate }: Props) {
  const startDate = dayjs().startOf('month');
  const { baseCurrencyDisplay } = useCurrency();
  const filteredDividends = dividends.filter(
    (d) => d.payDate && d.estimatedIncome && dayjs(d.payDate).isSameOrAfter(startDate),
  );
  const totalEstimatedIncome = useMemo(
    () => sumOf(...filteredDividends.map((d) => d.estimatedIncome || 0)),
    [filteredDividends],
  );

  return (
    <Collapsible
      title={
        <div>
          <div className="flex flex-row items-center justify-between space-x-2">
            <div className="font-bold text-lg">Dividends</div>
            {endDate && (
              <div className="text-gray-500 font-semibold">
                {formatDate(startDate)} - {formatDate(endDate)}
              </div>
            )}
            <div className="text-slate-800 font-semibold">
              Total Est. Income: {baseCurrencyDisplay} {formatMoney(totalEstimatedIncome)}
            </div>
          </div>
        </div>
      }
      trackingLabel="dividends-table"
    >
      <Table<Dividend>
        loading={loading}
        columns={getDividendsColumns(baseCurrencyDisplay)}
        dataSource={filteredDividends}
        rowKey={(record) => `${record.ticker}-${record.payDate} `}
      />
    </Collapsible>
  );
}
