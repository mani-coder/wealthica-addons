export type EventType = 'earning' | 'ex-dividend' | 'pay-dividend' | 'record-dividend';

export type Position = {
  name: string;
  symbol: string;
  ticker: string;
  type: string;
  events: { type: EventType; date: string }[];
};

export type Timeline = 'day' | 'week' | 'month';

export type Color = 'blue' | 'gray' | 'green' | 'indigo' | 'pink' | 'purple' | 'red' | 'yellow';

export type EventSymbol = { type: EventType; symbol: string };
export type Event = { date: Date; symbols: EventSymbol[] };
