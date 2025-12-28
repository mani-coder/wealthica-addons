import ErrorBoundary from 'antd/es/alert/ErrorBoundary';
import HighchartsReact from 'highcharts-react-official';
import * as Highcharts from 'highcharts/highstock';
import HC_DrillDown from 'highcharts/modules/drilldown';
import React from 'react';

HC_DrillDown(Highcharts);

const TZ_OFFSET = new Date().getTimezoneOffset();

Highcharts.setOptions({
  credits: {
    enabled: false,
  },
  plotOptions: {
    series: {
      turboThreshold: 10000,
    },
  },
  time: {
    getTimezoneOffset: function (_timestamp) {
      return TZ_OFFSET;
    },
  },
  rangeSelector: {
    buttonTheme: {
      states: {
        select: {
          fill: '#10b981',
        },
      },
    },
  },
  navigator: {
    maskFill: 'rgba(16, 185, 129, 0.3)',
  },
});

type Props = {
  options: Highcharts.Options;
  constructorType?: keyof typeof Highcharts;
};

export function Charts(props: Props) {
  const options = {
    ...props.options,
    chart: {
      ...props.options.chart,
      width: null, // Let chart use full container width
      reflow: true, // Enable automatic reflow
    },
  };

  return !!options.series && !!options.series.length ? (
    <ErrorBoundary message="Failed to load the chart!">
      <div className="w-full">
        <HighchartsReact
          highcharts={Highcharts}
          constructorType={props.constructorType}
          options={options}
          oneToOne={true}
        />
      </div>
    </ErrorBoundary>
  ) : (
    <></>
  );
}

export default React.memo(Charts);
