import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import QuestionCircleTwoTone from '@ant-design/icons/QuestionCircleTwoTone';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import Checkbox from 'antd/lib/checkbox';
import Empty from 'antd/lib/empty';
import Radio from 'antd/lib/radio';
import Statistic from 'antd/lib/statistic';
import Table, { ColumnProps, ColumnType } from 'antd/lib/table';
import * as Highcharts from 'highcharts';
import _ from 'lodash';
import moment, { Moment } from 'moment';
import 'moment-precise-range-plugin';
import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex } from 'rebass';
import { trackEvent } from '../analytics';
import { DATE_FORMAT } from '../constants';
import { Account, AccountTransaction, Transaction } from '../types';
import { formatCurrency, formatMoney, formatMoneyWithCurrency, getCurrencyInCAD } from '../utils';
import { Charts } from './Charts';
import Collapsible from './Collapsible';
import CompositionGroup, { getGroupKey, GroupType } from './CompositionGroup';
import PrintableTable from './PrintableTable';

type Props = {
  transactions: Transaction[];
  accountTransactions: AccountTransaction[];
  accounts: Account[];
  isPrivateMode: boolean;
  fromDate: string;
  toDate: string;
  currencyCache: { [K: string]: number };
};

type IncomeTransaction = AccountTransaction & {
  symbol?: string;
  currency?: string;
};

type ClosedPosition = {
  key: string;
  date: Moment;
  symbol: string;
  currency: string;
  crypto: boolean;
  shares: number;

  buyDate: Moment;
  buyPrice: number;
  sellDate: Moment;
  sellPrice: number;

  buyCost: number;
  sellCost: number;
  pnl: number;
  pnlRatio: number;
  account?: Account;
  transactions: Transaction[];
};

type CurrentPosition = {
  shares: number;
  price: number;
  date: Moment;
  transactions: Transaction[];
};

const DATE_DISPLAY_FORMAT = 'MMM DD, YYYY';

function renderSymbol(symbol: string, currency?: string) {
  return (
    <>
      <Typography.Link rel="noreferrer noopener" href={`https://finance.yahoo.com/quote/${symbol}`} target="_blank">
        {symbol}
      </Typography.Link>
      {currency && <div style={{ fontSize: 10 }}>{currency === 'usd' ? 'USD' : 'CAD'}</div>}
    </>
  );
}

const TransactionTable = ({ transactions }: { transactions: Transaction[] }) => {
  const columns: ColumnType<Transaction>[] = [
    { key: 'date', title: 'Date', dataIndex: 'date', render: (text) => moment(text).format('YYYY-MM-DD') },
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
    fromDate: Moment;
    toDate: Moment;
  }) => {
    function getColumns(): ColumnProps<ClosedPosition>[] {
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
          render: (text, position) => renderSymbol(text, position.currency),
          width: 125,
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
          render: (text) => (isPrivateMode ? '-' : text.toLocaleString('en-US')),
          width: 75,
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
          width: 150,
          title: (
            <Box>
              <div>ACB /</div>
              <div>Proceeds </div>
              <Typography.Text style={{ fontSize: 12 }}>(CAD)</Typography.Text>{' '}
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
          width: 125,
          title: (
            <>
              P&L $%<div style={{ fontSize: 12 }}>(CAD)</div>
            </>
          ),
          render: (text, position) => (
            <Box style={{ color: position.pnl < 0 ? 'red' : 'green' }}>
              <Typography.Text strong style={{ color: 'inherit', fontSize: 14 }}>
                {isPrivateMode ? '-' : formatMoney(position.pnl)}
              </Typography.Text>
              <Box />
              <Typography.Text style={{ color: 'inherit', fontSize: 13 }}>
                {formatMoney(position.pnlRatio)}%
              </Typography.Text>
            </Box>
          ),
          align: 'right',
          sorter: (a, b) => a.pnlRatio - b.pnlRatio,
        },
        {
          key: 'holding-period',
          width: 150,
          title: (
            <>
              <div>Open Date</div>
              <div>Holding Period</div>
            </>
          ),
          render: (text, position) => (
            <>
              <div>
                {(position.buyDate.isAfter(position.sellDate) ? position.sellDate : position.buyDate).format(
                  'YYYY-MM-DD',
                )}
              </div>
              <div>
                {position.buyDate.diff(position.sellDate)
                  ? moment.duration(position.buyDate.diff(position.sellDate)).humanize()
                  : 'Same Day'}
              </div>
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
            pagination={{ pageSize: 5, responsive: true, position: ['bottomCenter'] }}
            dataSource={closedPositions}
            summary={(positions) => {
              const totalPnL = _.sumBy(positions, 'pnl');
              const totalBuyCost = _.sumBy(positions, 'buyCost');
              const totalSellCost = _.sumBy(positions, 'sellCost');

              return (
                <>
                  <Table.Summary.Row>
                    <Table.Summary.Cell align="right" index={0} colSpan={6}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="right" index={1}>
                      <Typography.Text>{formatMoney(totalBuyCost)}</Typography.Text> /
                      <Typography.Text>{formatMoney(totalSellCost)}</Typography.Text>
                    </Table.Summary.Cell>

                    <Table.Summary.Cell index={1} colSpan={2} align="center">
                      <Typography.Text strong style={{ color: totalPnL > 0 ? 'green' : 'red' }}>
                        {formatMoney(totalPnL)} CAD
                      </Typography.Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </>
              );
            }}
            columns={getColumns()}
          />
        </Collapsible>
      </div>
    );
  },
);

const ExpensesTable = React.memo(
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
          width: 150,
        },
        {
          key: 'account',
          title: 'Account',
          dataIndex: 'account',
          render: (account) => (accountById[account] ? accountById[account].name : 'N/A'),
          width: 250,
        },
        {
          key: 'type',
          title: 'Type',
          dataIndex: 'type',
          render: (type) => <Typography.Text strong>{_.startCase(type || '-')}</Typography.Text>,
        },
        {
          key: 'expense',
          title: 'Expense (CAD)',
          dataIndex: 'amount',
          render: (expense) =>
            isPrivateMode ? '--' : <Typography.Text strong>${formatMoney(expense)}</Typography.Text>,
          align: 'right',
          sorter: (a, b) => a.amount - b.amount,
          width: 200,
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
            pagination={{ pageSize: 5, responsive: true, position: ['bottomCenter'] }}
            dataSource={transactions.reverse()}
            columns={getColumns()}
            printTitle={`Incurred Expenses For ${fromDate.format(DATE_DISPLAY_FORMAT)} - ${toDate.format(
              DATE_DISPLAY_FORMAT,
            )}`}
            summary={(transactions) => {
              const total = _.sumBy(transactions, 'amount');

              return (
                <>
                  <Table.Summary.Row>
                    <Table.Summary.Cell align="right" index={0} colSpan={3}>
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2}>
                      <Typography.Text strong>{formatMoney(total)} CAD</Typography.Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </>
              );
            }}
          />
        </Collapsible>
      </div>
    );
  },
);

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
          width: 150,
        },
        {
          key: 'account',
          title: 'Account',
          dataIndex: 'account',
          render: (account) => (accountById[account] ? accountById[account].name : 'N/A'),
          width: 250,
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
          render: (type) => <Typography.Text strong>{_.startCase(type || '-')}</Typography.Text>,
        },
        {
          key: 'income',
          title: 'Income (CAD)',
          dataIndex: 'amount',
          render: (amount) => (isPrivateMode ? '--' : <Typography.Text strong>${formatMoney(amount)}</Typography.Text>),
          align: 'right',
          sorter: (a, b) => a.amount - b.amount,
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
            pagination={{ pageSize: 5, responsive: true, position: ['bottomCenter'] }}
            dataSource={transactions.reverse()}
            columns={getColumns()}
          />
        </Collapsible>
      </div>
    );
  },
);

type TransactionType = 'income' | 'pnl' | 'expense';

export default function RealizedPnL({ currencyCache, accounts, isPrivateMode, ...props }: Props) {
  const [timeline, setTimeline] = useState<'month' | 'year' | 'week' | 'day'>('year');

  const { transactions, accountTransactions, fromDate, toDate } = useMemo(() => {
    const fromDate = moment(props.fromDate);
    const toDate = moment(props.toDate);
    return {
      transactions: props.transactions.filter((t) => t.date.isSameOrAfter(fromDate) && t.date.isSameOrBefore(toDate)),
      accountTransactions: props.accountTransactions.filter(
        (t) => t.date.isSameOrAfter(fromDate) && t.date.isSameOrBefore(toDate),
      ),
      fromDate,
      toDate,
    };
  }, [props.transactions, props.fromDate, props.toDate, props.accountTransactions]);

  const { expenseTransactions, totalExpense } = useMemo(() => {
    const expenseTransactions = accountTransactions
      .filter((transaction) => ['interest', 'fee', 'tax'].includes(transaction.type) && transaction.amount < 0)
      .map((transaction) => ({ ...transaction, amount: Math.abs(transaction.amount) }));

    return {
      expenseTransactions,
      totalExpense: expenseTransactions.reduce((expense, t) => expense + t.amount, 0),
    };
  }, [accountTransactions]);

  const { incomeTransactions, totalIncome } = useMemo(() => {
    const incomeTransactions: IncomeTransaction[] = accountTransactions
      .filter(
        (transaction) => ['income', 'interest', 'fee', 'tax'].includes(transaction.type) && transaction.amount > 0,
      )
      .concat(transactions.filter((transaction) => ['income', 'dividend', 'distribution'].includes(transaction.type)))
      .sort((a, b) => a.date.unix() - b.date.unix());

    return {
      incomeTransactions,
      totalIncome: incomeTransactions.reduce((expense, t) => expense + t.amount, 0),
    };
  }, [accountTransactions, transactions]);

  const [compositionGroup, setCompositionGroup] = useState<GroupType>('type');

  const accountById = useMemo(() => {
    return accounts.reduce((hash, account) => {
      hash[account.id] = account;
      return hash;
    }, {} as { [K: string]: Account });
  }, [accounts]);

  const closedPositions = useMemo(() => {
    function closePosition(position: CurrentPosition, transaction: Transaction) {
      position.transactions.push(transaction);

      const closedShares = Math.min(Math.abs(position.shares), Math.abs(transaction.shares));
      const buyRecord = transaction.type === 'buy' ? transaction : position;
      const sellRecord = transaction.type === 'sell' ? transaction : position;

      const crypto = transaction.securityType === 'crypto';

      const isUSD = transaction.currency === 'usd' && !crypto;
      const buyValue = closedShares * buyRecord.price;
      const sellValue = closedShares * sellRecord.price;

      const buyCost = isUSD ? getCurrencyInCAD(buyRecord.date, buyValue, currencyCache) : buyValue;
      const sellCost = isUSD ? getCurrencyInCAD(sellRecord.date, sellValue, currencyCache) : sellValue;

      const pnl = sellCost - buyCost;
      const pnlRatio = (pnl / buyCost) * 100;

      const closedPosition: ClosedPosition = {
        key: transaction.id,
        date: transaction.date,
        account: accountById[transaction.account],
        symbol: transaction.symbol,
        currency: transaction.currency,

        shares: closedShares,

        buyDate: buyRecord.date,
        buyPrice: buyRecord.price,

        sellDate: sellRecord.date,
        sellPrice: sellRecord.price,

        transactions: position.transactions.slice(),

        buyCost,
        sellCost,
        pnl,
        crypto,
        pnlRatio,
      };

      const openShares = position.shares + transaction.shares;
      position.shares = openShares;

      if (openShares > 0) {
        position.price = buyRecord.price;
        position.date = buyRecord.date;
      } else if (openShares < 0) {
        position.price = sellRecord.price;
        position.date = sellRecord.date;
      } else {
        position.price = 0;
        position.transactions = [];
      }

      return closedPosition;
    }

    function openPosition(position: CurrentPosition, transaction: Transaction) {
      const shares = position.shares + transaction.shares;
      if (position.shares === 0) {
        position.date = transaction.date;
      }
      position.price = (position.price * position.shares + transaction.price * transaction.shares) / shares;
      position.shares = shares;
      position.transactions.push(transaction);
    }

    function handleSplit(position: CurrentPosition, transaction: Transaction) {
      // there are two type of split transactions, one negates the full book and one adds the new shares.
      // we are interested in the first one.
      if (transaction.shares > 0) {
        return;
      }

      const splitRatio = transaction.splitRatio || 1;
      const shares = Math.floor(position.shares / splitRatio);
      position.shares = shares;
      position.price = position.price * splitRatio;
      position.transactions.push(transaction);
    }

    const closedPositions: ClosedPosition[] = [];
    const book: { [K: string]: CurrentPosition } = {};

    const transactions: Transaction[] = [];
    const hash: { [K: string]: Transaction } = {};
    props.transactions
      .filter((t) => ['buy', 'sell', 'reinvest', 'split'].includes(t.type))
      .map((t) => ({ ...t }))
      .forEach((transaction) => {
        const key = `${transaction.date.format('YYYY-MM-DD')}-${transaction.type}-${transaction.symbol}-${
          transaction.currency
        }-${transaction.account}`;
        const existingTransaction = hash[key];
        if (existingTransaction) {
          const shares = existingTransaction.shares + transaction.shares;
          existingTransaction.price =
            existingTransaction.price && existingTransaction.shares && transaction.price && transaction.shares
              ? (existingTransaction.price * existingTransaction.shares + transaction.price * transaction.shares) /
                shares
              : existingTransaction.price;
          existingTransaction.shares = shares;
          existingTransaction.amount += transaction.amount;
        } else {
          transactions.push(transaction);
          hash[key] = transaction;
        }
      });

    transactions.forEach((transaction) => {
      const key = `${transaction.account}-${transaction.symbol}`;
      let position = book[key];
      if (!position) {
        position = { shares: 0, price: 0, date: transaction.date, transactions: [] };
        book[key] = position;
      }

      if (transaction.type === 'buy') {
        if (position.shares < 0) {
          closedPositions.push(closePosition(position, transaction));
        } else {
          openPosition(position, transaction);
        }
      } else if (transaction.type === 'sell') {
        if (position.shares > 0) {
          closedPositions.push(closePosition(position, transaction));
        } else {
          openPosition(position, transaction);
        }
      } else if (transaction.type === 'split') {
        handleSplit(position, transaction);
      } else if (transaction.type === 'reinvest') {
        // acquire this position at zero cost, since it's a re-investment.
        openPosition(position, { ...transaction, price: 0 });
      }
    });

    return closedPositions
      .filter((position) => position.date.isSameOrAfter(fromDate) && position.date.isSameOrBefore(toDate))
      .filter((position) => position.buyPrice.toFixed(2) !== position.sellPrice.toFixed(2))
      .reverse();
  }, [props.transactions, fromDate, toDate, accountById, currencyCache]);

  function getDefaultTypes(): TransactionType[] {
    return [closedPositions.length ? 'pnl' : incomeTransactions.length ? 'income' : 'expense'];
  }
  const [types, setTypes] = useState<TransactionType[]>(getDefaultTypes);

  const getOptions = useCallback(
    ({ series }: { series: Highcharts.SeriesColumnOptions[] | Highcharts.SeriesPieOptions[] }): Highcharts.Options => {
      return {
        series,
        legend: {
          enabled: true,
        },

        tooltip: {
          outside: true,

          useHTML: true,
          backgroundColor: '#FFF',
          style: {
            color: '#1F2A33',
          },
        },

        title: {
          text: undefined,
        },
        xAxis: {
          type: 'category',
          labels: {
            style: {
              fontSize: '13px',
              fontFamily: 'Verdana, sans-serif',
            },
          },
        },

        yAxis: {
          labels: {
            enabled: !isPrivateMode,
          },
          title: {
            text: '$ (CAD)',
          },
        },
      };
    },
    [isPrivateMode],
  );

  const getData = useCallback(
    (closedPositions: ClosedPosition[]): Highcharts.SeriesColumnOptions[] => {
      function getBarLabel(date: string) {
        const startDate = moment(date);

        switch (timeline) {
          case 'month':
            return startDate.format('MMM YY');
          case 'week':
            return `${startDate.format('MMM DD')} - ${moment(date)
              .endOf(timeline)
              .format('MMM DD')}, ${startDate.format('YY')}`;
          case 'year':
            return startDate.format('YYYY');
          case 'day':
            return startDate.format('MMM DD, YYYY');
        }
      }

      function getSeries(type: TransactionType | 'all', values: { [K: string]: number }) {
        const data = Object.keys(values)
          .map((date) => ({ date, label: getBarLabel(date), pnl: values[date] }))
          .filter((value) => value.pnl)
          .sort((a, b) => moment(a.date).valueOf() - moment(b.date).valueOf())
          .map((value) => {
            return {
              date: value.date,
              label: value.label,
              pnl: value.pnl,
              startDate: moment(value.date).startOf(timeline).format(DATE_DISPLAY_FORMAT),
              endDate: moment(value.date).endOf(timeline).format(DATE_DISPLAY_FORMAT),
            };
          });

        const name =
          type === 'pnl'
            ? 'Realized P&L'
            : type === 'expense'
            ? 'Expenses (Interest, Fee)'
            : type === 'income'
            ? 'Income (Dividends)'
            : `${types.includes('pnl') ? `P&L  ${types.includes('income') ? '+' : ''} ` : ''}${
                types.includes('income') ? 'Income' : ''
              }${types.includes('expense') ? ' - Expenses' : ''}`;
        const color =
          type === 'pnl' ? '#b37feb' : type === 'expense' ? '#ff7875' : type === 'income' ? '#95de64' : '#5cdbd3';
        const _series: Highcharts.SeriesColumnOptions = {
          name,
          type: 'column',
          color,
          data: data.map((value) => ({
            key: value.label,
            name: value.label,
            label: value.label,
            y: value.pnl,
            pnl: !isPrivateMode ? formatMoney(value.pnl) : '-',
            pnlHuman: !isPrivateMode ? formatCurrency(value.pnl, 2) : '-',
            startDate: value.startDate,
            endDate: value.endDate,
          })),
          tooltip: {
            headerFormat: `<span style="font-size: 13px; font-weight: 700;">${name}</span>`,
            pointFormat: `<hr /><span style="font-size: 12px;font-weight: 500;">{point.startDate} - {point.endDate}</span>
          <br />
          <b style="font-size: 13px; font-weight: 700">{point.pnl} CAD</b><br />`,
          },
          dataLabels: { enabled: true, format: '{point.pnlHuman}' },
          showInLegend: true,
        };
        return _series;
      }

      const gains = {} as { [K: string]: number };
      const pnls = {} as { [K: string]: number };
      const expenses = {} as { [K: string]: number };
      const incomes = {} as { [K: string]: number };

      if (types.includes('pnl')) {
        closedPositions.forEach((value) => {
          const key = value.date.clone().startOf(timeline).format(DATE_FORMAT);
          pnls[key] = pnls[key] ? pnls[key] + value.pnl : value.pnl;
        });
      }

      if (types.includes('expense')) {
        expenseTransactions.forEach((value) => {
          const key = value.date.clone().startOf(timeline).format(DATE_FORMAT);
          expenses[key] = expenses[key] ? expenses[key] + value.amount : value.amount;
        });
      }

      if (types.includes('income')) {
        incomeTransactions.forEach((value) => {
          const key = value.date.clone().startOf(timeline).format(DATE_FORMAT);
          incomes[key] = incomes[key] ? incomes[key] + value.amount : value.amount;
        });
      }

      const allDates = new Set(Object.keys(expenses).concat(Object.keys(pnls)).concat(Object.keys(incomes)));
      allDates.forEach((key) => {
        gains[key] = (pnls[key] || 0) - (expenses[key] || 0) + (incomes[key] || 0);
      });

      const individualSeries: Highcharts.SeriesColumnOptions[] = [];
      types.forEach((type) => {
        const values = type === 'pnl' ? pnls : type === 'income' ? incomes : expenses;
        if (Object.keys(values).length) {
          individualSeries.push(getSeries(type, values));
        }
      });

      return individualSeries.length === 1 ? individualSeries : [getSeries('all', gains)].concat(individualSeries);
    },
    [expenseTransactions, incomeTransactions, isPrivateMode, timeline, types],
  );

  const getClosedPnLByAccountSeries = useCallback(
    (closedPositions: ClosedPosition[], closedPnL: number, group: GroupType): Highcharts.SeriesPieOptions[] => {
      const pnls = {} as { [K: string]: { name: string; pnl: number } };
      if (types.includes('pnl')) {
        closedPositions.forEach((position) => {
          const name = getGroupKey(group, position.account);
          let mergedAccount = pnls[name];
          if (!mergedAccount) {
            mergedAccount = { name, pnl: 0 };
            pnls[name] = mergedAccount;
          }
          mergedAccount.pnl += position.pnl;
        });
      }

      if (types.includes('expense')) {
        expenseTransactions.forEach((t) => {
          const name = getGroupKey(group, accountById[t.account]);
          let mergedAccount = pnls[name];
          if (!mergedAccount) {
            mergedAccount = { name, pnl: 0 };
            pnls[name] = mergedAccount;
          }
          mergedAccount.pnl -= t.amount;
        });
      }

      if (types.includes('income')) {
        incomeTransactions.forEach((t) => {
          const name = getGroupKey(group, accountById[t.account]);
          let mergedAccount = pnls[name];
          if (!mergedAccount) {
            mergedAccount = { name, pnl: 0 };
            pnls[name] = mergedAccount;
          }
          mergedAccount.pnl += t.amount;
        });
      }

      const data = Object.values(pnls);
      const accountsSeries: Highcharts.SeriesPieOptions = {
        type: 'pie' as 'pie',
        id: 'accounts',
        name: 'Accounts',
        dataLabels: {
          enabled: true,
          format:
            '<b style="font-size: 12px;">{point.name}: <span style="color: {point.pnlColor};">{point.percentage:.1f}%</span></b>',
          style: {
            color: 'black',
          },
        },
        data: data
          .filter((account) => account.pnl)
          .sort((a, b) => b.pnl - a.pnl)
          .map((account) => {
            return {
              name: account.name,
              y: Math.abs(account.pnl),
              negative: account.pnl < 0,
              displayValue: isPrivateMode ? '-' : account.pnl ? formatMoney(account.pnl) : account.pnl,
              totalValue: isPrivateMode ? '-' : formatMoney(closedPnL),
              pnlColor: account.pnl < 0 ? 'red' : 'green',
            };
          }),

        tooltip: {
          headerFormat: `<b>{point.key}<br />{point.percentage:.1f}%</b><hr />`,
          pointFormatter() {
            const point = this.options as any;
            return `<table>
          <tr><td>P/L</td><td class="position-tooltip-value">${point.displayValue} CAD</td></tr>
          <tr><td>Total P/L</td><td class="position-tooltip-value">${point.totalValue} CAD</td></tr>
        </table>`;
          },
        },
      };

      return [accountsSeries];
    },
    [expenseTransactions, incomeTransactions, accountById, isPrivateMode, types],
  );

  const { closedPnL, realizedPnL } = useMemo(() => {
    const realizedPnL = closedPositions.reduce((pnl, position) => pnl + position.pnl, 0);
    const closedPnL =
      (types.includes('pnl') ? realizedPnL : 0) -
      (types.includes('expense') ? totalExpense : 0) +
      (types.includes('income') ? totalIncome : 0);
    return { realizedPnL, closedPnL };
  }, [closedPositions, types, totalExpense, totalIncome]);

  const options = useMemo(() => {
    return getOptions({ series: getData(closedPositions) });
  }, [closedPositions, getData, getOptions]);

  const accountSeriesOptions = useMemo(() => {
    return getOptions({ series: getClosedPnLByAccountSeries(closedPositions, closedPnL, compositionGroup) });
  }, [closedPositions, closedPnL, compositionGroup, getOptions, getClosedPnLByAccountSeries]);

  const typesOptions = useMemo(() => {
    const options: { disabled?: boolean; label: string | React.ReactNode; value: TransactionType }[] = [];

    options.push({
      label: (
        <>
          Realized P&L{' '}
          <Typography.Text type={realizedPnL > 0 ? 'success' : realizedPnL < 0 ? 'danger' : 'secondary'} strong>
            {formatMoney(realizedPnL)} CAD
          </Typography.Text>
        </>
      ),
      value: 'pnl',
      disabled: !closedPositions.length,
    });

    options.push({
      label: (
        <>
          Income (Dividends){' '}
          <Typography.Text type={totalIncome ? 'success' : 'secondary'} strong={totalIncome > 0}>
            {formatMoney(totalIncome)} CAD
          </Typography.Text>
        </>
      ),
      value: 'income',
      disabled: !incomeTransactions.length,
    });

    options.push({
      label: (
        <>
          Expenses (Interest, Fee){' '}
          <Typography.Text type={totalExpense ? 'danger' : 'secondary'} strong={totalExpense > 0}>
            {formatMoney(totalExpense)} CAD
          </Typography.Text>
        </>
      ),
      value: 'expense',
      disabled: !expenseTransactions.length,
    });

    return options;
  }, [closedPositions, incomeTransactions, expenseTransactions, realizedPnL, totalExpense, totalIncome]);

  const show = closedPositions.length > 0 || incomeTransactions.length > 0 || expenseTransactions.length > 0;
  return show ? (
    <>
      <Flex mt={2} mb={3} justifyContent="center">
        <Statistic
          value={isPrivateMode ? '--' : closedPnL}
          precision={2}
          suffix="CAD"
          valueStyle={{ color: closedPnL >= 0 ? 'green' : 'red' }}
          prefix={closedPnL >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        />
      </Flex>

      <Flex
        mb={3}
        mt={2}
        width={1}
        justifyContent="center"
        alignContent="center"
        justifyItems="center"
        alignItems="center"
      >
        <Checkbox.Group
          options={typesOptions}
          value={types}
          onChange={(checkedValues) => {
            setTypes(checkedValues as TransactionType[]);
            trackEvent('realized-pnl-types', { types: checkedValues });
          }}
        />
      </Flex>

      <Charts key={timeline} options={options} />

      <Flex width={1} justifyContent="center" py={2} mb={4}>
        <Radio.Group
          defaultValue={timeline}
          size="large"
          buttonStyle="solid"
          onChange={(e) => {
            trackEvent('realized-pnl-chart', { timeline: e.target.value });
            setTimeline(e.target.value);
          }}
          options={[
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
            { label: 'Year', value: 'year' },
          ]}
          optionType="button"
        />
      </Flex>

      <Collapsible title="Realized P&L Composition">
        <Charts key={timeline} options={accountSeriesOptions} />{' '}
        <CompositionGroup changeGroup={setCompositionGroup} group={compositionGroup} tracker="realized-pnl-group" />
      </Collapsible>

      {closedPositions.length > 0 && (
        <RealizedPnLTable
          closedPositions={closedPositions}
          isPrivateMode={isPrivateMode}
          fromDate={fromDate}
          toDate={toDate}
        />
      )}
      {incomeTransactions.length > 0 && (
        <IncomeTable transactions={incomeTransactions} isPrivateMode={isPrivateMode} accountById={accountById} />
      )}
      {expenseTransactions.length > 0 && (
        <ExpensesTable
          transactions={expenseTransactions}
          isPrivateMode={isPrivateMode}
          accountById={accountById}
          fromDate={fromDate}
          toDate={toDate}
        />
      )}
    </>
  ) : (
    <Empty description="No realized gains/loss/income/expenses for the selected time period." />
  );
}
