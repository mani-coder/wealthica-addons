export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATE_DISPLAY_FORMAT = 'MMM DD, YYYY';
export const DEFAULT_BASE_CURRENCY = 'cad';
export const TRANSACTIONS_FROM_DATE = '2010-01-01';

export const TYPE_TO_COLOR = {
  buy: '#9948d1',
  sell: '#FF897C',
  income: 'green',
  dividend: 'green',
  distribution: 'green',
  tax: 'brown',
  fee: 'brown',
  deposit: '#9254de',
  withdrawal: '#ff7875',
  reinvest: '#f759ab',
  transfer: '#c41d7f',
};

export const CHANGE_LOG_DATE_CACHE_KEY = '__pnl_change_log_date__';
export const CURRENCY_DISPLAY_CACHE_KEY = '__current_display_cache__';

// LocalStorage key that, when present, enables developer/debug-specific UI features
export const DEBUG_LOCAL_STORAGE_KEY = '__debug__';

export enum TabKeysEnum {
  PNL = 'pnl',
  HOLDINGS = 'holdings',
  GAINERS_LOSERS = 'gainers-losers',
  REALIZED_PNL = 'realized-pnl',
  ACTIVITIES = 'activities',
  NEWS = 'news',
  EVENTS = 'events',
  CHANGE_LOG = 'change-log',
  DASHBOARD_WIDGETS = 'dashboard-widgets',
}
