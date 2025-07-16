import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import { Checkbox, Empty, Radio, Statistic, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import * as Highcharts from 'highcharts';
import React, { useCallback, useMemo, useState } from 'react';
import { Flex } from 'rebass';
import { trackEvent } from '../../analytics';
import { DATE_DISPLAY_FORMAT, DATE_FORMAT, DEBUG_LOCAL_STORAGE_KEY } from '../../constants';
import { getLocalCache } from '../../utils/common';
import useCurrency from '../../hooks/useCurrency';
import { Account, AccountTransaction, SecurityTransaction, Transaction } from '../../types';
import { formatCurrency, formatMoney } from '../../utils/common';
import { Charts } from '../Charts';
import Collapsible from '../Collapsible';
import CompositionGroup, { GroupType, getGroupKey } from '../CompositionGroup';
import ExpenseTable from './ExpenseTable';
import IncomeTable, { IncomeTransaction } from './IncomeTable';
import RealizedPnLTable from './RealizedPnLTable';
import { ClosedPosition } from './utils';

type Props = {
  transactions: Transaction[];
  accountTransactions: AccountTransaction[];
  accounts: Account[];
  isPrivateMode: boolean;
  fromDate: string;
  toDate: string;
};

type CurrentPosition = {
  shares: number;
  price: number;
  date: Dayjs;
  transactions: Transaction[];
  security: SecurityTransaction;
};

type TransactionType = 'income' | 'pnl' | 'expense';

export default function RealizedPnL({ accounts, isPrivateMode, ...props }: Props) {
  const [timeline, setTimeline] = useState<'month' | 'year' | 'week' | 'day'>('year');
  const { getValue, baseCurrencyDisplay } = useCurrency();

  const { transactions, accountTransactions, fromDate, toDate } = useMemo(() => {
    const fromDate = dayjs(props.fromDate);
    const toDate = dayjs(props.toDate);
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
      .filter((transaction) => ['interest', 'fee'].includes(transaction.type) && transaction.amount < 0)
      .concat(transactions.filter((transaction) => transaction.type === 'tax'))
      .map((transaction) => ({ ...transaction, amount: Math.abs(transaction.amount) }))
      .sort((a, b) => b.date.unix() - a.date.unix());

    return {
      expenseTransactions,
      totalExpense: expenseTransactions.reduce((expense, t) => expense + t.amount, 0),
    };
  }, [accountTransactions, transactions]);

  const { incomeTransactions, totalIncome } = useMemo(() => {
    const incomeTransactions: IncomeTransaction[] = accountTransactions
      .filter((transaction) => ['income', 'interest', 'fee'].includes(transaction.type) && transaction.amount > 0)
      .concat(transactions.filter((transaction) => ['income', 'dividend', 'distribution'].includes(transaction.type)))
      .sort((a, b) => b.date.unix() - a.date.unix());

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

  const { closedPositions, openBook } = useMemo(() => {
    function closePosition(position: CurrentPosition, transaction: Transaction) {
      position.transactions.push(transaction);

      const closedShares = Math.min(Math.abs(position.shares), Math.abs(transaction.shares));
      const buyRecord = transaction.type === 'buy' ? transaction : position;
      const sellRecord = transaction.type === 'sell' ? transaction : position;

      const buyValue = closedShares * buyRecord.price;
      const sellValue = closedShares * sellRecord.price;
      const buyCost = getValue(transaction.currency, buyValue, buyRecord.date);
      const sellCost = getValue(transaction.currency, sellValue, sellRecord.date);

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
        pnlRatio,
      };

      const openShares = position.shares + transaction.shares;
      position.shares = parseFloat(openShares.toFixed(3));

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
      if (!transaction.splitRatio) {
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
      .filter((t) => ['buy', 'sell', 'reinvest', 'split', 'distribution'].includes(t.type))
      .map((t) => ({ ...t }))
      .forEach((transaction) => {
        const key = `${transaction.date.format(DATE_FORMAT)}-${transaction.type}-${transaction.symbol}-${
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
        position = {
          shares: 0,
          price: 0,
          date: transaction.date,
          transactions: [],
          security: transaction.security,
        };
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
        // handle distribution as the reinvest of shares.
      } else if (['reinvest', 'distribution'].includes(transaction.type) && transaction.shares > 0) {
        // acquire this position at zero cost, since it's a re-investment.
        openPosition(position, { ...transaction, price: 0 });
      }
    });

    console.debug(
      `[DEBUG] Open Book, csv download enabled: ${getLocalCache(DEBUG_LOCAL_STORAGE_KEY)}`,
      Object.keys(book)
        .filter((key) => book[key].shares !== 0)
        .map((key) => ({
          symbol: key,
          securityId: book[key].security.id,
          amount: book[key].price * book[key].shares,
          ...book[key],
        })),
    );

    const openBook = Object.keys(book)
      .filter((key) => book[key].shares !== 0)
      .map((key) => ({
        symbol: book[key].security.symbol || key,
        institution: book[key].security.institution || '',
        investment: book[key].security.investment || '',
        securityId: book[key].security.id,
        currency: book[key].security.currency,
        price: book[key].price,
        shares: book[key].shares,
        amount: book[key].price * book[key].shares,
      }));

    return {
      closedPositions: closedPositions
        .filter((position) => position.date.isSameOrAfter(fromDate) && position.date.isSameOrBefore(toDate))
        .filter((position) => position.buyPrice.toFixed(2) !== position.sellPrice.toFixed(2))
        .reverse(),
      openBook,
    };
  }, [props.transactions, getValue, accountById, fromDate, toDate]);

  const enableOpenBookCsvDownload = useMemo(() => {
    const debugEnabled = !!getLocalCache(DEBUG_LOCAL_STORAGE_KEY);
    return debugEnabled && openBook?.length;
  }, [openBook]);

  const computeCsvUrl = useCallback(() => {
    const header = ['Symbol', 'Institution', 'Investment', 'Security Id', 'Currency', 'Price', 'Shares', 'Amount'];
    const rows = openBook.map((row) =>
      [
        row.symbol,
        row.institution,
        row.investment,
        row.securityId,
        row.currency,
        row.price.toFixed(3),
        row.shares.toFixed(3),
        row.amount.toFixed(2),
      ].join(','),
    );
    const csvContent = [header.join(','), ...rows].join('\n');
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
  }, [openBook]);

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
            text: baseCurrencyDisplay,
          },
        },
      };
    },
    [isPrivateMode, baseCurrencyDisplay],
  );

  const getData = useCallback(
    (closedPositions: ClosedPosition[]): Highcharts.SeriesColumnOptions[] => {
      function getBarLabel(date: string) {
        const startDate = dayjs(date);

        switch (timeline) {
          case 'month':
            return startDate.format('MMM YY');
          case 'week':
            return `${startDate.format('MMM DD')} - ${dayjs(date).endOf(timeline).format('MMM DD')}, ${startDate.format(
              'YY',
            )}`;
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
          .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())
          .map((value) => {
            return {
              date: value.date,
              label: value.label,
              pnl: value.pnl,
              startDate: dayjs(value.date).startOf(timeline).format(DATE_DISPLAY_FORMAT),
              endDate: dayjs(value.date).endOf(timeline).format(DATE_DISPLAY_FORMAT),
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
            baseCurrency: baseCurrencyDisplay,
            startDate: value.startDate,
            endDate: value.endDate,
          })),
          tooltip: {
            headerFormat: `<span style="font-size: 13px; font-weight: 700;">${name}</span>`,
            pointFormat: `<hr /><span style="font-size: 12px;font-weight: 500;">{point.startDate} - {point.endDate}</span>
          <br />
          <b style="font-size: 13px; font-weight: 700">{point.pnl} {point.baseCurrency}</b><br />`,
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
    [baseCurrencyDisplay, expenseTransactions, incomeTransactions, isPrivateMode, timeline, types],
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
              baseCurrency: baseCurrencyDisplay,
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
          <tr><td>P/L</td><td class="position-tooltip-value">${point.displayValue} ${point.baseCurrency}</td></tr>
          <tr><td>Total P/L</td><td class="position-tooltip-value">${point.totalValue} ${point.baseCurrency}</td></tr>
        </table>`;
          },
        },
      };

      return [accountsSeries];
    },
    [expenseTransactions, incomeTransactions, accountById, isPrivateMode, types, baseCurrencyDisplay],
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
            {formatMoney(realizedPnL)} {baseCurrencyDisplay}
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
            {formatMoney(totalIncome)} {baseCurrencyDisplay}
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
            {formatMoney(totalExpense)} {baseCurrencyDisplay}
          </Typography.Text>
        </>
      ),
      value: 'expense',
      disabled: !expenseTransactions.length,
    });

    return options;
  }, [
    closedPositions,
    incomeTransactions,
    expenseTransactions,
    realizedPnL,
    totalExpense,
    totalIncome,
    baseCurrencyDisplay,
  ]);

  const show = closedPositions.length > 0 || incomeTransactions.length > 0 || expenseTransactions.length > 0;
  return show ? (
    <>
      <Flex mt={2} mb={3} justifyContent="center">
        <Statistic
          value={isPrivateMode ? '--' : closedPnL}
          precision={2}
          suffix={baseCurrencyDisplay}
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

      <div style={{ position: 'relative' }}>
        <Charts key={timeline} options={options} />
        {enableOpenBookCsvDownload && (
          <Typography.Link
            href={computeCsvUrl()}
            download="open-book.csv"
            style={{ position: 'absolute', bottom: 8, right: 8 }}
          >
            Download Open Book CSV
          </Typography.Link>
        )}
      </div>

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
        <ExpenseTable
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
