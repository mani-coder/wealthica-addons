import { Table, TableColumnProps, Typography } from 'antd';
import { Dayjs } from 'dayjs';
import React from 'react';
import { startCase, sumBy } from '../../utils/lodash-replacements';
import { DATE_DISPLAY_FORMAT } from '../../constants';
import useCurrency from '../../hooks/useCurrency';
import { Account, AccountTransaction } from '../../types';
import { formatDate, formatMoney } from '../../utils/common';
import Collapsible from '../Collapsible';
import PrintableTable from '../PrintableTable';

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
    fromDate: Dayjs;
    toDate: Dayjs;
  }) => {
    const { baseCurrencyDisplay } = useCurrency();
    function getColumns(): TableColumnProps<AccountTransaction>[] {
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
          key: 'type',
          title: 'Type',
          dataIndex: 'type',
          render: (type) => <Typography.Text strong>{startCase(type)}</Typography.Text>,
          width: 100,
          filters: Array.from(new Set(transactions.map((t) => t.type))).map((value) => ({
            text: startCase(value),
            value: value,
          })),
          onFilter: (value, transaction) => transaction.type.indexOf(value as any) === 0,
        },
        {
          key: 'expense',
          title: `Expense (${baseCurrencyDisplay})`,
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
          ellipsis: true,
        },
      ];
    }

    return (
      <div className="zero-padding mb-2">
        <Collapsible title="Expenses History" closed>
          <PrintableTable<AccountTransaction>
            rowKey="id"
            dataSource={transactions}
            columns={getColumns()}
            printTitle={`Incurred Expenses For ${fromDate.format(DATE_DISPLAY_FORMAT)} - ${toDate.format(
              DATE_DISPLAY_FORMAT,
            )}`}
            summary={(transactions) => {
              const total = sumBy(transactions, 'amount');
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ backgroundColor: '#fff1f0' }}>
                    <Table.Summary.Cell align="center" index={0} colSpan={3}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="center" index={1} colSpan={2}>
                      <Typography.Text strong style={{ color: '#f5222d' }}>
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

export default ExpenseTable;
