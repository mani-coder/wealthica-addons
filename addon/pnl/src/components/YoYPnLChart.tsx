/* eslint-disable react-hooks/exhaustive-deps */
import dayjs, { type Dayjs } from 'dayjs';
import React, { useMemo } from 'react';
import { trackEvent } from '../analytics';
import { DATE_DISPLAY_FORMAT, DATE_FORMAT } from '../constants';
import { useAddonContext } from '../context/AddonContext';
import type { Portfolio } from '../types';
import { formatCurrency, getPreviousWeekday } from '../utils/common';
import { calculateTimeWeightedReturns } from '../utils/portfolioPerformance';
import Charts from './Charts';
import Collapsible from './Collapsible';

type Props = {
  portfolios: Portfolio[];
};

function YoYPnLChart(props: Props) {
  const { isPrivateMode } = useAddonContext();
  const portfoliosByDate = props.portfolios.reduce((hash: { [key: string]: any }, portfolio) => {
    hash[portfolio.date] = portfolio;
    return hash;
  }, {});

  const getOptions = ({ series }: { series: any }): Highcharts.Options => {
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
        text: 'Time-Weighted Return Over Multiple Time Periods',
      },
      subtitle: {
        text: 'Returns remove the effect of external deposits and withdrawals within each period.',
        style: {
          color: '#1F2A33',
        },
      },
      xAxis: {
        type: 'category',
        labels: {
          // rotation: -45,
          style: {
            fontSize: '13px',
            fontFamily: 'Verdana, sans-serif',
          },
        },
      },

      yAxis: {
        labels: {
          enabled: !isPrivateMode,
          format: '{value}%',
        },
        title: {
          text: 'Time-Weighted Return (%)',
        },
      },

      plotOptions: {
        column: {
          zones: [
            {
              value: -0.00000001,
              color: '#FF897C',
            },
            {
              color: '#84C341',
            },
          ],
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

  const getNearestPortfolioDate = (date: string): Portfolio | undefined => {
    return portfoliosByDate[date];
  };

  const getData = () => {
    let currentPortfolio = props.portfolios[props.portfolios.length - 1];
    const currentDate = dayjs().utc();
    if (
      currentDate.format(DATE_FORMAT) === currentPortfolio.date &&
      currentDate.hour() < 20 &&
      props.portfolios.length > 1
    ) {
      currentPortfolio = props.portfolios[props.portfolios.length - 2];
    }
    if (dayjs(currentPortfolio.date).isoWeekday() > 5) {
      const weekday = getPreviousWeekday(currentPortfolio.date).format(DATE_FORMAT);
      currentPortfolio = portfoliosByDate[weekday];
    }

    const lastDate = currentPortfolio.date;

    // Calculate the time range between earliest and latest portfolio dates
    const earliestPortfolioDate = props.portfolios.length > 0 ? dayjs(props.portfolios[0].date) : dayjs(lastDate);
    const dataRangeMonths = dayjs(lastDate).diff(earliestPortfolioDate, 'months', true);
    const showShortPeriods = dataRangeMonths < 13;

    const portfolioKeys = new Set();
    const portfolioValues: {
      id: string;
      label: string;
      date: Dayjs;
      startPortfolio: Portfolio;
      endPortfolio: Portfolio;
    }[] = [];

    const timePeriods = [
      { id: '1D', label: '1 Day', date: getPreviousWeekday(lastDate) },
      ...(showShortPeriods
        ? [
            { id: '1M', label: '1 Month', date: dayjs(lastDate).subtract(1, 'months').add(1, 'days') },
            { id: '3M', label: '3 Months', date: dayjs(lastDate).subtract(3, 'months').add(1, 'days') },
            { id: '6M', label: '6 Months', date: dayjs(lastDate).subtract(6, 'months').add(1, 'days') },
            { id: '1Y', label: '1 Year', date: dayjs(lastDate).subtract(1, 'years').add(1, 'days') },
          ]
        : []),
      { id: 'MTD', label: 'Month To Date', date: dayjs(lastDate).startOf('month') },
      { id: 'WTD', label: 'Week To Date', date: dayjs(lastDate).startOf('week') },
      { id: 'YTD', label: 'Year To Date', date: dayjs(lastDate).startOf('year') },
    ];

    timePeriods.map((value) => {
      const portfolio = getNearestPortfolioDate(value.date.format(DATE_FORMAT));
      if (portfolio) {
        const key = `${portfolio.date}-${currentPortfolio.date}`;
        if (!portfolioKeys.has(key)) {
          portfolioValues.push({
            id: value.id,
            label: value.label,
            date: value.date,
            startPortfolio: portfolio,
            endPortfolio: currentPortfolio,
          });
          portfolioKeys.add(key);
        }
      }
      return null;
    });

    // Calculate how many fiscal years we can go back based on available data
    const currentYear = dayjs(lastDate).year();
    const earliestYear = earliestPortfolioDate.year();
    const yearsToGoBack = currentYear - earliestYear;

    // Generate fiscal years for all available years
    for (let i = 1; i <= yearsToGoBack; i++) {
      const year = dayjs(lastDate).subtract(i, 'years').year();
      const startDate = dayjs().year(year).startOf('year');
      const startPortfolio = getNearestPortfolioDate(startDate.format(DATE_FORMAT));
      const endPortfolio = getNearestPortfolioDate(dayjs().year(year).endOf('year').format(DATE_FORMAT));

      if (startPortfolio && endPortfolio) {
        const key = `${startPortfolio.date}-${endPortfolio.date}`;
        if (!portfolioKeys.has(key)) {
          portfolioValues.push({
            id: `FY ${year}`,
            label: `Jan - Dec ${year}`,
            date: startDate,
            startPortfolio,
            endPortfolio,
          });
          portfolioKeys.add(key);
        }
      }
    }

    const data = portfolioValues
      .filter((value) => value.endPortfolio.date !== value.startPortfolio.date)
      .sort((a, b) => (a.date.valueOf() > b.date.valueOf() ? 1 : -1))
      .map((value) => {
        const startPnl = value.startPortfolio.value - value.startPortfolio.deposits;
        const endPnl = value.endPortfolio.value - value.endPortfolio.deposits;

        const changeValue = endPnl - startPnl;
        const periodPortfolios = props.portfolios.filter(
          (portfolio) => portfolio.date >= value.startPortfolio.date && portfolio.date <= value.endPortfolio.date,
        );
        const periodReturns = calculateTimeWeightedReturns(periodPortfolios);
        const changeRatio = (periodReturns[periodReturns.length - 1]?.cumulativeReturn ?? 0) * 100;

        return {
          id: value.id,
          label: value.label,
          date: value.date.format(DATE_DISPLAY_FORMAT),
          startDate: dayjs(value.startPortfolio.date).format(DATE_DISPLAY_FORMAT),
          endDate: dayjs(value.endPortfolio.date).format(DATE_DISPLAY_FORMAT),
          startPnl,
          startValue: value.startPortfolio.value,
          endPnl,
          endValue: value.endPortfolio.value,
          changeRatio,
          changeValue,
          color: changeRatio >= 0 ? 'green' : 'red',
        };
      });

    const series: any[] = [
      {
        name: 'Time-Weighted Return',
        type: 'column',
        data: data.map((value) => ({
          key: value.id,
          name: value.id,
          label: value.label,
          y: value.changeRatio,

          startDate: value.startDate,
          startValue: !isPrivateMode ? formatCurrency(value.startValue, 2) : '-',

          endDate: value.endDate,
          endValue: !isPrivateMode ? formatCurrency(value.endValue, 2) : '-',

          changeValue: !isPrivateMode ? `$${formatCurrency(value.changeValue, 1)}` : '-',
        })),
        point: {
          events: {
            mouseOver: (e: any) => {
              trackEvent('mouse-over-point', {
                chart: 'pnl-change-over-periods',
                name: e?.target ? e.target.key : null,
              });
            },
          },
        },
        tooltip: {
          headerFormat: '',
          pointFormat: `<b style="font-size: 13px;">{point.label} ({point.key})</b><br /><b style="color: {point.color};font-size: 14px;">{point.y:.1f}% ({point.changeValue})</b><br /><hr />
            {point.startDate}: <b>\${point.startValue}</b><br />
            {point.endDate}: <b>\${point.endValue}</b><br />`,
        },
        dataLabels: {
          enabled: true,
          format: '{point.y:.1f}% ({point.changeValue})',
        },
        showInLegend: false,
      },
    ];

    return series;
  };

  const options = useMemo(() => {
    return getOptions({ series: getData() });
  }, [getData, getOptions]);

  return (
    <Collapsible title="Time-Weighted Return Over Multiple Time Periods">
      <Charts options={options} />
    </Collapsible>
  );
}

export default React.memo(YoYPnLChart);
