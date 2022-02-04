import ArrowDownOutlined from '@ant-design/icons/ArrowDownOutlined';
import ArrowUpOutlined from '@ant-design/icons/ArrowUpOutlined';
import Card from 'antd/lib/card';
import Statistic, { StatisticProps } from 'antd/lib/statistic';
import React from 'react';
import { Box, Flex } from 'rebass';
import { Portfolio, Position } from '../types';

function StatisticBox(props: StatisticProps) {
  return (
    <Box p={1}>
      <Statistic {...props} />
    </Box>
  );
}

type Props = {
  portfolios: Portfolio[];
  positions: Position[];
  privateMode: boolean;
  fromDate: string;
  toDate: string;
};

function PnLStatistics({ portfolios, privateMode, positions, fromDate, toDate }: Props) {
  const portfolio = portfolios[portfolios.length - 1];
  const marketValue = positions.reduce((value, position) => value + position.market_value, 0);
  const bookValue = positions.reduce((value, position) => value + position.book_value, 0);
  const noHoldings = positions.length === 0;
  const unrealizePnLValue = marketValue - bookValue;
  const unrealizedPnLRatio = unrealizePnLValue ? (unrealizePnLValue / bookValue) * 100 : 0;

  return (
    <Card bodyStyle={{ backgroundColor: '#f9f0ff' }} style={{ borderRadius: 6, borderColor: '#efdbff' }}>
      <Flex width={1} justifyContent="space-between" flexWrap="wrap">
        <StatisticBox title="Portfolio Value" value={privateMode ? '--' : portfolio.value} precision={2} prefix="$" />
        <StatisticBox
          title="All Time Deposits"
          value={privateMode ? '--' : portfolio.deposits}
          precision={2}
          prefix="$"
        />
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
        <StatisticBox
          title="Timeline P&L %"
          valueStyle={{ color: portfolio.value >= portfolio.deposits ? 'green' : 'red' }}
          value={((portfolio.value - portfolio.deposits) / Math.abs(portfolio.deposits)) * 100}
          precision={2}
          suffix="%"
          prefix={portfolio.value >= portfolio.deposits ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        />
        <StatisticBox
          title="Timeline P&L Value"
          valueStyle={{ color: portfolio.value >= portfolio.deposits ? 'green' : 'red' }}
          value={privateMode ? '--' : portfolio.value - portfolio.deposits}
          precision={privateMode ? undefined : 2}
          prefix="$"
        />
      </Flex>
    </Card>
  );
}

export default React.memo(PnLStatistics);
