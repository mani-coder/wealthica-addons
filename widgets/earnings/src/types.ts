type EventType = 'earning' | 'ex-dividend' | 'pay-dividend' | 'record-dividend';

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

export type Timeline = 'day' | 'week';

export type Color =
  | 'blue'
  | 'brown'
  | 'desert'
  | 'gray'
  | 'green'
  | 'indigo'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow';
