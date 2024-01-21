/* eslint-disable no-template-curly-in-string */
import Spin from 'antd/lib/spin';
import _ from 'lodash';
import moment, { Moment } from 'moment';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../analytics';
import { TYPE_TO_COLOR } from '../constants';
import useCurrency from '../hooks/useCurrency';
import { Account, Position, Transaction } from '../types';
import { buildCorsFreeUrl, formatCurrency, formatMoney, getDate } from '../utils';
import Charts from './Charts';

type Props = {
  symbol: string;
  position: Position;
  isPrivateMode: boolean;
  addon?: any;
  accounts: Account[];
};

type SecurityHistoryTimeline = {
  timestamp: Moment;
  closePrice: number;
};

function StockTimeline(props: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const { getValue, baseCurrencyDisplay } = useCurrency();
  const [securityTimeline, setSecurityTimeline] = useState<SecurityHistoryTimeline[]>([]);

  const accountById = useMemo(() => {
    return props.accounts.reduce((hash, account) => {
      hash[account.id] = account;
      return hash;
    }, {} as { [K: string]: Account });
  }, [props.accounts]);

  function getAccountName(accountId: string) {
    const account = accountById[accountId];
    return account ? account.name : accountById;
  }

  const parseSecuritiesResponse = useCallback(
    (response) => {
      const crypto = props.position.security.type === 'crypto';
      const to = getDate(response.to);
      const data: SecurityHistoryTimeline[] = [];
      let prevPrice;
      response.data
        .filter((closePrice) => closePrice)
        .reverse()
        .forEach((closePrice: number) => {
          if (!prevPrice) {
            prevPrice = closePrice;
          }
          const changePercentage = Math.abs((closePrice - prevPrice) / closePrice) * 100;
          if (changePercentage > 200) {
            closePrice = prevPrice;
          }
          // Only weekdays.
          if (to.isoWeekday() <= 5 || crypto) {
            data.push({
              timestamp: to.clone(),
              closePrice: crypto ? getValue('usd', closePrice, to) : closePrice,
            });
          }

          // Move the date forward.
          to.subtract(1, 'days');
          prevPrice = closePrice;
        });

      const sortedData = data.sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

      // console.debug('Loaded the securities data --', sortedData);
      setLoading(false);
      setSecurityTimeline(sortedData);
    },
    [getValue, props.position.security.type],
  );

  const fetchData = useCallback(() => {
    setLoading(true);
    trackEvent('stock-timeline');

    const startDate = moment.min(
      (props.position.transactions && props.position.transactions.length
        ? props.position.transactions[0].date
        : moment()
      )
        .clone()
        .subtract(1, 'months'),
      moment().subtract(6, 'months'),
    );

    const endpoint = `securities/${props.position.security.id}/history?from=${startDate.format(
      'YYYY-MM-DD',
    )}&to=${moment().format('YYYY-MM-DD')}`;
    if (props.addon) {
      props.addon
        .request({
          query: {},
          method: 'GET',
          endpoint,
        })
        .then((response) => {
          parseSecuritiesResponse(response);
        })
        .catch((error) => console.log(error));
    } else {
      const url = `https://app.wealthica.com/api/${endpoint}`;

      console.debug('Fetching stock data..', url);
      fetch(buildCorsFreeUrl(url), {
        cache: 'force-cache',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then((response) => response.json())
        .then((response) => {
          parseSecuritiesResponse(response);
        })
        .catch((error) => console.log(error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseSecuritiesResponse, props.position.security.id]);

  useEffect(() => {
    fetchData();
  }, [props.symbol, fetchData]);

  function getSeries(): any {
    if (!securityTimeline) {
      return [{}];
    }

    const data: { x: number; y: number }[] = [];
    let minPrice, maxPrice, minTimestamp, maxTimestamp;
    securityTimeline.forEach((_data, index) => {
      const timestamp = _data.timestamp.valueOf();
      const closePrice = _data.closePrice;

      data.push({ x: timestamp, y: closePrice });

      if (index === 0) {
        maxPrice = minPrice = closePrice;
        minTimestamp = maxTimestamp = timestamp;
      }
      if (closePrice < minPrice) {
        minPrice = closePrice;
        minTimestamp = timestamp;
      }
      if (closePrice > maxPrice) {
        maxPrice = closePrice;
        maxTimestamp = timestamp;
      }
    });

    const flags = [
      getFlags('buy'),
      getFlags('sell'),
      getFlags('income', true),
      getFlags('dividend', true),
      getFlags('distribution', true),
      getFlags('tax', true),
      getFlags('fee', true),
      getFlags('reinvest'),
      getFlags('transfer'),
    ].filter((series) => !!series.data?.length);

    return [
      {
        id: 'dataseries',
        name: props.symbol,
        data,
        type: 'line',

        tooltip: {
          valueDecimals: 2,
        },
      },
      {
        name: 'High/Low',
        shape: 'circlepin',
        type: 'flags',

        tooltip: {
          pointFormat: '<b>{point.text}</b>',
          valueDecimals: 2,
          split: true,
        },

        data: [
          {
            x: minTimestamp,
            title: 'L',
            text: `Low Price: $${formatCurrency(minPrice, 2)}`,
          },
          {
            x: maxTimestamp,
            title: 'H',
            text: `High Price: $${formatCurrency(maxPrice, 2)}`,
          },
        ].sort((a, b) => a.x - b.x),
        color: '#7cb5ec',
        fillColor: '#7cb5ec',
        style: {
          color: 'white',
        },
      },
      ...flags,
    ];
  }

  const getFlags = (type: string, onSeries?: boolean): Highcharts.SeriesFlagsOptions => {
    const isBuySell = ['buy', 'sell', 'reinvest', 'transfer'].includes(type);
    const _type = type === 'transfer' ? 'buy' : type;

    return {
      name: _.startCase(type),
      shape: 'squarepin',
      type: 'flags',
      onSeries: onSeries ? undefined : 'dataseries',
      width: 25,

      tooltip: {
        pointFormat: '<b>{point.text}</b><br />{point.account}',
        valueDecimals: 2,
      },

      data: props.position.transactions
        .filter(
          (t) =>
            t.type === _type &&
            (!['buy', 'sell'].includes(t.type) ||
              (type !== 'transfer' && !(t.description || '').toLowerCase().includes('transfer')) ||
              (type === 'transfer' && (t.description || '').toLowerCase().includes('transfer'))),
        )
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
              ? `${_.startCase(type)}: ${shares}@${transaction.price}`
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
  };

  function getOptions(): Highcharts.Options {
    const dividends = props.position.transactions
      .filter((transaction) => transaction.type === 'dividend')
      .reduce((dividend, transaction) => dividend + transaction.amount, 0);

    return {
      title: {
        text: `${props.symbol}`,
        style: {
          color: '#1F2A33',
          textDecoration: 'underline',
          fontWeight: 'bold',
        },
      },
      subtitle: {
        text: props.isPrivateMode
          ? 'Shares: -, Market Value: -, Profit: -'
          : `Shares: ${props.position.quantity}@${formatMoney(
              props.position.investments.reduce((cost, investment) => {
                return cost + investment.book_value;
              }, 0) / props.position.quantity,
            )}, Market Value: ${baseCurrencyDisplay} ${formatCurrency(
              props.position.market_value,
              2,
            )}, XIRR: ${formatMoney(props.position.xirr * 100)}%, P/L:  ${formatMoney(
              props.position.gain_percent * 100,
              2,
            )}% / ${baseCurrencyDisplay} ${formatCurrency(props.position.gain_amount, 2)}${
              dividends ? `, Dividends: ${baseCurrencyDisplay} ${formatCurrency(dividends, 2)}` : ''
            }`,
        style: {
          color: '#1F2A33',
          fontWeight: 'bold',
        },
      },

      rangeSelector: { selected: 1, enabled: true as any, inputEnabled: false },
      navigator: { enabled: true },
      scrollbar: { enabled: false },

      yAxis: [
        {
          crosshair: {
            dashStyle: 'Dash',
          },
          title: {
            text: 'Price ($)',
          },
          opposite: false,
        },
      ],
      tooltip: {
        pointFormat: '{series.name}: <b>${point.y}',
        valueDecimals: 2,
        split: true,
      },
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
              navigator: {
                enabled: false,
              },
            },
          },
        ],
      },
      series: getSeries(),
      legend: {
        enabled: true,
      },
    };
  }

  return loading ? (
    <div style={{ textAlign: 'center', margin: '12px' }}>
      <Spin size="large" />
    </div>
  ) : (
    <Charts constructorType="stockChart" options={getOptions()} />
  );
}

export default StockTimeline;
