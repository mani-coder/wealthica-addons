import { Card, Spin } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '../analytics';
import { TYPE_TO_COLOR } from '../constants';
import { type SecurityPriceData, useSecurityHistory } from '../hooks/useSecurityHistory';
import type { Account, Position, Transaction } from '../types';
import { formatCurrency, formatMoney } from '../utils/common';
import { startCase } from '../utils/lodash-replacements';
import Charts from './Charts';

type Props = {
  symbol: string;
  position: Position;
  accounts: Account[];
};

function StockTimeline(props: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [securityTimeline, setSecurityTimeline] = useState<SecurityPriceData[]>([]);
  const { fetchSecurityHistory } = useSecurityHistory();

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    trackEvent('stock-timeline');

    const startDate =
      dayjs.min(
        (props.position.transactions?.length ? props.position.transactions[0].date : dayjs())
          .clone()
          .subtract(1, 'months'),
        dayjs().subtract(6, 'months'),
      ) ?? dayjs();

    try {
      const data = await fetchSecurityHistory(props.position.security.id, startDate, dayjs());
      setSecurityTimeline(data);
    } catch (error) {
      console.error('Failed to load stock prices:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchSecurityHistory, props.position.security.id, props.position.transactions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
              ? `${startCase(type)}: ${shares}@${formatMoney(transaction.price)}`
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
    return {
      rangeSelector: { selected: 1, enabled: true },
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
        pointFormat: '{series.name}: <b>' + '$' + '{point.y}',
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

  return (
    <Card title={`${props.symbol} History`} variant="outlined" styles={{ body: { padding: 2 } }}>
      {loading ? (
        <div style={{ textAlign: 'center', margin: '12px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Charts constructorType="stockChart" options={getOptions()} />
      )}
    </Card>
  );
}

export default StockTimeline;
