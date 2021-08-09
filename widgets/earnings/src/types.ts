export type Position = {
  name: string;
  symbol: string;
  ticker: string;
  type: string;
  earningDates: string[];
};

export type Timeline = 'day' | 'week' | 'month';

export type Color = 'blue' | 'gray' | 'green' | 'indigo' | 'pink' | 'purple' | 'red' | 'yellow';

export type Earning = { date: Date; symbols: string[] };
