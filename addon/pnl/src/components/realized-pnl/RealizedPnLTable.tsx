import QuestionCircleTwoTone from '@ant-design/icons/QuestionCircleTwoTone';
import { Table, TableColumnProps, TableColumnType, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import _ from 'lodash';
import React from 'react';
import { Box, Flex } from 'rebass';
import { DATE_DISPLAY_FORMAT } from '../../constants';
import useCurrency from '../../hooks/useCurrency';
import { Account, Transaction } from '../../types';
import { formatDate, formatMoney, formatMoneyWithCurrency } from '../../utils/common';
import Collapsible from '../Collapsible';
import PrintableTable from '../PrintableTable';
import { ClosedPosition, renderSymbol } from './utils';

const TransactionTable = ({ transactions }: { transactions: Transaction[] }) => {
  const columns: TableColumnType<Transaction>[] = [
    { key: 'date', title: 'Date', dataIndex: 'date', render: (text) => formatDate(dayjs(text)) },
    { key: 'type', title: 'Type', dataIndex: 'type', render: (text) => text.toUpperCase() },
    {
      key: 'shares',
      title: 'Shares',
      dataIndex: 'shares',
      render: (text, t) => `${Math.abs(t.shares)}@${formatMoney(t.price)}`,
    },
  ];

  return (
    <Flex width="450">
      <Table<Transaction>
        rowKey="id"
        bordered
        size="small"
        pagination={false}
        dataSource={transactions}
        columns={columns}
      />
    </Flex>
  );
};

const RealizedPnLTable = React.memo(
  ({
    closedPositions,
    isPrivateMode,
    fromDate,
    toDate,
  }: {
    closedPositions: ClosedPosition[];
    isPrivateMode: boolean;
    fromDate: Dayjs;
    toDate: Dayjs;
  }) => {
    const { baseCurrencyDisplay } = useCurrency();
    function getColumns(): TableColumnProps<ClosedPosition>[] {
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
          width: 150,
          render: (account: Account) => (account ? account.name : 'N/A'),
          filters: Array.from(
            new Set(closedPositions.map((position) => (position.account ? position.account.name : 'N/A'))),
          )
            .map((value) => ({
              text: value,
              value,
            }))
            .sort((a, b) => a.value.localeCompare(b.value)),
          onFilter: (value, position) => (position.account?.name || 'N/A').indexOf(value as any) === 0,
        },
        {
          key: 'symbol',
          title: 'Symbol',
          dataIndex: 'symbol',
          width: 100,
          render: (text, position) => renderSymbol(text, position.currency),
          filters: Array.from(new Set(closedPositions.map((position) => position.symbol)))
            .map((value) => ({
              text: value,
              value,
            }))
            .sort((a, b) => a.value.localeCompare(b.value)),
          onFilter: (value, position) => position.symbol.indexOf(value as any) === 0,
          sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
          key: 'shares',
          title: 'Shares',
          dataIndex: 'shares',
          align: 'right',
          width: 125,
          render: (text) => (isPrivateMode ? '-' : text.toLocaleString('en-US')),
        },
        {
          key: 'price',
          title: (
            <Box>
              <div>Buy Price /</div>
              <div>
                Sell Price{' '}
                <Tooltip title="This is the Adjusted Cost Base (ACB) which includes the buy/sell transaction fees.">
                  <QuestionCircleTwoTone twoToneColor="#bfbfbf" />
                </Tooltip>
              </div>
            </Box>
          ),
          align: 'center',
          width: 150,
          render: (text, position) => (
            <>
              {formatMoneyWithCurrency(position.buyPrice, position.currency)} /{' '}
              <span style={{ whiteSpace: 'nowrap' }}>{formatMoney(position.sellPrice)}</span>
            </>
          ),
        },
        {
          key: 'cost',
          title: (
            <Box>
              <div>ACB /</div>
              <div>Proceeds </div>
              <Typography.Text style={{ fontSize: 12 }}>({baseCurrencyDisplay})</Typography.Text>{' '}
              <Tooltip title="This is the Adjusted Cost Base (ACB) which includes the buy/sell transaction fees.">
                <QuestionCircleTwoTone twoToneColor="#bfbfbf" />
              </Tooltip>
            </Box>
          ),
          align: 'right',
          render: (text, position) => {
            return (
              <>
                {formatMoney(position.buyCost)} / {formatMoney(position.sellCost)}
              </>
            );
          },
        },
        {
          key: 'gain',
          title: (
            <>
              P&L $%<div style={{ fontSize: 12 }}>({baseCurrencyDisplay})</div>
            </>
          ),
          render: (text, position) => {
            return (
              <Box style={{ color: position.pnl < 0 ? 'red' : 'green' }}>
                <Typography.Text strong style={{ color: 'inherit', fontSize: 14 }}>
                  {isPrivateMode ? '-' : formatMoney(position.pnl)}
                </Typography.Text>
                <Box />
                <Typography.Text style={{ color: 'inherit', fontSize: 13 }}>
                  {formatMoney(position.pnlRatio)}%
                </Typography.Text>
              </Box>
            );
          },
          align: 'right',
          sorter: (a, b) => a.pnlRatio - b.pnlRatio,
        },
        {
          key: 'holding-period',
          title: (
            <>
              <div>Open Date</div>
              <Typography.Text style={{ color: '#8c8c8c' }}>Holding Period</Typography.Text>
            </>
          ),
          render: (text, position) => (
            <>
              <div>
                <Typography.Text>
                  {formatDate(position.buyDate.isAfter(position.sellDate) ? position.sellDate : position.buyDate)}
                </Typography.Text>
              </div>
              <Typography.Text style={{ color: '#8c8c8c', fontWeight: 'bold' }}>
                {position.buyDate.diff(position.sellDate)
                  ? dayjs.duration(position.buyDate.diff(position.sellDate)).humanize()
                  : 'Same Day'}
              </Typography.Text>
            </>
          ),
        },
      ];
    }

    return (
      <div className="zero-padding">
        <Collapsible title="Realized P&L History" closed>
          <PrintableTable<ClosedPosition>
            printTitle={`Realized Gain/Loss For ${fromDate.format(DATE_DISPLAY_FORMAT)} - ${toDate.format(
              DATE_DISPLAY_FORMAT,
            )}`}
            rowKey="key"
            expandable={{
              expandedRowRender: (record) => <TransactionTable transactions={record.transactions} />,
              rowExpandable: (record) => !!record.symbol,
              defaultExpandAllRows: false,
              indentSize: 0,
            }}
            scroll={{ y: 500 }}
            pagination={false}
            dataSource={closedPositions}
            summary={(positions) => {
              const totalPnL = _.sumBy(positions, 'pnl');
              const totalBuyCost = _.sumBy(positions, 'buyCost');
              const totalSellCost = _.sumBy(positions, 'sellCost');

              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ backgroundColor: '#fff0f6' }}>
                    <Table.Summary.Cell align="center" index={0} colSpan={4}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="center" index={1} colSpan={2}>
                      <Typography.Text strong>{formatMoney(totalBuyCost)}</Typography.Text> /{' '}
                      <Typography.Text strong>{formatMoney(totalSellCost)}</Typography.Text>
                    </Table.Summary.Cell>

                    <Table.Summary.Cell index={1} colSpan={3} align="center">
                      <Typography.Text strong style={{ color: totalPnL > 0 ? 'green' : 'red' }}>
                        {formatMoney(totalPnL)} {baseCurrencyDisplay}
                      </Typography.Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
            columns={getColumns()}
          />
        </Collapsible>
      </div>
    );
  },
);

export default RealizedPnLTable;
