type EventType = 'ex-dividend' | 'pay-dividend' | 'record-dividend';

type Event = {
  type: EventType;
  date: string;
};

export type Position = {
  name: string;
  symbol: string;
  ticker: string;
  type: string;
  events: Event[];
};

export type Timeline = 'day' | 'week' | 'month';

export type Color = 'blue' | 'gray' | 'green' | 'indigo' | 'pink' | 'purple' | 'red' | 'yellow';

export type DividendEventSymbol = { symbol: string; type: EventType };
export type Dividend = { date: Date; symbols: DividendEventSymbol[] };
