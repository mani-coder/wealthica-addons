import { Spin } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { startCase } from '../utils/lodash-replacements';
import { trackEvent } from '../analytics';
import { DATE_FORMAT, TYPE_TO_COLOR } from '../constants';
import useCurrency from '../hooks/useCurrency';
import { Account, Position, Transaction } from '../types';
import { buildCorsFreeUrl, formatCurrency, formatMoney, getDate } from '../utils/common';
import Charts from './Charts';

type Props = {
  symbol: string;
  position: Position;
  isPrivateMode: boolean;
  addon?: any;
  accounts: Account[];
};

type SecurityHistoryTimeline = {
  timestamp: Dayjs;
  closePrice: number;
};

function StockTimeline(props: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const { baseCurrencyDisplay } = useCurrency();
  const [securityTimeline, setSecurityTimeline] = useState<SecurityHistoryTimeline[]>([]);

  const accountById = useMemo(() => {
    return props.accounts.reduce(
      (hash: { [key: string]: any }, account) => {
        hash[account.id] = account;
        return hash;
      },
      {} as { [K: string]: Account },
    );
  }, [props.accounts]);

  function getAccountName(accountId: string) {
    const account = accountById[accountId];
    return account ? account.name : accountById;
  }

  const parseSecuritiesResponse = useCallback((response: any) => {
    let to = getDate(response.to);
    const data: SecurityHistoryTimeline[] = [];
    let prevPrice: number | undefined;
    response.data
      .filter((closePrice: number) => closePrice)
      .reverse()
      .forEach((closePrice: number) => {
        if (!prevPrice) {
          prevPrice = closePrice;
        }
        const changePercentage = Math.abs((closePrice - prevPrice) / closePrice) * 100;
        if (changePercentage > 200) {
          closePrice = prevPrice;
        }

        if (to.isoWeekday() <= 5) {
          data.push({ timestamp: to.clone(), closePrice });
        }

        // Move the date forward.
        to = to.subtract(1, 'days');
        prevPrice = closePrice;
      });

    setSecurityTimeline(data.sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf()));
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    trackEvent('stock-timeline');

    const startDate =
      dayjs.min(
        (props.position.transactions && props.position.transactions.length
          ? props.position.transactions[0].date
          : dayjs()
        )
          .clone()
          .subtract(1, 'months'),
        dayjs().subtract(6, 'months'),
      ) ?? dayjs();

    const endpoint = `securities/${props.position.security.id}/history?from=${startDate.format(
      DATE_FORMAT,
    )}&to=${dayjs().format(DATE_FORMAT)}`;
    if (props.addon) {
      props.addon
        .request({
          query: {},
          method: 'GET',
          endpoint,
        })
        .then((response: any) => {
          parseSecuritiesResponse(response);
        })
        .catch((error: any) => console.log(error))
        .finally(() => setLoading(false));
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
        .then((response: any) => {
          parseSecuritiesResponse(response);
        })
        .catch((error: any) => console.log(error))
        .finally(() => setLoading(false));
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
    let minPrice: number | undefined,
      maxPrice: number | undefined,
      minTimestamp: number | undefined,
      maxTimestamp: number | undefined;
    securityTimeline.forEach((_data, index) => {
      const timestamp = _data.timestamp.valueOf();
      const closePrice = _data.closePrice;

      data.push({ x: timestamp, y: closePrice });

      if (index === 0) {
        maxPrice = minPrice = closePrice;
        minTimestamp = maxTimestamp = timestamp;
      }
      if (minPrice !== undefined && closePrice < minPrice) {
        minPrice = closePrice;
        minTimestamp = timestamp;
      }
      if (maxPrice !== undefined && closePrice > maxPrice) {
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
        color: '#10b981',

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
            text: `Low Price: $${formatCurrency(minPrice ?? 0, 2)}`,
          },
          {
            x: maxTimestamp,
            title: 'H',
            text: `High Price: $${formatCurrency(maxPrice ?? 0, 2)}`,
          },
        ].sort((a, b) => (a.x ?? 0) - (b.x ?? 0)),
        color: '#10b981',
        fillColor: '#10b981',
        style: {
          color: 'white',
        },
      },
      ...flags,
    ];
  }

  const getFlags = (type: string, onSeries?: boolean): any => {
    const isBuySell = ['buy', 'sell', 'reinvest', 'transfer'].includes(type);
    const _type = type === 'transfer' ? 'buy' : type;

    return {
      name: startCase(type),
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
              ? `${startCase(type)}: ${shares}@${transaction.price}`
              : `${startCase(type)}: $${formatCurrency(transaction.amount, 2)}`,
            account: getAccountName(transaction.account),
          };
        }),
      color: (TYPE_TO_COLOR as { [key: string]: any })[type],
      fillColor: (TYPE_TO_COLOR as { [key: string]: any })[type],
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
