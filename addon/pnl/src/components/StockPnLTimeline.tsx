/* eslint-disable react-hooks/exhaustive-deps */

import { Card, Empty, Spin } from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { calculateOpenTransactions, type OpenTransaction } from '@/utils/transactionUtils';
import { trackEvent } from '../analytics';
import { DATE_FORMAT, TYPE_TO_COLOR } from '../constants';
import { useAddonContext } from '../context/AddonContext';
import useCurrency from '../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../hooks/useSecurityHistory';
import type { Account, Position, Transaction } from '../types';
import { formatCurrency, formatMoney, getYahooSymbol, isTradingDay, max, min } from '../utils/common';
import { startCase } from '../utils/lodash-replacements';
import Charts from './Charts';

type Props = {
  symbol: string;
  position: Position;
  showValueChart?: boolean;
  accounts: Account[];
};

const POINT_FORMAT =
  'P/L (%): <b>{point.pnlRatio:.2f}%</b> <br />P/L ($): <b>{point.pnlValue} {point.currency}</b><br /><br />Book: {point.shares}@{point.price}<br /><br />Stock Price: {point.stockPrice} {point.currency}<br />';

function StockPnLTimeline({ symbol, position, showValueChart, accounts }: Props) {
  const { isPrivateMode } = useAddonContext();
  const { baseCurrencyDisplay } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<SecurityPriceData[]>([]);
  const { fetchSecurityHistory } = useSecurityHistory({ maxChangePercentage: 100 });
  const openTransactions = useMemo(() => calculateOpenTransactions(position.transactions), [position.transactions]);

  const accountById = useMemo(() => {
    return accounts.reduce(
      (hash, account) => {
        hash[account.id] = account;
        return hash;
      },
      {} as { [K: string]: Account },
    );
  }, [accounts]);

  function getAccountName(accountId: string) {
    const account = accountById[accountId];
    return account ? account.name : accountById;
  }

  useEffect(() => {
    if (!position) return;
    if (!openTransactions.length) return;

    const fetchData = async () => {
      setLoading(true);
      trackEvent('stock-pnl-timeline');
      const startDate = openTransactions[0].date;
      try {
        await fetchSecurityHistory(
          { securityId: position.security.id, yahooSymbol: getYahooSymbol(position.security) },
          startDate,
          dayjs(),
        ).then((data) => {
          setPrices(data);
        });
      } catch (error) {
        console.error('Failed to load stock prices:', error);
        setPrices([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [position, fetchSecurityHistory]);

  function getSeries(): any[] {
    if (!prices.length) return [];
    if (!openTransactions.length) return [];

    const openTransactionsByDate = openTransactions.reduce(
      (hash, transaction) => {
        hash[transaction.date.format(DATE_FORMAT)] = transaction;
        return hash;
      },
      {} as { [K: string]: OpenTransaction },
    );
    const priceMap = prices.reduce(
      (hash, price) => {
        hash[price.timestamp.format(DATE_FORMAT)] = price.closePrice;
        return hash;
      },
      {} as { [K: string]: number },
    );

    let shares = 0;
    let bookValue = 0;

    let currentDate = openTransactions[0].date;
    const lastDate = prices[prices.length - 1].timestamp;
    const data: any[] = [];
    while (currentDate.isSameOrBefore(lastDate)) {
      const entry = openTransactionsByDate[currentDate.format(DATE_FORMAT)];
      if (entry) {
        shares += entry.shares;
        bookValue += entry.amount;
      }
      const price = priceMap[currentDate.format(DATE_FORMAT)];
      if (isTradingDay(currentDate) && price) {
        const marketValue = price * shares;
        const pnlRatio = ((marketValue - bookValue) / marketValue) * 100;
        data.push({
          x: currentDate.valueOf(),
          y: showValueChart ? marketValue - bookValue : pnlRatio,
          d: currentDate.format(DATE_FORMAT),
          pnlRatio,
          pnlValue: isPrivateMode ? '-' : formatMoney(marketValue - bookValue),
          currency: position.security.currency.toUpperCase(),
          stockPrice: formatMoney(price),
          price: formatMoney(bookValue / shares),
          shares: shares.toLocaleString('en-US'),
        });
      }

      // Move on to the next day
      currentDate = currentDate.add(1, 'day');
    }

    return [
      {
        id: 'dataseries',
        name: symbol,
        data,
        type: 'spline',

        tooltip: {
          pointFormat: POINT_FORMAT,
          split: true,
        },
      },
      {
        type: 'flags',
        name: 'Max Gain/Loss',
        tooltip: {
          pointFormat: `<b>{point.text}</b><br />${POINT_FORMAT}`,
        },
        data: [
          {
            ...min(data, 'y'),
            title: 'L',
            text: 'Max Loss',
          },
          {
            ...max(data, 'y'),
            title: 'G',
            text: 'Max Gain',
          },
        ].sort((a, b) => a.x - b.x),
        onSeries: 'dataseries',
        shape: 'squarepin',
        width: 16,
      },
      ...['buy', 'sell', 'transfer', 'income', 'dividend', 'distribution', 'tax', 'fee', 'reinvest']
        .map((type) => getFlags(type))
        .filter((series) => !!series.data?.length),
    ];
  }

  function getFlags(type: string): any {
    const isBuySell = ['buy', 'sell', 'reinvest', 'transfer'].includes(type);
    const _type = type === 'transfer' ? 'buy' : type;

    return {
      name: startCase(type),
      shape: 'squarepin',
      type: 'flags',
      width: 25,

      tooltip: {
        pointFormat: '<b>{point.text}</b><br />{point.account}',
      },

      data: position.transactions
        .filter(
          (t) =>
            t.type === _type &&
            (!['buy', 'sell'].includes(t.type) ||
              (type !== 'transfer' && !(t.description || '').toLowerCase().includes('transfer')) ||
              (type === 'transfer' && (t.description || '').toLowerCase().includes('transfer'))),
        )
        .map((t) => ({ ...t }))
        .sort((a, b) => a.date.valueOf() - b.date.valueOf())
        .reduce((array, transaction) => {
          const lastTransaction = array.pop();
          if (lastTransaction && lastTransaction.date.valueOf() === transaction.date.valueOf()) {
            const shares =
              transaction.shares && lastTransaction.shares
                ? lastTransaction.shares + transaction.shares
                : lastTransaction.shares;

            array.push({
              ...lastTransaction,
              shares,
              amount: transaction.amount + lastTransaction.amount,
              price:
                lastTransaction.price && lastTransaction.shares && transaction.price && transaction.shares
                  ? (lastTransaction.price * lastTransaction.shares + transaction.price * transaction.shares) / shares
                  : lastTransaction.price,
            });
          } else {
            if (lastTransaction) {
              array.push(lastTransaction);
            }
            array.push(transaction);
          }
          return array;
        }, [] as Transaction[])
        .map((transaction) => {
          const shares = transaction.shares ? Math.abs(transaction.shares) : 0;
          return {
            transaction,
            x: transaction.date.valueOf(),
            title: isBuySell ? Math.round(shares).toLocaleString() : type.charAt(0).toUpperCase(),
            text: isBuySell
              ? `${startCase(type)}: ${shares}@${formatMoney(transaction.price)}`
              : `${startCase(type)}: $${formatCurrency(transaction.amount, 2)}`,
            account: getAccountName(transaction.account),
          };
        }),
      color: (TYPE_TO_COLOR as any)[type],
      fillColor: (TYPE_TO_COLOR as any)[type],
      style: {
        color: 'white', // text style
      },
    };
  }

  function getOptions(series: any[]): Highcharts.Options {
    const dividends = position.transactions
      .filter((transaction) => transaction.type === 'dividend')
      .reduce((dividend, transaction) => dividend + transaction.amount, 0);

    return {
      subtitle: {
        text: isPrivateMode
          ? ''
          : `Shares: ${position.quantity}@${formatMoney(
              position.investments.reduce((cost, investment) => {
                return cost + investment.book_value;
              }, 0) / position.quantity,
            )}, Market Value: ${formatCurrency(position.market_value, 2)} ${baseCurrencyDisplay}, XIRR: ${formatMoney(
              position.xirr * 100,
            )}%, P/L: ${formatMoney(position.gain_percent * 100, 2)}% / ${formatCurrency(
              position.gain_amount,
              2,
            )} ${baseCurrencyDisplay}${
              dividends ? `, Dividends: ${formatCurrency(dividends, 2)} ${baseCurrencyDisplay}` : ''
            }`,
        style: {
          color: '#1F2A33',
          fontWeight: 'bold',
        },
      },

      rangeSelector: { selected: 1, enabled: true, inputEnabled: true },
      navigator: { enabled: true },
      scrollbar: { enabled: false },

      plotOptions: {
        spline: {
          gapSize: 15,
          zones: [
            {
              value: -0.00000001,
              color: '#FF897C',
            },
            {
              color: '#84C341',
            },
          ],
        },
      },

      yAxis: [
        {
          crosshair: {
            dashStyle: 'Dash',
          },
          labels: {
            formatter() {
              return showValueChart
                ? formatCurrency(this.value as number, 2)
                : `${formatMoney(this.value as number, 0)}%`;
            },
          },
          title: {
            text: undefined,
          },
          opposite: false,
        },
      ],
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 500,
            },
            chartOptions: {
              chart: {
                height: 300,
              },
              subtitle: {
                text: undefined,
              },
            },
          },
        ],
      },
      series,
      legend: {
        enabled: true,
      },
    };
  }

  const options = useMemo(() => {
    return getOptions(getSeries());
  }, [getOptions, getSeries]);

  return (
    <Card
      title={`P/L (${showValueChart ? '$' : '%'}) Timeline: ${symbol}`}
      variant="outlined"
      styles={{ body: { paddingTop: 4 } }}
    >
      {loading ? (
        <div className="flex justify-center items-center" style={{ height: 300 }}>
          <Spin size="large" />
        </div>
      ) : !prices || !prices.length ? (
        <Empty description={`Can't load stock price for ${symbol}`} />
      ) : (
        <Charts constructorType="stockChart" options={options} />
      )}
    </Card>
  );
}

export default React.memo(StockPnLTimeline);
