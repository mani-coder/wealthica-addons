/* eslint-disable react-hooks/exhaustive-deps */
import type * as Highcharts from 'highcharts';
import { useMemo, useState } from 'react';

import { useAddonContext } from '../context/AddonContext';
import useCurrency from '../hooks/useCurrency';
import type { Account, Position } from '../types';
import { getOptions, getOptionsV2, POSITION_TOOLTIP } from '../utils/chartHelpers';
import { formatCurrency, formatMoney, getSymbol } from '../utils/common';
import Charts from './Charts';
import Collapsible from './Collapsible';
import CompositionCharts from './CompositionCharts';
import { StockHealthCheck } from './health-check/StockHealthCheck';
import SectorAllocation from './SectorAllocation';
import { StockSelector } from './StockSelector';
import StockTimeline from './StockTimeline';

type Props = {
  positions: Position[];
  accounts: Account[];
};

export default function HoldingsCharts(props: Props) {
  const [timelineSymbol, setTimelineSymbol] = useState<string>();
  const { isPrivateMode } = useAddonContext();
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
          .filter((value): value is { name: string; quantity: number; price: string } => !!value)
          .sort((a, b) => b.quantity - a.quantity)
          .map(
            (value) =>
              `<tr><td>${value.name}</td><td style="text-align: right;">${value.quantity}@${value.price}</td></tr>`,
          )
          .join('');

        return {
          name: symbol.slice(-10),
          symbol,
          y: position.market_value,
          baseCurrency: baseCurrencyDisplay,
          displayValue: isPrivateMode ? '-' : formatCurrency(position.market_value, 1),
          value: isPrivateMode ? '-' : formatMoney(position.market_value),
          gain: position.gain_percent ? position.gain_percent * 100 : position.gain_percent,
          xirr: position.xirr ? position.xirr * 100 : position.xirr,
          profit: isPrivateMode ? '-' : formatMoney(position.gain_amount),
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
          enabled: !isPrivateMode,
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
      return null;
    }
    const position = props.positions.filter((position) => getSymbol(position.security) === timelineSymbol)[0];

    if (!position) {
      return null;
    }

    return (
      <div className="p-2 space-y-2">
        <StockTimeline symbol={timelineSymbol} position={position} accounts={props.accounts} />
        <StockHealthCheck position={position} showBenchmarkSelector />
      </div>
    );
  };

  const { pie, column } = useMemo(() => {
    return getPositionsSeries();
  }, [getPositionsSeries]);

  const columnChartOptions = useMemo(
    () =>
      getOptions({
        title: 'Your Holdings',
        yAxisTitle: 'Market Value ($)',
        subtitle: '(click on a stock to view transactions)',
        series: [column],
        isPrivateMode,
      }),
    [column, isPrivateMode],
  );
  const pieChartOptions = useMemo(
    () =>
      getOptionsV2({
        subtitle: '(click on a stock to view timeline and transactions)',
        series: [pie],
        isPrivateMode,
      }),
    [pie, isPrivateMode],
  );

  return (
    <>
      <Collapsible title="Holdings">
        <Charts options={columnChartOptions} />

        <div className="flex w-full flex-wrap items-stretch">
          <div className="flex justify-center w-2/3 h-full">
            <Charts options={pieChartOptions} />
          </div>

          <div className="flex justify-center w-1/3 h-full">
            <StockSelector
              positions={props.positions}
              accounts={props.accounts}
              isPrivateMode={isPrivateMode}
              selectedSymbol={timelineSymbol}
              setSelectedSymbol={setTimelineSymbol}
            />
          </div>
        </div>

        {renderStockTimeline()}
      </Collapsible>

      <CompositionCharts positions={props.positions} accounts={props.accounts} />

      <SectorAllocation accounts={props.accounts} />
    </>
  );
}
