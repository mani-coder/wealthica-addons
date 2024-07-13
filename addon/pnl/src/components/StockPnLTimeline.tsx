/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-template-curly-in-string */
import { Empty, Spin } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import _ from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';
import { Flex } from 'rebass';
import { trackEvent } from '../analytics';
import { DATE_FORMAT, TYPE_TO_COLOR } from '../constants';
import useCurrency from '../hooks/useCurrency';
import { Account, Position, Transaction } from '../types';
import { buildCorsFreeUrl, formatCurrency, formatMoney, getDate, max, min } from '../utils/common';
import Charts from './Charts';

type Props = {
  symbol: string;
  position: Position;
  isPrivateMode: boolean;
  addon?: any;
  showValueChart?: boolean;
  accounts: Account[];
};

type StockPrice = {
  timestamp: Dayjs;
  closePrice: number;
};

const POINT_FORMAT = `P/L (%): <b>{point.pnlRatio:.2f}%</b> <br />P/L ($): <b>{point.pnlValue} {point.currency}</b><br /><br />Book: {point.shares}@{point.price}<br /><br />Stock Price: {point.stockPrice} {point.currency}<br />`;

function StockPnLTimeline({ isPrivateMode, symbol, position, addon, showValueChart, accounts }: Props) {
  const { baseCurrencyDisplay } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<StockPrice[]>([]);

  const accountById = useMemo(() => {
    return accounts.reduce((hash, account) => {
      hash[account.id] = account;
      return hash;
    }, {} as { [K: string]: Account });
  }, [accounts]);

  function getAccountName(accountId: string) {
    const account = accountById[accountId];
    return account ? account.name : accountById;
  }

  function parseSecuritiesResponse(response) {
    let to = getDate(response.to);
    const data: StockPrice[] = [];
    let prevPrice;
    response.data
      .filter((closePrice) => closePrice)
      .reverse()
      .forEach((closePrice: number) => {
        if (!prevPrice) {
          prevPrice = closePrice;
        }
        const changePercentage = Math.abs((closePrice - prevPrice) / closePrice) * 100;
        if (changePercentage > 100) {
          closePrice = prevPrice;
        }

        if (to.isoWeekday() <= 5) {
          data.push({ timestamp: to.clone(), closePrice });
        }

        // Move the date forward.
        to = to.subtract(1, 'days');
        prevPrice = closePrice;
      });

    setPrices(data.sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf()));
  }

  useEffect(() => {
    if (symbol) {
      setLoading(true);

      trackEvent('stock-pnl-timeline');

      const startDate = position.transactions && position.transactions.length ? position.transactions[0].date : dayjs();
      const endpoint = `securities/${position.security.id}/history?from=${startDate.format(
        DATE_FORMAT,
      )}&to=${dayjs().format(DATE_FORMAT)}`;
      if (addon) {
        addon
          .request({ query: {}, method: 'GET', endpoint })
          .then((response) => parseSecuritiesResponse(response))
          .catch((error) => {
            console.log('Failed to load stock prices.', error);
            setPrices([]);
          })
          .finally(() => setLoading(false));
      } else {
        const url = `https://app.wealthica.com/api/${endpoint}`;
        fetch(buildCorsFreeUrl(url), { cache: 'force-cache', headers: { 'Content-Type': 'application/json' } })
          .then((response) => response.json())
          .then((response) => parseSecuritiesResponse(response))
          .catch((error) => {
            console.log('Failed to load stock prices.', error);
            setPrices([]);
          })
          .finally(() => setLoading(false));
      }
    }
  }, [symbol, position]);

  function getNextWeekday(date) {
    const referenceDate = dayjs(date);
    let day = referenceDate.day();
    let diff = day === 6 ? 2 : day === 0 ? 1 : 0;
    return (diff ? referenceDate.add(diff, 'days') : referenceDate).format(DATE_FORMAT);
  }

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
        let lastBuySell = accountBook.pop() || { shares: 0, price: 0, date };
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
        let allLastBuySell = book.all.pop() || { shares: 0, price: 0, date };
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

    const allBook = book.all.reduce((hash, entry) => {
      hash[entry.date] = { shares: entry.shares, price: entry.price };
      return hash;
    }, {} as { [K: string]: { shares: number; price: number } });
    let data: any[] = [];
    let _entry;
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

  function getFlags(type: string): Highcharts.SeriesFlagsOptions {
    const isBuySell = ['buy', 'sell', 'reinvest', 'transfer'].includes(type);
    const _type = type === 'transfer' ? 'buy' : type;

    return {
      name: _.startCase(type),
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
              ? `${_.startCase(type)}: ${shares}@${formatMoney(transaction.price)}`
              : `${_.startCase(type)}: $${formatCurrency(transaction.amount, 2)}`,
            account: getAccountName(transaction.account),
          };
        }),
      color: TYPE_TO_COLOR[type],
      fillColor: TYPE_TO_COLOR[type],
      style: {
        color: 'white', // text style
      },
    };
  }

  function getOptions(series: Highcharts.SeriesLineOptions[]): Highcharts.Options {
    const dividends = position.transactions
      .filter((transaction) => transaction.type === 'dividend')
      .reduce((dividend, transaction) => dividend + transaction.amount, 0);

    return {
      title: {
        text: `P/L (${showValueChart ? '$' : '%'}) Timeline for ${symbol}`,
        style: {
          color: '#1F2A33',
          textDecoration: 'underline',
          fontWeight: 'bold',
        },
      },
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

      rangeSelector: { selected: 1, enabled: true as any, inputEnabled: false },
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
  }, [symbol, position, prices, showValueChart]);

  return (
    <>
      <hr />
      {loading ? (
        <Flex justifyContent="center" height={300} alignItems="center">
          <Spin size="large" />
        </Flex>
      ) : !prices || !prices.length ? (
        <Empty description={`Can't load stock price for ${symbol}`} />
      ) : (
        <Charts constructorType={'stockChart'} options={options} />
      )}
      <hr />
    </>
  );
}

export default React.memo(StockPnLTimeline);
