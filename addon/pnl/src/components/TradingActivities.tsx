import { DatePicker, Space, Table, TableColumnsType, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import _ from 'lodash';
import { useCallback, useMemo, useState } from 'react';

import useCurrency from '../hooks/useCurrency';
import { Position, Transaction } from '../types';
import { formatMoney, getSymbol, sumOf } from '../utils/common';
import { renderSymbol } from './realized-pnl/utils';

type Props = {
  fromDate: string;
  positions: Position[];
  transactions: Transaction[];
};

type Security = {
  symbol: string;
  ticker: string;
  lastPrice: number;
  price: number;
  currency: string;
  value: number;
  currencyValue: number;
  shares: number;
  accounts: { [K: string]: number };
};
const TRANSACTION_TYPES = ['buy', 'sell'];

export default function TradingActivities(props: Props) {
  const [fromDate, setFromDate] = useState<Dayjs>(dayjs().startOf('month'));
  const { baseCurrencyDisplay, allCurrencies } = useCurrency();
  const symbolPriceCache = useMemo(() => {
    return props.positions.reduce((hash: { [key: string]: any }, position) => {
      hash[getSymbol(position.security)] = position.security.last_price;
      return hash;
    }, {});
  }, [props.positions]);

  const columns = useMemo(() => {
    const columns: TableColumnsType<Security> = [
      {
        key: 'symbol',
        title: 'Symbol',
        dataIndex: 'symbol',
        render: (symbol, security) => renderSymbol(symbol, undefined, security.ticker),
        sorter: (a, b) => a.symbol.localeCompare(b.symbol),
      },
      {
        key: 'currency',
        title: 'Currency',
        dataIndex: 'currency',
        filters: allCurrencies.map((value) => ({ text: value.toUpperCase(), value: value.toLocaleLowerCase() })),
        onFilter: (value, security) => security.currency === value,
        render: (_text, security) => security.currency.toLocaleUpperCase(),
        sorter: (a, b) => a.currency.localeCompare(b.currency),
      },
      {
        key: 'lastPrice',
        title: 'Last Price',
        dataIndex: 'lastPrice',
        render: (value) => formatMoney(value),
        align: 'right',
      },
      {
        key: 'price',
        title: 'Price',
        dataIndex: 'price',
        render: (value) => <Typography.Text strong>{formatMoney(value)}</Typography.Text>,
        align: 'right',
      },
      {
        key: 'shares',
        title: 'Shares',
        dataIndex: 'shares',
        render: (value) => <Typography.Text strong>{Math.round(value * 100) / 100}</Typography.Text>,
        sorter: (a, b) => a.shares - b.shares,
      },
      {
        key: 'value',
        title: `Amount (${baseCurrencyDisplay})`,
        dataIndex: 'value',
        render: (value) => formatMoney(value),
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.value - b.value,
        align: 'right',
      },
      {
        key: 'pnl',
        title: 'Change %',
        render: (_value, security) => {
          const change = security.lastPrice - security.price;
          return security.shares >= 0 && security.lastPrice ? (
            <Typography.Text strong style={{ color: change > 0 ? 'green' : 'red', fontSize: 14 }}>
              {formatMoney((change / security.lastPrice) * 100, 2)}%
            </Typography.Text>
          ) : (
            '-'
          );
        },
        align: 'right',
      },
    ];
    return columns;
  }, [baseCurrencyDisplay, allCurrencies]);

  const getSecurities = useCallback(() => {
    const securitiesCache = props.transactions
      .filter(
        (transaction) =>
          transaction.date.isSameOrAfter(fromDate) && TRANSACTION_TYPES.includes(transaction.originalType),
      )
      .reduce((hash: { [key: string]: any }, transaction) => {
        const symbol = transaction.symbol;
        if (!hash[symbol]) {
          hash[symbol] = {
            symbol,
            ticker: transaction.ticker,
            lastPrice: symbolPriceCache[symbol],
            price: transaction.currencyAmount / transaction.shares,
            currency: transaction.currency,
            value: transaction.amount,
            currencyValue: transaction.currencyAmount,
            shares: transaction.shares,
            accounts: { [transaction.account]: transaction.shares },
          };
          return hash;
        }

        const security = hash[symbol];
        security.shares = security.shares + transaction.shares;
        security.currencyValue =
          security.currencyValue + transaction.currencyAmount * (transaction.type === 'buy' ? 1 : -1);
        security.value = security.value + transaction.amount * (transaction.type === 'buy' ? 1 : -1);

        if (!security.accounts[transaction.account]) {
          security.accounts[transaction.account] = 0;
        }
        security.accounts[transaction.account] += transaction.shares;
        security.price = security.currencyValue / security.shares;

        return hash;
      }, {} as { [K: string]: Security });

    return Object.values(securitiesCache)
      .map((security) => ({ ...security, shares: security.shares, price: Math.abs(security.price) }))
      .sort((a, b) => b.value - a.value);
  }, [symbolPriceCache, props.transactions, fromDate]);

  const securities: Security[] = useMemo(() => getSecurities(), [getSecurities]);
  const presets = useMemo(() => {
    const dates = [
      dayjs().startOf('year'),
      ..._.range(6).map((num) => dayjs().subtract(num, 'month').startOf('month')),
    ].reduce((hash: { [key: string]: any }, date: Dayjs) => {
      hash[date.format("MMMM' YY")] = date;
      return hash;
    }, {} as { [K: string]: Dayjs });
    return Object.keys(dates)
      .map((label) => ({ label, value: dates[label] }))
      .sort((a, b) => (a.value.isSameOrAfter(b.value) ? -1 : 1));
  }, []);

  function renderTable(securities: Security[]) {
    return (
      <Table<Security>
        rowKey="symbol"
        size="large"
        bordered
        title={() => (
          <div className="flex justify-between">
            <Typography.Title level={3}>Trading Activities</Typography.Title>
            <Space direction="horizontal">
              <Typography.Text strong type="secondary">
                Filter activities
              </Typography.Text>
              <DatePicker
                defaultValue={fromDate}
                value={fromDate}
                disabledDate={(date) => date.isAfter(dayjs())}
                size="large"
                onChange={(date) => setFromDate(date ?? dayjs(props.fromDate))}
                presets={presets}
              />
            </Space>
          </div>
        )}
        pagination={false}
        scroll={{ y: 750 }}
        dataSource={securities}
        columns={columns}
        summary={(transactions) => {
          const total = sumOf(...transactions.map((t) => t.value));

          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  <Typography.Text strong>Total</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} colSpan={2} align="center">
                  <Typography.Text strong>
                    {formatMoney(total)} {baseCurrencyDisplay}
                  </Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    );
  }

  return <div className="zero-padding mb-2">{renderTable(securities)}</div>;
}
