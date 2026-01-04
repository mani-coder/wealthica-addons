import { Empty } from 'antd';
import type { Account, Position } from '../types';
import CashTable from './CashTable';
import HoldingsCharts from './HoldingsCharts';
import HoldingsTable from './HoldingsTable';
import PortfolioVisualizer from './PortfolioVisualizer';

type Props = {
  positions: Position[];
  accounts: Account[];
};

export default function Holdings({ positions, accounts }: Props) {
  return (
    <>
      {positions.length ? (
        <HoldingsCharts positions={positions} accounts={accounts} />
      ) : (
        <Empty description="No Holdings" />
      )}
      <CashTable accounts={accounts} />
      {!!positions.length && (
        <>
          <PortfolioVisualizer positions={positions} />
          <HoldingsTable positions={positions} />
        </>
      )}
    </>
  );
}
