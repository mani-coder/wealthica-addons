import type { Position } from '@/types';

export type Dividend = {
  company: string;
  ticker: string;
  position: Position;
  exDate: string;
  payDate: string;
  recDate: string;
  amount: number;
  yield: number;
  estimatedIncome?: number; // Estimated income based on current holdings
};

export type Earning = {
  ticker: string;
  position: Position;
  date: string;
  company: string;
  periodEnding: string;
  eps: number;
  lastEps: number;
};

export type EventType = 'earning' | 'ex-dividend' | 'pay-dividend' | 'rec-dividend';
