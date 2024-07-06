import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import { Card, Divider, Statistic, StatisticProps, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import React from 'react';
import { Box, Flex } from 'rebass';
import { Portfolio, Position } from '../types';

function StatisticBox(props: StatisticProps & { tooltip?: string }) {
  return (
    <Box p={1} mr={3}>
      <Statistic
        {...props}
        title={
          props.tooltip ? (
            <Tooltip title={props.tooltip}>
              {props.title} <QuestionCircleOutlined color="#8c8c8c" />
            </Tooltip>
          ) : (
            props.title
          )
        }
      />
    </Box>
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

  let timelineDeposits,
    timelinePnlChangeValue,
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
    <Card bodyStyle={{ backgroundColor: '#f9f0ff' }} style={{ borderRadius: 6, borderColor: '#efdbff' }}>
      <Flex width={1} justifyContent="space-between" flexWrap="wrap">
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

        <Divider style={{ marginTop: 12, marginBottom: 12 }} />

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
            <Divider style={{ marginTop: 12, marginBottom: 12 }} />

            <Flex width={1} mb={2} justifyContent="center">
              <Typography.Text strong>
                {fromDateDisplay} - {toDateDisplay}
              </Typography.Text>
            </Flex>

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
              valueStyle={{ color: timelinePnlChangeValue >= 0 ? 'green' : 'red' }}
              value={privateMode ? '--' : timelinePnlChangeValue}
              precision={privateMode ? undefined : 2}
              prefix="$"
            />
          </>
        )}
      </Flex>
    </Card>
  );
}

export default React.memo(PnLStatistics);
