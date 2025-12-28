import * as Highcharts from 'highcharts';
import { Select, Typography } from 'antd';

import { Account, Position } from '../types';
import { getSymbol } from '../utils/common';
import StockDetails from './StockDetails';

export const POSITION_TOOLTIP: Highcharts.TooltipOptions = {
  pointFormatter() {
    const point = this.options as any;
    return point.name !== 'Cash'
      ? `<table width="100%">
      <tr><td>Weightage</td><td class="position-tooltip-value">${(this as any).percentage.toFixed(1)}%</td></tr>
      <tr><td>Value</td><td class="position-tooltip-value">${point.baseCurrency} ${point.value}</td></tr>
      <tr><td>XIRR %</td><td class="position-tooltip-value" style="color: ${point.pnlColor};">${point.xirr ? point.xirr.toFixed(2) : 'n/a'
      }%</td></tr>
      <tr><td>Unrealized P/L %</td><td class="position-tooltip-value" style="color: ${point.pnlColor};">${point.gain ? point.gain.toFixed(2) : 'n/a'
      }%</td></tr>
      <tr><td>Unrealized P/L $</td><td class="position-tooltip-value" style="color: ${point.pnlColor};">${point.baseCurrency
      } ${point.profit}</td></tr>
      <tr><td>Shares</td><td style="text-align: right;">${point.shares}</td></tr>
      <tr><td>Currency</td><td style="text-align: right;">${point.currency}</td></tr>
      <tr><td>Buy Price</td><td style="text-align: right;">${point.buyPrice}</td></tr>
      <tr><td>Last Price</td><td style="text-align: right;">${point.lastPrice}</td></tr>
      <tr><td colspan="2"><hr /></td></tr>
      <tr style="font-weight: 600"><td>Account</td><td style="text-align: right;">Shares</td></tr>
      ${point.accountsTable}
    </table>`
      : `
      <table width="100%">
        <tr><td>Weightage</td><td class="position-tooltip-value">${(this as any).percentage.toFixed(1)}%</td></tr>
        <tr><td>Value</td><td class="position-tooltip-value">${point.baseCurrency} ${point.value}</td></tr>
        <tr><td colspan="2"><hr /></td></tr>
        <tr style="font-weight: 600"><td>Account</td><td style="text-align: right;">Cash</td></tr>
        ${point.accountsTable}
      </table>`;
  },
  headerFormat: '<b>{point.key}</b><hr />',
};

export const getOptions = ({
  title,
  yAxisTitle,
  subtitle,
  series,
  drilldown,
  isPrivateMode,
}: {
  series: any;
  title?: string;
  subtitle?: string;
  yAxisTitle?: string;
  drilldown?: Highcharts.DrilldownOptions;
  isPrivateMode?: boolean;
}): Highcharts.Options => {
  return {
    series,
    drilldown: drilldown ? drilldown : {},

    tooltip: {
      outside: true,

      useHTML: true,
      backgroundColor: '#FFF',
      style: {
        color: '#1F2A33',
      },
    },

    title: {
      text: title,
    },
    subtitle: {
      text: subtitle,
      style: {
        color: '#1F2A33',
      },
    },
    xAxis: {
      type: 'category',
      labels: {
        rotation: -45,
        style: {
          fontSize: '13px',
          fontFamily: 'Verdana, sans-serif',
        },
      },
    },

    yAxis: {
      labels: {
        enabled: !isPrivateMode,
      },
      title: {
        text: yAxisTitle,
      },
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
            yAxis: {
              labels: {
                enabled: false,
              },
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
  };
};

export function getOptionsV2({
  title,
  yAxisTitle,
  subtitle,
  series,
  isPrivateMode,
}: {
  series: (Highcharts.SeriesPieOptions | Highcharts.SeriesColumnOptions)[];
  title?: string;
  subtitle?: string;
  yAxisTitle?: string;
  isPrivateMode?: boolean;
}): Highcharts.Options {
  return {
    series,

    tooltip: {
      outside: true,

      useHTML: true,
      backgroundColor: '#FFF',
      style: {
        color: '#1F2A33',
      },
    },

    title: {
      text: title,
    },
    subtitle: {
      text: subtitle,
      style: {
        color: '#1F2A33',
      },
    },
    xAxis: {
      type: 'category',
      labels: {
        rotation: -45,
        style: {
          fontSize: '13px',
          fontFamily: 'Verdana, sans-serif',
        },
      },
    },

    yAxis: {
      labels: {
        enabled: !isPrivateMode,
      },
      title: {
        text: yAxisTitle,
      },
    },

    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f} %',
          style: {
            color: 'black',
          },
        },
      },
    },
  };
}

type StockSelectorProps = {
  positions: Position[];
  accounts: Account[];
  isPrivateMode: boolean;
  selectedSymbol?: string;
  setSelectedSymbol: (symbol: string) => void;
};
export const StockSelector = ({ positions, selectedSymbol, setSelectedSymbol, ...rest }: StockSelectorProps) => {
  const options = positions
    .map((position) => getSymbol(position.security))
    .sort()
    .map((symbol, index) => (
      <Select.Option key={index} value={symbol}>
        {symbol}
      </Select.Option>
    ));

  return (
    <div className="flex p-6 w-full flex-col space-y-2">
      <Typography.Title style={{ textAlign: 'center' }} level={4}>
        Search for a stock:
      </Typography.Title>
      <Select
        showSearch
        value={selectedSymbol}
        placeholder="Enter a stock, e.g: FB, SHOP.TO"
        className="w-full"
        onChange={(symbol) => setSelectedSymbol(symbol)}
        filterOption={(inputValue, option) =>
          (option!.props!.value! as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      >
        {options}
      </Select>

      {selectedSymbol && <StockDetails symbol={selectedSymbol} positions={positions} {...rest} />}
    </div>
  );
};
