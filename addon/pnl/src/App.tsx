import { Addon } from '@wealthica/wealthica.js/index';
import { Alert, Badge } from 'antd';
import Typography from 'antd/es/typography';
import Text from 'antd/es/typography/Text';
import Empty from 'antd/lib/empty';
import Spin from 'antd/lib/spin';
import Tabs from 'antd/lib/tabs';
import _ from 'lodash';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';
import { Flex } from 'rebass';
import xirr from 'xirr';
import './App.less';
import { initTracking, trackEvent } from './analytics';
import {
  computeCashFlowByDate,
  parseAccountTransactionsResponse,
  parseCurrencyReponse,
  parseInstitutionsResponse,
  parsePortfolioResponse,
  parsePositionsResponse,
  parseSecurityTransactionsResponse,
} from './api';
import BuyMeACoffee from './components/BuyMeACoffee';
import CashTable from './components/CashTable';
import ChangeLog, { getNewChangeLogsCount, setChangeLogViewDate } from './components/ChangeLog';
import DepositVsPortfolioValueTimeline from './components/DepositsVsPortfolioValueTimeline';
import { Events } from './components/Events';
import HoldingsCharts from './components/HoldingsCharts';
import HoldingsTable from './components/HoldingsTable';
import News from './components/News';
import PnLStatistics from './components/PnLStatistics';
import PortfolioVisualizer from './components/PortfolioVisualizer';
import ProfitLossPercentageTimeline from './components/ProfitLossPercentageTimeline';
import ProfitLossTimeline from './components/ProfitLossTimeline';
import { TopGainersLosers } from './components/TopGainersLosers';
import YoYPnLChart from './components/YoYPnLChart';
import RealizedPnL from './components/realized-pnl/RealizedPnL';
import { DEFAULT_BASE_CURRENCY, TRANSACTIONS_FROM_DATE, TabKeysEnum } from './constants';
import { Currencies, CurrencyContextProvider } from './context/CurrencyContext';
import { Account, AccountTransaction, CashFlow, CurrencyCache, Portfolio, Position, Transaction } from './types';
import { computeBookValue, computeXIRR, formatMoney, getSymbol } from './utils';

type State = {
  securityTransactions: Transaction[];
  accountTransactions: AccountTransaction[];
  portfolios: Portfolio[];
  allPortfolios: Portfolio[];
  positions: Position[];
  accounts: Account[];
  cashflows: CashFlow[];
  newChangeLogsCount?: number;
  xirr: number;
  isLoaded: boolean;
};
type Record = { [K: string]: any };

export default function App() {
  const currencyRef = useRef<Currencies>(new Currencies(DEFAULT_BASE_CURRENCY, {}));
  const addOnOptionsRef = useRef<Record>({
    currency: DEFAULT_BASE_CURRENCY,
    privateMode: false,
    fromDate: TRANSACTIONS_FROM_DATE,
    toDate: moment().format('YYYY-MM-DD'),
  });
  const addOnOptions = addOnOptionsRef.current;
  const [isLoadingOnUpdate, setLoadingOnUpdate] = useState<boolean>(false);

  const getAddon = (addOnOptionsRef: React.RefObject<Record>): any => {
    function updateOptions(_addOnOptions: Record | null, options: Record) {
      if (!_addOnOptions) return;

      Object.keys(options).forEach((option) => {
        _addOnOptions[option] = options[option];
      });
    }

    try {
      const addon = new Addon(
        (window.location.search || '').includes('?developer') ? {} : { id: 'mani-coder/wealthica-portfolio-addon' },
      );

      addon.on('init', (options) => {
        console.debug('Addon initialization', options);
        updateOptions(addOnOptionsRef.current, options);
        load();
        initTracking(options.authUser && options.authUser.id);
      });

      addon.on('reload', () => {
        // Start reloading
        console.debug('Reload invoked!');
      });

      addon.on('update', (options) => {
        // Update according to the received options
        console.debug('Addon update - options: ', options);
        setLoadingOnUpdate(true);
        updateOptions(addOnOptionsRef.current, options);
        load();
        trackEvent('update');
      });

      return addon;
    } catch (error) {
      console.warn('Falied to load the addon -- ', error);
    }

    return null;
  };

  const addon = useRef(getAddon(addOnOptionsRef));

  const [state, setState] = useState<State>({
    securityTransactions: [],
    accountTransactions: [],
    portfolios: [],
    allPortfolios: [],
    positions: [],
    accounts: [],
    cashflows: [],
    xirr: 0,
    isLoaded: false,
  });

  function updateState(_state: Partial<State>) {
    setState({ ...state, ..._state });
  }

  async function loadCurrenciesCache(_baseCurrency: string, currencies: string[]) {
    const validCurrencies = currencies.filter((currency) => currency !== _baseCurrency);
    const loadCurrency = (currency: string) => {
      return fetch(`https://app.wealthica.com/api/currencies/${_baseCurrency}/history?base=${currency}`)
        .then((response) => response.json())
        .then((response) => parseCurrencyReponse(response))
        .catch((error) => console.error(`Failed to load currency for ${currency}`, error));
    };

    async function _loadCurrencies() {
      const values = await Promise.all(validCurrencies.map(loadCurrency));
      return validCurrencies.reduce((hash, currency, index) => {
        hash[currency] = values[index];
        return hash;
      }, {});
    }

    const loadedCurrencies = new Set(Object.keys(currencyRef.current.currencyCache ?? {}));
    if (currencyRef.current.currencyCache && validCurrencies.every((currency) => loadedCurrencies.has(currency))) {
      console.debug('Skip loading currencies afresh...', currencies);
      return currencyRef.current.currencyCache;
    }
    console.debug('Loading currencies data...', validCurrencies);
    const values = await _loadCurrencies();
    return values;
  }

  const load = _.debounce(() => loadData(), 100, { leading: true });

  async function loadData() {
    console.debug('[DEBUG] Load data begin --', { addOnOptions });
    currencyRef.current.setBaseCurrency(addOnOptions.currency);
    const [positions, portfolioByDate, transactions, accounts] = await Promise.all([
      loadPositions(addOnOptions),
      loadPortfolioData(addOnOptions),
      loadTransactions(addOnOptions),
      loadInstitutionsData(addOnOptions),
    ]);

    const currencyCache = await loadCurrenciesCache(
      addOnOptions.currency,
      Array.from(new Set(accounts.map((account) => account.currency))),
    );
    console.debug('Loaded data', {
      positions,
      portfolioByDate,
      transactions,
      accounts,
      currencyCache,
    });
    computePortfolios(positions, portfolioByDate, transactions, accounts, currencyCache);
  }

  function computePortfolios(
    positions: Position[],
    portfolioByDate: any,
    transactions: any,
    accounts: Account[],
    _currencyCache: CurrencyCache,
  ) {
    currencyRef.current.setCurrencyCache(_currencyCache);

    // Security transactions & XIRR computation
    const securityTransactions = parseSecurityTransactionsResponse(transactions, currencyRef.current);
    const securityTransactionsBySymbol = securityTransactions.reduce((hash, transaction) => {
      if (!hash[transaction.symbol]) {
        hash[transaction.symbol] = [];
      }
      hash[transaction.symbol].push(transaction);
      return hash;
    }, {});

    positions.forEach((position) => {
      position.transactions = securityTransactionsBySymbol[getSymbol(position.security)] || [];
      position.xirr = computeXIRR(position);
      computeBookValue(position, currencyRef.current);
    });

    const cashFlowByDate = computeCashFlowByDate(transactions, currencyRef.current);

    // Portfolio computation
    const portfolios: Portfolio[] = [];
    const sortedDates = Object.keys(portfolioByDate).sort();
    let depositsToDate = Object.keys(cashFlowByDate)
      .filter((date) => date < sortedDates[0])
      .reduce((deposits, date) => {
        const transaction = cashFlowByDate[date];
        deposits += transaction.deposit - transaction.withdrawal;
        return deposits;
      }, 0);

    sortedDates.forEach((date) => {
      const portfolioValue = portfolioByDate[date];
      const asOfTransactionValue = cashFlowByDate[date];
      if (asOfTransactionValue) {
        depositsToDate += asOfTransactionValue.deposit - asOfTransactionValue.withdrawal;
      }
      portfolios.push({ date, value: portfolioValue, deposits: depositsToDate });
    });

    // XIRR computation
    let xirrRate = 0;
    const values = Object.keys(cashFlowByDate).reduce((transactions, date) => {
      const portfolio = cashFlowByDate[date];
      const amount = portfolio.withdrawal - portfolio.deposit;
      if (amount !== 0) {
        transactions.push({ amount, when: new Date(date) });
      }
      return transactions;
    }, [] as { amount: number; when: Date }[]);

    const portfolio = portfolios[portfolios.length - 1];
    if (portfolio.value) {
      values.push({ when: new Date(portfolio.date), amount: portfolio.value });
    }

    try {
      xirrRate = xirr(values);
      console.debug('XIRR computation -- ', {
        values: values.map((value) => `${value.when.toLocaleDateString()}, ${formatMoney(value.amount)}`),
        xirrRate,
      });
    } catch (error) {
      console.warn('Unable to compute portfolio xirr -- ', error, values);
    }
    updateState({
      positions,
      securityTransactions,
      accountTransactions: parseAccountTransactionsResponse(transactions, currencyRef.current),
      allPortfolios: portfolios,

      cashflows: Object.values(cashFlowByDate),
      xirr: xirrRate,
      portfolios: portfolios.filter((portfolio) => moment(portfolio.date).isoWeekday() <= 5),

      isLoaded: true,
      accounts,
    });
    setLoadingOnUpdate(false);
  }

  function loadPortfolioData(options) {
    console.debug('Loading portfolio data.');
    const query = {
      from: options.fromDate,
      to: options.toDate,
      assets: false,
      groups: options.groupsFilter,
      institutions: options.institutionsFilter,
      investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
    };
    return addon.current
      .request({
        query,
        method: 'GET',
        endpoint: 'portfolio',
      })
      .then((response) => parsePortfolioResponse(response))
      .catch((error) => {
        console.error('Failed to load portfolio data.', error);
      });
  }

  function loadPositions(options) {
    console.debug('Loading positions data.');
    const query = {
      assets: false,
      groups: options.groupsFilter,
      institutions: options.institutionsFilter,
      investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
    };
    return addon.current
      .request({
        query,
        method: 'GET',
        endpoint: 'positions',
      })
      .then((response) => parsePositionsResponse(response))
      .catch((error) => {
        console.error('Failed to load position data.', error);
      });
  }

  function loadInstitutionsData(options) {
    console.debug('Loading institutions data..');
    const query = {
      assets: false,
      groups: options.groupsFilter,
      institutions: options.institutionsFilter,
      investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
    };
    return addon.current
      .request({
        query,
        method: 'GET',
        endpoint: 'institutions',
      })
      .then((response) =>
        parseInstitutionsResponse(
          response,
          options.groupsFilter ? options.groupsFilter.split(',') : [],
          options.institutionsFilter ? options.institutionsFilter.split(',') : [],
        ),
      )
      .catch((error) => {
        console.error('Failed to load institutions data.', error);
      });
  }

  function loadTransactions(options) {
    console.debug('Loading transactions data.');
    const fromDate = options.fromDate;
    const query = {
      assets: false,
      from: fromDate && fromDate < TRANSACTIONS_FROM_DATE ? fromDate : TRANSACTIONS_FROM_DATE,
      groups: options.groupsFilter,
      institutions: options.institutionsFilter,
      investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
    };
    return addon.current
      .request({
        query,
        method: 'GET',
        endpoint: 'transactions',
      })
      .then((response) => response)
      .catch((error) => {
        console.error('Failed to load transactions data.', error);
      });
  }

  async function loadStaticPortfolioData() {
    let institutionsData, portfolioData, positionsData, transactionsData;
    if (process.env.NODE_ENV === 'development') {
      [institutionsData, portfolioData, positionsData, transactionsData] = await Promise.all([
        import('./mocks/prod/institutions-prod.json').then((response) => response.default),
        import('./mocks/prod/portfolio-prod.json').then((response) => response.default),
        import('./mocks/prod/positions-prod.json').then((response) => response.default),
        import('./mocks/prod/transactions-prod.json').then((response) => response.default),
      ]);
    }

    if (!institutionsData || !institutionsData.length) {
      [institutionsData, portfolioData, positionsData, transactionsData] = await Promise.all([
        import('./mocks/institutions').then((response) => response.DATA),
        import('./mocks/portfolio').then((response) => response.DATA),
        import('./mocks/positions').then((response) => response.DATA),
        import('./mocks/transactions').then((response) => response.DATA),
      ]);
    }

    const portfolioByDate = parsePortfolioResponse(portfolioData);
    const positions = parsePositionsResponse(positionsData);
    const accounts = parseInstitutionsResponse(institutionsData);

    const currencyCache = await loadCurrenciesCache(
      currencyRef.current.baseCurrency,
      Array.from(new Set(accounts.map((account) => account.currency))),
    );

    computePortfolios(positions, portfolioByDate, transactionsData, accounts, currencyCache);
  }

  useEffect(() => {
    if (!addon.current) {
      setTimeout(() => loadStaticPortfolioData(), 0);
    }

    setTimeout(() => computeChangeLogCount(), 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addon.current]);

  function computeChangeLogCount() {
    const newChangeLogsCount = getNewChangeLogsCount();
    if (newChangeLogsCount) {
      updateState({ newChangeLogsCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  if (state.isLoaded) {
    console.debug('[DEBUG] Loaded State', { state, addOnOptions, isLoadingOnUpdate });
  }

  return (
    <CurrencyContextProvider currencyRef={currencyRef}>
      <Flex width={1} justifyContent="center">
        <div style={{ padding: 4, maxWidth: addon.current ? '100%' : 1100, width: '100%' }}>
          {state.isLoaded ? (
            <>
              {!addon.current && (
                <>
                  <p
                    style={{
                      fontWeight: 'bolder',
                      textAlign: 'center',
                      color: '#C00316',
                      textDecoration: 'underline',
                    }}
                  >
                    <img
                      src="/mani-coder/wealthica-portfolio-addon/favicon.png"
                      alt="favicon"
                      width="50"
                      height="50"
                      style={{ backgroundColor: '#fff' }}
                    />
                    !! This is sample data !!
                  </p>
                </>
              )}
              {isLoadingOnUpdate ? (
                <Flex width={1} justifyContent="center" alignItems="center">
                  <Spin size="small" />
                </Flex>
              ) : (
                <Flex width={1} justifyContent="center" alignItems="center">
                  <Alert
                    style={{ width: '100%', textAlign: 'center' }}
                    type="info"
                    banner
                    closable
                    message={
                      <>
                        All amounts are displayed in <b>{currencyRef.current.baseCurrency.toUpperCase()}</b>, as per
                        your currency preference.
                      </>
                    }
                  />
                </Flex>
              )}

              <Tabs
                defaultActiveKey={TabKeysEnum.PNL}
                onChange={(tab) => {
                  if (tab === 'change-log' && state.newChangeLogsCount) {
                    setChangeLogViewDate();
                    updateState({ newChangeLogsCount: undefined });
                  }
                  trackEvent('tab-change', { tab });
                }}
                size="large"
              >
                <Tabs.TabPane destroyInactiveTabPane forceRender tab="P&L Charts" key={TabKeysEnum.PNL}>
                  <PnLStatistics
                    xirr={state.xirr}
                    portfolios={state.allPortfolios}
                    privateMode={addOnOptions.privateMode}
                    positions={state.positions}
                    fromDate={addOnOptions.fromDate}
                    toDate={addOnOptions.toDate}
                  />

                  <DepositVsPortfolioValueTimeline
                    portfolios={state.portfolios}
                    cashflows={state.cashflows}
                    isPrivateMode={addOnOptions.privateMode}
                  />

                  <YoYPnLChart portfolios={state.allPortfolios} isPrivateMode={addOnOptions.privateMode} />
                  <ProfitLossPercentageTimeline
                    portfolios={state.portfolios}
                    isPrivateMode={addOnOptions.privateMode}
                  />
                  <ProfitLossTimeline portfolios={state.portfolios} isPrivateMode={addOnOptions.privateMode} />
                </Tabs.TabPane>

                <Tabs.TabPane forceRender tab="Holdings Analyzer" key={TabKeysEnum.HOLDINGS}>
                  {!!state.positions.length ? (
                    <HoldingsCharts
                      positions={state.positions}
                      accounts={state.accounts}
                      isPrivateMode={addOnOptions.privateMode}
                      addon={addon.current}
                    />
                  ) : (
                    <Empty description="No Holdings" />
                  )}

                  <CashTable accounts={state.accounts} isPrivateMode={addOnOptions.privateMode} />

                  {!!state.positions.length && (
                    <>
                      <PortfolioVisualizer positions={state.positions} />
                      <HoldingsTable positions={state.positions} isPrivateMode={addOnOptions.privateMode} />
                    </>
                  )}
                </Tabs.TabPane>

                <Tabs.TabPane destroyInactiveTabPane tab="Gainers/Losers" key={TabKeysEnum.GAINERS_LOSERS}>
                  <TopGainersLosers
                    positions={state.positions}
                    isPrivateMode={addOnOptions.privateMode}
                    addon={addon.current}
                    accounts={state.accounts}
                  />
                </Tabs.TabPane>

                <Tabs.TabPane destroyInactiveTabPane tab="Realized P&L" key={TabKeysEnum.REALIZED_PNL}>
                  <RealizedPnL
                    fromDate={addOnOptions.fromDate}
                    toDate={addOnOptions.toDate}
                    transactions={state.securityTransactions}
                    accountTransactions={state.accountTransactions}
                    accounts={state.accounts}
                    isPrivateMode={addOnOptions.privateMode}
                  />
                </Tabs.TabPane>

                <Tabs.TabPane destroyInactiveTabPane tab="News" key={TabKeysEnum.NEWS}>
                  <News positions={state.positions} />
                </Tabs.TabPane>

                <Tabs.TabPane destroyInactiveTabPane tab="Events" key={TabKeysEnum.EVENTS}>
                  <Events positions={state.positions} />
                </Tabs.TabPane>

                <Tabs.TabPane
                  destroyInactiveTabPane
                  tab={
                    <Badge count={state.newChangeLogsCount} overflowCount={9} offset={[15, 2]}>
                      Latest Changes
                    </Badge>
                  }
                  key={TabKeysEnum.CHANGE_LOG}
                >
                  <ChangeLog />
                </Tabs.TabPane>
              </Tabs>
            </>
          ) : (
            <Flex justifyContent="center" width={1}>
              <Spin size="large" />
            </Flex>
          )}

          <br />
          <hr />

          <BuyMeACoffee />

          <Typography.Title level={4} type="secondary">
            Disclaimer
          </Typography.Title>
          <Text type="secondary">
            This tool is simply a calculator of profit and loss using the deposits/withdrawals and daily portfolio
            values. Results provided by this tool do not constitute investment advice. The makers of this tool are not
            responsible for the consequences of any decisions or actions taken in reliance upon or as a result of the
            information provided by this tool. The information on the add-on may contain errors or inaccuracies. The use
            of the add-on is at your own risk and is provided without any warranty.
            <br />
            <br />
            Please trade responsibly. For any issues or feedback, contact the developer at{' '}
            <a href="mailto:k.elayamani@gmail.com">k.elayamani@gmail.com</a> or create a github issue{' '}
            <a
              href="https://github.com/mani-coder/wealthica-addons/issues/new?assignees=mani-coder&labels=pnl-addon&template=custom.md&title=[P/L Addon]"
              target="_blank"
              rel="noopener noreferrer"
            >
              here
            </a>
            .
          </Text>
          <br />
          <hr />
        </div>
      </Flex>
    </CurrencyContextProvider>
  );
}
