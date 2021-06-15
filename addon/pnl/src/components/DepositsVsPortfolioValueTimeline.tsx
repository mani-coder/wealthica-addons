import startCase from 'lodash/startCase';
import moment, { Moment } from 'moment';
import React, { useMemo } from 'react';
import { TYPE_TO_COLOR } from '../constants';
import type { Account, AccountTransaction, Portfolio } from '../types';
import { formatMoney } from '../utils';
import Charts from './Charts';
import Collapsible from './Collapsible';

type Props = {
  portfolios: Portfolio[];
  accounts: Account[];
  accountTransactions: AccountTransaction[];
  isPrivateMode: boolean;
};

function DepositVsPortfolioValueTimeline(props: Props) {
  const accountById = useMemo(() => {
    return props.accounts.reduce((hash, account) => {
      hash[account.id] = account;
      return hash;
    }, {} as { [K: string]: Account });
  }, [props.accounts]);

  function getFlags(type: string): Highcharts.SeriesFlagsOptions {
    return {
      name: startCase(type),
      shape: 'squarepin',
      type: 'flags',
      width: 25,

      stackDistance: 20,

      tooltip: {
        pointFormat: '{point.text}',
      },

      data: props.accountTransactions
        .filter((t) => t.type === type)
        .sort((a, b) => a.date.valueOf() - b.date.valueOf())
        .reduce((array, transaction) => {
          const lastTransaction = array.pop();
          if (lastTransaction && lastTransaction.date.valueOf() === transaction.date.valueOf()) {
            array.push({
              ...lastTransaction,
              amount: transaction.amount + lastTransaction.amount,
              transactions: lastTransaction.transactions.concat(transaction),
            });
          } else {
            if (lastTransaction) {
              array.push(lastTransaction);
            }
            array.push({ ...transaction, transactions: [transaction] });
          }
          return array;
        }, [] as { type: string; date: Moment; amount: number; transactions: AccountTransaction[] }[])
        .map((transaction) => {
          return {
            x: transaction.date.valueOf(),
            title: type.charAt(0).toUpperCase(),
            text: `<b>${startCase(type)}</b><br /><br />
              ${transaction.transactions
                .map((t) => {
                  const account = accountById[t.account] ? accountById[t.account].name : 'N/A';
                  return `<span>${account}: <b>$${formatMoney(t.amount, 0)}</b></span>`;
                })
                .join('<br />')}
            `,
          };
        }),
      color: TYPE_TO_COLOR[type],
      fillColor: TYPE_TO_COLOR[type],
      style: {
        color: 'white', // text style
      },
    };
  }

  function getSeries(): any {
    return [
      {
        id: 'portfolio',
        name: 'Portfolio',
        data: props.portfolios.map((portfolio) => {
          return {
            x: moment(portfolio.date).valueOf(),
            y: portfolio.value,
            displayValue: props.isPrivateMode ? '-' : Number(portfolio.value.toFixed(2)).toLocaleString(),
          };
        }),
        type: 'spline',
        color: '#4E2E5E',
      },
      {
        id: 'deposits',
        name: 'Deposits',
        data: props.portfolios.map((portfolio) => {
          return {
            x: moment(portfolio.date).valueOf(),
            y: portfolio.deposits,
            displayValue: props.isPrivateMode ? '-' : Number(portfolio.deposits.toFixed(2)).toLocaleString(),
          };
        }),
        type: 'spline',
        color: '#C00316',
      },
      ...['deposit', 'withdrawal'].map((type) => getFlags(type)),
    ];
  }

  function getOptions(): Highcharts.Options {
    return {
      title: {
        text: 'Deposits Vs Portfolio Value',
      },
      subtitle: {
        text: 'This chart shows the total (deposits - withdrawals) made by you and the value of your portfolio value over the selected period of time.',
        style: {
          color: '#1F2A33',
        },
      },

      rangeSelector: {
        selected: 1,
        enabled: (process.env.NODE_ENV === 'development') as any,
        inputEnabled: false,
      },
      navigator: { enabled: true },
      scrollbar: { enabled: false },

      yAxis: [
        {
          crosshair: {
            dashStyle: 'Dash',
          },
          labels: {
            enabled: !props.isPrivateMode,
          },
          opposite: false,
        },
      ],
      plotOptions: {},
      tooltip: {
        pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.displayValue}</b><br/>',
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
              yAxis: [
                {
                  labels: {
                    enabled: false,
                  },
                },
                {
                  labels: {
                    enabled: false,
                  },
                },
              ],
              navigator: {
                enabled: false,
              },
            },
          },
        ],
      },
      legend: {
        enabled: true,
      },
      series: getSeries(),
    };
  }

  return (
    <Collapsible title="Deposits Vs Portfolio Value Timeline">
      <Charts constructorType={'stockChart'} options={getOptions()} />
    </Collapsible>
  );
}

export default React.memo(DepositVsPortfolioValueTimeline);
