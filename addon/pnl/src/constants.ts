export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATE_DISPLAY_FORMAT = 'MMM DD, YYYY';
export const DEFAULT_BASE_CURRENCY = 'usd';
export const TRANSACTIONS_FROM_DATE = import.meta.env.DEV ? '2025-01-02' : '2000-01-01';

export const TYPE_TO_COLOR: { [key: string]: string } = {
  buy: '#3b82f6', // blue-500
  sell: '#f43f5e', // rose-500
  income: '#a855f7', // purple-500
  dividend: '#8b5cf6', // violet-500
  distribution: '#6366f1', // indigo-500
  tax: '#f97316', // orange-500
  fee: '#f59e0b', // amber-500
  deposit: '#10b981', // emerald-500
  withdrawal: '#ec4899', // pink-500
  reinvest: '#14b8a6', // teal-500
  transfer: '#06b6d4', // cyan-500
};

export const BENCHMARK_SERIES_OPTIONS: Highcharts.SeriesSplineOptions = {
  id: 'benchmark',
  type: 'spline',
  color: '#f59e0b',
  lineWidth: 2,
  dashStyle: 'ShortDash',
};

export const PORTFOLIO_SERIES_OPTIONS: Highcharts.SeriesSplineOptions = {
  id: 'portfolio',
  type: 'spline',
  color: '#10b981',
  lineWidth: 2,
};

export const CHANGE_LOG_DATE_CACHE_KEY = '__pnl_change_log_date__';
export const CURRENCY_DISPLAY_CACHE_KEY = '__current_display_cache__';

// LocalStorage key that, when present, enables developer/debug-specific UI features
export const DEBUG_LOCAL_STORAGE_KEY = '__debug__';

export enum TabKeysEnum {
  PNL = 'pnl',
  PERFORMANCE = 'performance',
  HOLDINGS = 'holdings',
  GAINERS_LOSERS = 'gainers-losers',
  HEALTH_CHECK = 'health-check',
  REALIZED_PNL = 'realized-pnl',
  ACTIVITIES = 'activities',
  NEWS = 'news',
  EVENTS = 'events',
  CHANGE_LOG = 'change-log',
  DASHBOARD_WIDGETS = 'dashboard-widgets',
}
