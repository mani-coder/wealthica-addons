import Typography from 'antd/es/typography';
import Table, { ColumnProps } from 'antd/lib/table';
import _ from 'lodash';
import { Moment } from 'moment';
import 'moment-precise-range-plugin';
import React from 'react';
import { Account, AccountTransaction } from '../../types';
import { formatMoney } from '../../utils';
import Collapsible from '../Collapsible';
import PrintableTable from '../PrintableTable';
import { DATE_DISPLAY_FORMAT } from './utils';

const ExpenseTable = React.memo(
  ({
    accountById,
    transactions,
    isPrivateMode,
    fromDate,
    toDate,
  }: {
    accountById: { [K: string]: Account };
    transactions: AccountTransaction[];
    isPrivateMode: boolean;
    fromDate: Moment;
    toDate: Moment;
  }) => {
    function getColumns(): ColumnProps<AccountTransaction>[] {
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
          key: 'type',
          title: 'Type',
          dataIndex: 'type',
          render: (type) => <Typography.Text strong>{_.startCase(type)}</Typography.Text>,
          width: 100,
          filters: Array.from(new Set(transactions.map((t) => t.type))).map((value) => ({
            text: _.startCase(value),
            value: value,
          })),
          onFilter: (value, transaction) => transaction.type.indexOf(value as any) === 0,
        },
        {
          key: 'expense',
          title: 'Expense (CAD)',
          dataIndex: 'amount',
          render: (expense) =>
            isPrivateMode ? '--' : <Typography.Text strong>${formatMoney(expense)}</Typography.Text>,
          align: 'right',
          sorter: (a, b) => a.amount - b.amount,
          width: 150,
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
        <Collapsible title="Expenses History" closed>
          <PrintableTable<AccountTransaction>
            rowKey="id"
            dataSource={transactions}
            columns={getColumns()}
            printTitle={`Incurred Expenses For ${fromDate.format(DATE_DISPLAY_FORMAT)} - ${toDate.format(
              DATE_DISPLAY_FORMAT,
            )}`}
            summary={(transactions) => {
              const total = _.sumBy(transactions, 'amount');
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell align="right" index={0} colSpan={3}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="center" index={1} colSpan={1}>
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

export default ExpenseTable;
