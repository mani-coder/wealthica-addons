import type { Color, Timeline } from 'types';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const COLORS: Color[] = ['purple', 'pink', 'green', 'blue', 'yellow'];

export const TIMELINE_OPTIONS: { label: string; value: Timeline }[] = [
  { label: 'DAY', value: 'day' },
  { label: 'WEEK', value: 'week' },
  { label: 'MONTH', value: 'month' },
];
