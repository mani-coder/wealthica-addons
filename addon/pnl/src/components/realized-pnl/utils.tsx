import { Typography } from 'antd';

import type { Dayjs } from 'dayjs';
import type { Account, Transaction } from '../../types';

export type ClosedPosition = {
  key: string;
  date: Dayjs;
  symbol: string;
  currency: string;
  shares: number;

  buyDate: Dayjs;
  buyPrice: number;
  sellDate: Dayjs;
  sellPrice: number;

  buyCost: number;
  sellCost: number;
  pnl: number;
  pnlRatio: number;
  account?: Account;
  transactions: Transaction[];
};

export function renderSymbol(symbol: string, currency?: string, ticker?: string) {
  return (
    <>
      <Typography.Link
        rel="noreferrer noopener"
        href={`https://finance.yahoo.com/quote/${ticker ?? symbol}`}
        target="_blank"
      >
        {symbol}
      </Typography.Link>
      {currency && <div style={{ fontSize: 10 }}>{currency.toUpperCase()}</div>}
    </>
  );
}
