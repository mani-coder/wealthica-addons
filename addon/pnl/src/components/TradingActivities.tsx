import { DatePicker, Space, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/lib/table';
import moment, { Moment } from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { Flex } from 'rebass';
import useCurrency from '../hooks/useCurrency';
import { Position, Transaction } from '../types';
import { formatMoney, getSymbol } from '../utils';
import { renderSymbol } from './realized-pnl/utils';

type Props = {
  fromDate: string;
  positions: Position[];
  transactions: Transaction[];
};

type Security = {
  symbol: string;
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
  const [fromDate, setFromDate] = useState<Moment>(moment(props.fromDate).startOf('D'));
  const { baseCurrencyDisplay, allCurrencies } = useCurrency();
  const symbolPriceCache = useMemo(() => {
    return props.positions.reduce((hash, position) => {
      hash[getSymbol(position.security)] = position.security.last_price;
      return hash;
    }, {});
  }, [props.positions]);

  const columns = useMemo(() => {
    const columns: ColumnsType<Security> = [
      {
        key: 'symbol',
        title: 'Symbol',
        dataIndex: 'symbol',
        render: (symbol, security) => renderSymbol(symbol),
        sorter: (a, b) => a.symbol.localeCompare(b.symbol),
      },
      {
        key: 'currency',
        title: 'Currency',
        dataIndex: 'currency',
        filters: allCurrencies.map((value) => ({ text: value.toUpperCase(), value: value.toLocaleLowerCase() })),
        onFilter: (value, security) => security.currency === value,
        render: (text, security) => security.currency.toLocaleUpperCase(),
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
        render: (value, security) => {
          const change = security.lastPrice - security.price;
          return security.lastPrice ? (
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
      .reduce((hash, transaction) => {
        const symbol = transaction.symbol;
        if (!hash[symbol]) {
          hash[symbol] = {
            symbol,
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
      .map((security) => ({ ...security, shares: Math.abs(security.shares), price: Math.abs(security.price) }))
      .sort((a, b) => b.value - a.value);
  }, [symbolPriceCache, props.transactions, fromDate]);

  const securities: Security[] = useMemo(() => getSecurities(), [getSecurities]);

  function renderTable(securities: Security[]) {
    return (
      <Table<Security>
        rowKey="symbol"
        size="large"
        bordered
        title={() => (
          <Flex justifyContent="space-between">
            <Typography.Title level={3}>Trading Activities</Typography.Title>
            <Space direction="horizontal">
              <Typography.Text strong type="secondary">
                Filter activities
              </Typography.Text>
              <DatePicker
                defaultValue={fromDate}
                value={fromDate}
                disabledDate={(date) => date.isAfter(moment())}
                size="large"
                onChange={(date) => setFromDate(date ?? moment(props.fromDate))}
              />
            </Space>
          </Flex>
        )}
        pagination={false}
        scroll={{ y: 500 }}
        dataSource={securities}
        columns={columns}
      />
    );
  }

  return <div className="zero-padding">{renderTable(securities)}</div>;
}
