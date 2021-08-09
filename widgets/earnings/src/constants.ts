import type { Color, Timeline } from 'types';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const COLORS: Color[] = ['pink', 'green', 'blue', 'indigo', 'yellow'];

export const TIMELINE_OPTIONS: { label: string; value: Timeline }[] = [
  { label: 'DAY', value: 'day' },
  { label: 'WEEK', value: 'week' },
  { label: 'MONTH', value: 'month' },
];

export let DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
