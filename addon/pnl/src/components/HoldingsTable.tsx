 
import { Table, TableColumnProps, Typography } from 'antd';
import React from 'react';

import useCurrency from '../hooks/useCurrency';
import { Position } from '../types';
import { formatMoney, getSymbol } from '../utils/common';
import Collapsible from './Collapsible';

type Props = {
  positions: Position[];
  isPrivateMode: boolean;
};

function HoldingsTable(props: Props) {
  const { baseCurrencyDisplay, allCurrencies } = useCurrency();
  const marketValue = props.positions.reduce((sum, position) => {
    return sum + position.market_value;
  }, 0);
  function getColumns(): TableColumnProps<Position>[] {
    return [
      {
        key: 'symbol',
        title: 'Symbol',
        dataIndex: 'security.name',
        render: (_text, position) => (
          <Typography.Link
            rel="noreferrer noopener"
            href={`https://finance.yahoo.com/quote/${getSymbol(position.security, true)}`}
            target="_blank"
          >
            {getSymbol(position.security)}
          </Typography.Link>
        ),
        ellipsis: true,
        width: 100,
        sorter: (a, b) => getSymbol(a.security).localeCompare(getSymbol(b.security)),
      },
      {
        key: 'currency',
        title: 'Currency',
        dataIndex: 'security.currency',
        filters: allCurrencies.map((value) => ({ text: value.toUpperCase(), value: value.toLocaleLowerCase() })),
        onFilter: (value, position) => position.security.currency === value,
        render: (_text, position) => position.security.currency.toLocaleUpperCase(),
        sorter: (a, b) => a.security.currency.localeCompare(b.security.currency),
        width: 125,
      },
      {
        key: 'lastPrice',
        title: 'Last Price',
        align: 'right',
        dataIndex: 'security.last_price',
        render: (_text, position) => (
          <>
            {formatMoney(position.security.last_price)}
            <div style={{ fontSize: 11 }}>{position.security.currency.toUpperCase()}</div>
          </>
        ),
        width: 150,
        sorter: (a, b) => a.security.last_price - b.security.last_price,
      },
      {
        key: 'shares',
        title: 'Shares',
        dataIndex: 'quantity',
        render: (text) => <Typography.Text strong>{formatMoney(text, 0)}</Typography.Text>,
        align: 'right',
        width: 100,
        sorter: (a, b) => a.quantity - b.quantity,
      },
      {
        key: 'buyPrice',
        title: 'Avg Cost / Share',
        dataIndex: 'quantity',
        render: (_text, position) => (
          <>
            <Typography.Text strong>
              {formatMoney(
                position.investments.reduce((cost, investment) => {
                  return cost + investment.book_value;
                }, 0) / position.quantity,
              )}{' '}
            </Typography.Text>
            <div style={{ fontSize: 11 }}>{position.security.currency.toUpperCase()}</div>
          </>
        ),
        align: 'right',
      },
      {
        key: 'gainPercent',
        title: (
          <>
            P/L %$<div style={{ fontSize: 12 }}>({baseCurrencyDisplay})</div>
          </>
        ),
        dataIndex: 'gain_percent',
        render: (_text, position) => (
          <div style={{ color: position.gain_percent < 0 ? 'red' : 'green' }}>
            <Typography.Text strong style={{ color: 'inherit', fontSize: 14 }}>
              {formatMoney(position.gain_percent * 100)}%
            </Typography.Text>
            <div />
            <Typography.Text style={{ color: 'inherit', fontSize: 13 }}>
              {formatMoney(position.gain_amount)}
            </Typography.Text>
          </div>
        ),
        align: 'right',
        sorter: (a, b) => a.gain_percent - b.gain_percent,
      },
      {
        key: 'XIRR',
        title: 'XIRR %',
        dataIndex: 'xirr',
        render: (_text, position) => (
          <div style={{ color: position.xirr < 0 ? 'red' : 'green' }}>
            <Typography.Text strong style={{ color: 'inherit', fontSize: 14 }}>
              {formatMoney(position.xirr * 100)}%
            </Typography.Text>
          </div>
        ),
        align: 'right',
        sorter: (a, b) => a.gain_percent - b.gain_percent,
      },
      {
        key: 'marketValue',
        title: (
          <>
            Market Value<div style={{ fontSize: 12 }}>$ {baseCurrencyDisplay}</div>
          </>
        ),
        dataIndex: 'market_value',
        render: (text) => (
          <>
            <Typography.Text strong>{props.isPrivateMode ? '-' : formatMoney(text)}</Typography.Text>
            <div style={{ fontSize: 13 }}>{text ? formatMoney((text / marketValue) * 100, 1) : 0}%</div>
          </>
        ),
        align: 'right',
        sorter: (a, b) => a.market_value - b.market_value,
      },
    ];
  }

  return (
    <div className="zero-padding mb-2">
      <Collapsible title="Holdings Table" closed>
        <Table<Position>
          rowKey={(row) => getSymbol(row.security)}
          scroll={{ y: 600 }}
          dataSource={props.positions}
          columns={getColumns()}
          pagination={false}
        />
      </Collapsible>
    </div>
  );
}

export default React.memo(HoldingsTable);
