import { Typography } from 'antd';

import { Moment } from 'moment';
import { Account, Transaction } from '../../types';

export type ClosedPosition = {
  key: string;
  date: Moment;
  symbol: string;
  currency: string;
  crypto: boolean;
  shares: number;

  buyDate: Moment;
  buyPrice: number;
  sellDate: Moment;
  sellPrice: number;

  buyCost: number;
  sellCost: number;
  pnl: number;
  pnlRatio: number;
  account?: Account;
  transactions: Transaction[];
};

export const DATE_DISPLAY_FORMAT = 'MMM DD, YYYY';

export function renderSymbol(symbol: string, currency?: string) {
  return (
    <>
      <Typography.Link rel="noreferrer noopener" href={`https://finance.yahoo.com/quote/${symbol}`} target="_blank">
        {symbol}
      </Typography.Link>
      {currency && <div style={{ fontSize: 10 }}>{currency === 'usd' ? 'USD' : 'CAD'}</div>}
    </>
  );
}
