import { Table, type TableColumnProps, Typography } from 'antd';
import React from 'react';
import useCurrency from '../../hooks/useCurrency';
import type { Account, AccountTransaction } from '../../types';
import { formatDate, formatMoney } from '../../utils/common';
import { startCase, sumBy } from '../../utils/lodash-replacements';
import Collapsible from '../Collapsible';
import { renderSymbol } from './utils';

export type IncomeTransaction = AccountTransaction & {
  symbol?: string;
  currency?: string;
};

const IncomeTable = React.memo(
  ({
    accountById,
    transactions,
    isPrivateMode,
  }: {
    accountById: { [K: string]: Account };
    transactions: IncomeTransaction[];
    isPrivateMode: boolean;
  }) => {
    const { baseCurrencyDisplay } = useCurrency();
    function getColumns(): TableColumnProps<IncomeTransaction>[] {
      return [
        {
          key: 'date',
          title: 'Date',
          dataIndex: 'date',
          render: (text) => formatDate(text),
          sorter: (a, b) => a.date.valueOf() - b.date.valueOf(),
          width: 125,
        },
        {
          key: 'account',
          title: 'Account',
          dataIndex: 'account',
          render: (account) => (accountById[account] ? accountById[account].name : 'N/A'),
          width: 200,
        },
        {
          key: 'symbol',
          title: 'Symbol',
          dataIndex: 'symbol',
          render: (text, transaction) => (transaction.symbol ? renderSymbol(text, transaction.currency) : '--'),
          width: 125,
          filters: Array.from(new Set(transactions.map((t) => t.symbol)))
            .filter((value) => !!value)
            .map((value) => ({
              text: value,
              value: value || '',
            }))
            .sort((a, b) => a.value.localeCompare(b.value)),
          onFilter: (value, transaction) => !!transaction.symbol && transaction.symbol.indexOf(value as any) === 0,
          sorter: (a, b) => (a.symbol || '--').localeCompare(b.symbol || '--'),
        },
        {
          key: 'type',
          title: 'Type',
          dataIndex: 'type',
          width: 125,
          render: (type) => <Typography.Text strong>{startCase(type || '-')}</Typography.Text>,
          filters: Array.from(new Set(transactions.map((t) => t.type))).map((value) => ({
            text: startCase(value),
            value: value,
          })),
          onFilter: (value, transaction) => transaction.type.indexOf(value as any) === 0,
        },
        {
          key: 'income',
          title: `Income (${baseCurrencyDisplay})`,
          dataIndex: 'amount',
          render: (amount) => (isPrivateMode ? '--' : <Typography.Text strong>${formatMoney(amount)}</Typography.Text>),
          align: 'right',
          sorter: (a, b) => a.amount - b.amount,
          width: 100,
        },
        {
          key: 'description',
          title: 'Description',
          dataIndex: 'description',
          ellipsis: true,
        },
      ];
    }

    return (
      <div className="mb-2">
        <Collapsible title="Income History" closed>
          <Table<IncomeTransaction>
            rowKey="id"
            scroll={{ y: 500 }}
            pagination={false}
            dataSource={transactions}
            columns={getColumns()}
            summary={(transactions) => {
              const total = sumBy(transactions, 'amount');
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ backgroundColor: '#f6ffed' }}>
                    <Table.Summary.Cell align="center" index={0} colSpan={4}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="center" index={1} colSpan={2}>
                      <Typography.Text strong style={{ color: '#52c41a' }}>
                        {formatMoney(total)} {baseCurrencyDisplay}
                      </Typography.Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Collapsible>
      </div>
    );
  },
);

export default IncomeTable;
