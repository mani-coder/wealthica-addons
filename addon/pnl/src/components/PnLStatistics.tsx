import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import { Card, Divider, Statistic, type StatisticProps, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import React from 'react';
import type { Portfolio, Position } from '../types';

function StatisticBox(props: StatisticProps & { tooltip?: string }) {
  return (
    <div className="p-1 mr-3 mb-1">
      <Statistic
        {...props}
        valueStyle={{ fontSize: '20px', fontWeight: 600, ...props.valueStyle }}
        title={
          props.tooltip ? (
            <Tooltip title={props.tooltip}>
              <span className="text-xs text-gray-600">
                {props.title} <QuestionCircleOutlined className="text-gray-400 text-[10px]" />
              </span>
            </Tooltip>
          ) : (
            <span className="text-xs text-gray-600">{props.title}</span>
          )
        }
      />
    </div>
  );
}

type Props = {
  xirr: number;
  portfolios: Portfolio[];
  positions: Position[];
  privateMode: boolean;
  fromDate: string;
  toDate: string;
};

function PnLStatistics({ xirr, portfolios, privateMode, positions, fromDate, toDate }: Props) {
  const portfolio = portfolios[portfolios.length - 1];
  const marketValue = positions.reduce((value, position) => value + position.market_value, 0);
  const bookValue = positions.reduce((value, position) => value + position.book_value, 0);
  const noHoldings = positions.length === 0;
  const unrealizePnLValue = marketValue - bookValue;
  const unrealizedPnLRatio = unrealizePnLValue ? (unrealizePnLValue / bookValue) * 100 : 0;

  const startPortfolio = portfolios.find((portfolio) => portfolio.date === fromDate);

  let timelineDeposits: number | undefined,
    timelinePnlChangeValue: number | undefined,
    timelinePnlChangeRatio = 0;
  if (startPortfolio) {
    const endPortfolio = portfolio;
    timelineDeposits = portfolio.deposits - startPortfolio.deposits;
    const startPnl = startPortfolio.value - startPortfolio.deposits;
    const endPnl = endPortfolio.value - endPortfolio.deposits;

    const startRatio = (startPnl / Math.abs(startPortfolio.deposits)) * 100;
    const endRatio = (endPnl / Math.abs(endPortfolio.deposits)) * 100;

    timelinePnlChangeValue = endPnl - startPnl;
    timelinePnlChangeRatio = endRatio - startRatio;
  }

  const fromDateDisplay = dayjs(fromDate).format('MMM DD, YY');
  const toDateDisplay = dayjs(toDate).format('MMM DD, YY');

  console.debug('PnL Statistics', { fromDate, toDate, startPortfolio, portfolios });

  return (
    <Card
      styles={{ body: { backgroundColor: '#ecfdf5', padding: '12px 16px' } }}
      className="rounded-md border-[#a7f3d0]"
    >
      <div className="flex w-full justify-between flex-wrap">
        <StatisticBox
          title="Current Portfolio Value"
          value={privateMode ? '--' : portfolio.value}
          precision={2}
          prefix="$"
        />
        <StatisticBox
          title="All Time Deposits"
          value={privateMode ? '--' : portfolio.deposits}
          precision={2}
          prefix="$"
        />
        <StatisticBox
          title="XIRR %"
          valueStyle={{ color: xirr > 0 ? 'green' : 'red' }}
          value={xirr * 100}
          precision={2}
          suffix="%"
          prefix={xirr >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        />

        <Divider style={{ marginTop: 8, marginBottom: 8 }} />

        <StatisticBox
          title="All Time P&L %"
          valueStyle={{ color: portfolio.value >= portfolio.deposits ? 'green' : 'red' }}
          value={((portfolio.value - portfolio.deposits) / Math.abs(portfolio.deposits)) * 100}
          precision={2}
          suffix="%"
          prefix={portfolio.value >= portfolio.deposits ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        />
        <StatisticBox
          title="All Time P&L Value"
          valueStyle={{ color: portfolio.value >= portfolio.deposits ? 'green' : 'red' }}
          value={privateMode ? '--' : portfolio.value - portfolio.deposits}
          precision={privateMode ? undefined : 2}
          prefix="$"
        />

        <StatisticBox
          title="Unrealized P&L Value"
          valueStyle={{ color: noHoldings ? 'grey' : unrealizePnLValue >= 0 ? 'green' : 'red' }}
          value={privateMode ? '--' : noHoldings ? 'N/A' : unrealizePnLValue}
          precision={privateMode ? undefined : 2}
          prefix={noHoldings ? undefined : '$'}
        />
        <StatisticBox
          title="Unrealized P&L %"
          valueStyle={{ color: noHoldings ? 'grey' : unrealizedPnLRatio >= 0 ? 'green' : 'red' }}
          value={privateMode ? '--' : noHoldings ? 'N/A' : unrealizedPnLRatio}
          precision={privateMode ? undefined : 2}
          suffix={noHoldings ? undefined : '%'}
          prefix={noHoldings ? undefined : unrealizedPnLRatio >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        />

        {startPortfolio && (
          <>
            <Divider className="my-2" />

            <div className="flex w-full justify-center mb-1">
              <Typography.Text strong style={{ fontSize: '13px' }}>
                {fromDateDisplay} - {toDateDisplay}
              </Typography.Text>
            </div>

            <StatisticBox
              title="Deposits"
              tooltip={`Net new cash (deposits - withdrawals) between ${fromDateDisplay} & ${toDateDisplay}`}
              value={privateMode ? '--' : timelineDeposits}
              precision={2}
              prefix="$"
            />
            <StatisticBox
              title="P/L % Change"
              tooltip={`P/L Ratio change from ${fromDateDisplay} to ${toDateDisplay}`}
              valueStyle={{ color: timelinePnlChangeRatio >= 0 ? 'green' : 'red' }}
              value={timelinePnlChangeRatio}
              precision={2}
              suffix="%"
              prefix={timelinePnlChangeRatio >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
            <StatisticBox
              title="P/L $ Change"
              tooltip={`P/L Value change from ${fromDateDisplay} to ${toDateDisplay}`}
              valueStyle={{ color: timelinePnlChangeValue ? (timelinePnlChangeValue >= 0 ? 'green' : 'red') : 'grey' }}
              value={privateMode ? '--' : timelinePnlChangeValue}
              precision={privateMode ? undefined : 2}
              prefix="$"
            />
          </>
        )}
      </div>
    </Card>
  );
}

export default React.memo(PnLStatistics);
