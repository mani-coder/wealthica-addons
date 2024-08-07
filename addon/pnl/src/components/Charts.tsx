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
    getTimezoneOffset: function (timestamp) {
      return TZ_OFFSET;
    },
  },
});

type Props = {
  options: Highcharts.Options;
  constructorType?: keyof typeof Highcharts;
};

export function Charts(props: Props) {
  const options = props.options;
  return !!options.series && !!options.series.length ? (
    <ErrorBoundary message="Failed to load the chart!">
      <HighchartsReact
        highcharts={Highcharts}
        constructorType={props.constructorType}
        options={options}
        oneToOne={true}
      />
    </ErrorBoundary>
  ) : (
    <></>
  );
}

export default React.memo(Charts);
