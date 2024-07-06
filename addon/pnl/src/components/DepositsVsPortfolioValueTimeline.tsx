import dayjs from 'dayjs';
import { startCase } from 'lodash';
import React, { useMemo } from 'react';
import { DATE_FORMAT, TYPE_TO_COLOR } from '../constants';
import type { CashFlow, Portfolio } from '../types';
import { formatMoney } from '../utils';
import Charts from './Charts';
import Collapsible from './Collapsible';

type Props = {
  portfolios: Portfolio[];
  cashflows: CashFlow[];
  isPrivateMode: boolean;
};

function DepositVsPortfolioValueTimeline(props: Props) {
  const cashflows = useMemo(() => {
    return props.cashflows
      .filter((cashflow) => cashflow.deposit || cashflow.withdrawal)
      .map((cashflow) => ({ ...cashflow, date: dayjs(cashflow.date, DATE_FORMAT) }))
      .sort((a, b) => a.date.valueOf() - b.date.valueOf());
  }, [props.cashflows]);
  console.debug('[DEBUG] Cash Flows', { cashflows: props.cashflows.filter((t) => t.deposit || t.withdrawal) });

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

      data: cashflows
        .filter((t) => Math.abs(t[type]) > 1)
        .map((t) => {
          return {
            t,
            x: t.date.valueOf(),
            title: type.charAt(0).toUpperCase(),
            text: `${startCase(type)}: $${formatMoney(t[type], 2)}`,
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
            x: dayjs(portfolio.date).valueOf(),
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
            x: dayjs(portfolio.date).valueOf(),
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
        buttonTheme: {
          style: {
            display: 'none',
          },
        },
        dropdown: 'always',
        buttonPosition: {
          align: 'right',
        },
        selected: 1,
        enabled: true as any,
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
