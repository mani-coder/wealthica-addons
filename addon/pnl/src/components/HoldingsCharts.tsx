/* eslint-disable react-hooks/exhaustive-deps */
import * as Highcharts from 'highcharts';
import { useMemo, useState } from 'react';

import useCurrency from '../hooks/useCurrency';
import { Account, Position } from '../types';
import { formatCurrency, formatMoney, getSymbol } from '../utils/common';
import Charts from './Charts';
import CompositionCharts from './CompositionCharts';
import { StockSelector } from './HoldingsChartsBase';
import { POSITION_TOOLTIP, getOptions, getOptionsV2 } from '../utils/chartHelpers';
import StockTimeline from './StockTimeline';

type Props = {
  positions: Position[];
  accounts: Account[];
  isPrivateMode: boolean;
  addon?: any;
};

export default function HoldingsCharts(props: Props) {
  const [timelineSymbol, setTimelineSymbol] = useState<string>();
  const { baseCurrencyDisplay } = useCurrency();

  const getPositionsSeries = (): {
    column: Highcharts.SeriesColumnOptions;
    pie: Highcharts.SeriesPieOptions;
  } => {
    const totalValue = props.positions.reduce((sum, position) => sum + position.market_value, 0);
    const data = props.positions
      .sort((a, b) => b.market_value - a.market_value)
      .map((position) => {
        const symbol = getSymbol(position.security);

        const accountsTable = (props.accounts || [])
          .map((account) => {
            const position = account.positions.filter((position) => position.symbol === symbol)[0];
            return position
              ? {
                  name: account.name,
                  quantity: position.quantity,
                  price: formatMoney(position.book_value / position.quantity),
                }
              : undefined;
          })
          .filter((value) => value)
          .sort((a, b) => b!.quantity - a!.quantity)
          .map(
            (value) =>
              `<tr><td>${value!.name}</td><td style="text-align: right;">${value!.quantity}@${value!.price}</td></tr>`,
          )
          .join('');

        return {
          name: symbol.slice(-10),
          symbol,
          y: position.market_value,
          baseCurrency: baseCurrencyDisplay,
          displayValue: props.isPrivateMode ? '-' : formatCurrency(position.market_value, 1),
          value: props.isPrivateMode ? '-' : formatMoney(position.market_value),
          gain: position.gain_percent ? position.gain_percent * 100 : position.gain_percent,
          xirr: position.xirr ? position.xirr * 100 : position.xirr,
          profit: props.isPrivateMode ? '-' : formatMoney(position.gain_amount),
          percentage: (position.market_value / totalValue) * 100,
          buyPrice: formatMoney(
            position.investments.reduce((cost, investment) => cost + investment.book_value, 0) / position.quantity,
          ),
          shares: position.quantity,
          lastPrice: formatMoney(position.security.last_price),
          currency: position.security.currency ? position.security.currency.toUpperCase() : position.security.currency,
          accountsTable,
          pnlColor: position.gain_amount > 0 ? 'green' : 'red',
        };
      });

    const events = {
      click: (event: any) => {
        if (event.point.name && timelineSymbol !== event.point.name) {
          setTimelineSymbol((event.point as any).symbol);
        }
      },
    };

    return {
      column: {
        type: 'column',
        id: 'Holdings Column',
        name: 'Holdings',
        colorByPoint: true,
        data: data as any,
        events,
        tooltip: POSITION_TOOLTIP,
        dataLabels: {
          enabled: !props.isPrivateMode,
          format: '{point.displayValue}',
        },
        showInLegend: false,
      },
      pie: {
        type: 'pie' as const,
        id: 'Holdings Pie',
        name: 'Holdings',

        data: data.map((position) => ({ ...position, drilldown: undefined })) as any,
        events,

        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f} %',
          style: {
            color: 'black',
          },
        },

        tooltip: POSITION_TOOLTIP,
      },
    };
  };

  const renderStockTimeline = () => {
    if (!timelineSymbol) {
      return <></>;
    }
    const position = props.positions.filter((position) => getSymbol(position.security) === timelineSymbol)[0];

    if (!position) {
      return <></>;
    }

    return (
      <StockTimeline
        isPrivateMode={props.isPrivateMode}
        symbol={timelineSymbol}
        position={position}
        addon={props.addon}
        accounts={props.accounts}
      />
    );
  };

  const { pie, column } = useMemo(() => {
    return getPositionsSeries();
  }, [props.accounts, props.positions, props.isPrivateMode]);

  const columnChartOptions = useMemo(
    () =>
      getOptions({
        title: 'Your Holdings',
        yAxisTitle: 'Market Value ($)',
        subtitle: '(click on a stock to view transactions)',
        series: [column],
        isPrivateMode: props.isPrivateMode,
      }),
    [column, props.isPrivateMode],
  );
  const pieChartOptions = useMemo(
    () =>
      getOptionsV2({
        subtitle: '(click on a stock to view timeline and transactions)',
        series: [pie],
        isPrivateMode: props.isPrivateMode,
      }),
    [pie, props.isPrivateMode],
  );

  return (
    <>
      <Charts options={columnChartOptions} />

      <div className="flex w-full flex-wrap items-stretch">
        <div className="flex justify-center w-2/3 h-full">
          <Charts options={pieChartOptions} />
        </div>

        <div className="flex justify-center w-1/3 h-full">
          <StockSelector
            positions={props.positions}
            accounts={props.accounts}
            isPrivateMode={props.isPrivateMode}
            selectedSymbol={timelineSymbol}
            setSelectedSymbol={setTimelineSymbol}
          />
        </div>
      </div>

      {renderStockTimeline()}

      <CompositionCharts {...props} />
    </>
  );
}
