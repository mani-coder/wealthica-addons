export const DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_BASE_CURRENCY = 'cad';
export const TRANSACTIONS_FROM_DATE = '2024-01-01';

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
