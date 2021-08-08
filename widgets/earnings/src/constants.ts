import type { Color, Timeline } from 'types';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const COLORS: Color[] = ['yellow', 'pink', 'green', 'blue', 'indigo'];

export const TIMELINE_OPTIONS: { label: string; value: Timeline }[] = [
  { label: 'DAY', value: 'day' },
  { label: 'WEEK', value: 'week' },
  { label: 'MONTH', value: 'month' },
];

export let DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
