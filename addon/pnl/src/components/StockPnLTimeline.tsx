/* eslint-disable react-hooks/exhaustive-deps */

import { Card, Empty, Spin } from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../analytics';
import { DATE_FORMAT, TYPE_TO_COLOR } from '../constants';
import { useAddonContext } from '../context/AddonContext';
import useCurrency from '../hooks/useCurrency';
import { type SecurityPriceData, useSecurityHistory } from '../hooks/useSecurityHistory';
import type { Account, Position, Transaction } from '../types';
import { formatCurrency, formatMoney, getNextWeekday, max, min } from '../utils/common';
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
    if (symbol) {
      const fetchData = async () => {
        setLoading(true);
        trackEvent('stock-pnl-timeline');

        const startDate = position.transactions?.length ? position.transactions[0].date : dayjs();

        try {
          const data = await fetchSecurityHistory(position.security.id, startDate, dayjs());
          setPrices(data);
        } catch (error) {
          console.error('Failed to load stock prices:', error);
          setPrices([]);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [symbol, position, fetchSecurityHistory]);

  function getSeries(): any[] {
    const book: {
      [K: string]: { shares: number; price: number; date: string }[];
    } = { all: [] };

    position.transactions
      .filter((t) => ['buy', 'sell', 'split', 'reinvest'].includes(t.type))
      .forEach((t) => {
        if (t.type === 'split' && !t.splitRatio) {
          return;
        }

        const date = getNextWeekday(t.date.clone());
        let accountBook = book[t.account];
        if (!accountBook) {
          accountBook = [];
          book[t.account] = accountBook;
        }

        const isBuy = ['buy', 'reinvest'].includes(t.type);
        const isSplit = t.type === 'split';

        const tPrice = t.type === 'reinvest' ? 0 : t.price;
        const splitRatio = t.splitRatio || 1;
        const lastBuySell = accountBook.pop() || { shares: 0, price: 0, date };
        const newPositionShares = Number(
          (!isSplit ? lastBuySell.shares + t.shares : Math.floor(lastBuySell.shares / splitRatio)).toFixed(10),
        );

        const newPosition = {
          price:
            isBuy && newPositionShares
              ? (lastBuySell.price * lastBuySell.shares + tPrice * t.shares) / newPositionShares
              : isSplit
                ? lastBuySell.price * splitRatio
                : newPositionShares
                  ? lastBuySell.price
                  : 0,
          shares: newPositionShares,
          date,
        };
        if (newPosition.date !== lastBuySell.date) {
          accountBook.push(lastBuySell);
        }
        accountBook.push(newPosition);

        // Update all book.
        const allLastBuySell = book.all.pop() || { shares: 0, price: 0, date };
        const shares = Number(
          (isSplit
            ? allLastBuySell.shares - lastBuySell.shares + newPosition.shares
            : allLastBuySell.shares + t.shares
          ).toFixed(10),
        );
        const price = shares
          ? isSplit
            ? (allLastBuySell.price * allLastBuySell.shares -
                lastBuySell.shares * lastBuySell.price +
                newPosition.shares * newPosition.price) /
              shares
            : (allLastBuySell.price * allLastBuySell.shares + (isBuy ? tPrice : lastBuySell.price) * t.shares) / shares
          : 0;

        const allEntry = { price, shares, date };

        if (allEntry.date !== allLastBuySell.date) {
          book.all.push(allLastBuySell);
        }
        book.all.push(allEntry);
      });

    const allBook = book.all.reduce(
      (hash, entry) => {
        hash[entry.date] = { shares: entry.shares, price: entry.price };
        return hash;
      },
      {} as { [K: string]: { shares: number; price: number } },
    );
    let data: any[] = [];
    let _entry: any;
    prices.forEach((price) => {
      const entry = allBook[price.timestamp.format(DATE_FORMAT)];
      _entry = entry ? entry : _entry;
      if (_entry) {
        if (_entry.shares === 0) {
          // nullify the book on selling shares.
          data = [];
        } else {
          const bookValue = _entry.price * _entry.shares;
          const marketValue = price.closePrice * _entry.shares;
          const pnlRatio = ((price.closePrice - _entry.price) / _entry.price) * 100;
          data.push({
            x: price.timestamp.valueOf(),
            y: showValueChart ? marketValue - bookValue : pnlRatio,
            d: price.timestamp.format(DATE_FORMAT),
            pnlRatio,
            pnlValue: isPrivateMode ? '-' : formatMoney(marketValue - bookValue),
            currency: position.security.currency.toUpperCase(),
            stockPrice: formatMoney(price.closePrice),
            price: formatMoney(_entry.price),
            shares: _entry.shares.toLocaleString('en-US'),
          });
        }
      }
    });

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
