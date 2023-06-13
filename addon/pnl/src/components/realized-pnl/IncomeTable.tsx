import Typography from 'antd/es/typography';
import Table, { ColumnProps } from 'antd/lib/table';
import _ from 'lodash';
import 'moment-precise-range-plugin';
import React from 'react';
import { Account, AccountTransaction } from '../../types';
import { formatMoney } from '../../utils';
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
    function getColumns(): ColumnProps<IncomeTransaction>[] {
      return [
        {
          key: 'date',
          title: 'Date',
          dataIndex: 'date',
          render: (text) => text.format('YYYY-MM-DD'),
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
          width: 100,
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
          render: (type) => <Typography.Text strong>{_.startCase(type || '-')}</Typography.Text>,
          filters: Array.from(new Set(transactions.map((t) => t.type))).map((value) => ({
            text: _.startCase(value),
            value: value,
          })),
          onFilter: (value, transaction) => transaction.type.indexOf(value as any) === 0,
        },
        {
          key: 'income',
          title: 'Income (CAD)',
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
        },
      ];
    }

    return (
      <div className="zero-padding">
        <Collapsible title="Income History" closed>
          <Table<IncomeTransaction>
            rowKey="id"
            scroll={{ y: 500 }}
            pagination={false}
            dataSource={transactions.reverse()}
            columns={getColumns()}
            summary={(transactions) => {
              const total = _.sumBy(transactions, 'amount');
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell align="right" index={0} colSpan={4}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="center" index={1} colSpan={2}>
                      <Typography.Text strong>{formatMoney(total)} CAD</Typography.Text>
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
