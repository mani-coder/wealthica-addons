<script lang="ts">
import { Addon } from '@wealthica/wealthica.js/index';
import { initTracking, trackEvent } from 'analytics';
import {
  parseCurrencyReponse,
  parseInstitutionsResponse,
  parsePortfolioResponse,
  parseTransactionsResponse,
} from './api';
import Loading from './components/Loading.svelte';
import PnLWidget from './components/PnLWidget.svelte';
import { TRANSACTIONS_FROM_DATE } from './constants';
import Tailwindcss from './styles/Tailwindcss.svelte';
import type { Portfolio } from './types';

let currencyCache: { [K: string]: string };
let addon: any;
let loading: boolean = true;
let portfolios: Portfolio[] = [];
let privateMode: boolean;
let timer;
let prod = !(window.location.search || '').includes('?developer');

try {
  addon = new Addon(prod ? { id: 'mani-coder/wealthica-portfolio-addon/widgets/pnl' } : {});

  addon.on('init', (options) => {
    console.debug('[pnl-widget] Addon initialization', options);
    debounced(options);
    initTracking(options.authUser && options.authUser.id);
  });

  addon.on('reload', () => {
    // Start reloading
    debug('[pnl-widget] Reload invoked!');
  });

  addon.on('update', (options) => {
    // Update according to the received options
    console.debug('[pnl-widget] Addon update - options: ', options);
    debounced(options);
    trackEvent('update');
  });
} catch (error) {
  prod = false;
  console.warn('Falied to load the addon -- ', error);
  setTimeout(() => loadStaticPortfolioData(), 100);
}

const debounced = (options) => {
  clearTimeout(timer);
  timer = setTimeout(() => load(options), 100);
};

async function load(options) {
  privateMode = options.privateMode;
  loading = true;
  const [currencyData, portfolioData, accounts, transactions] = await Promise.all([
    loadCurrenciesCache(),
    loadPortfolioData(options),
    loadInstitutionsData(options),
    loadTransactions(options),
  ]);
  currencyCache = currencyData ? currencyData : currencyCache;
  computePortfolios(portfolioData, transactions, accounts, currencyCache);
  loading = false;
  debug('Done with loading data', { portfolios });
}

async function loadStaticPortfolioData() {
  const [institutionsData, portfolioData, transactionsData, currenciesData] = await Promise.all([
    import('./mocks/institutions').then((response) => response.DATA),
    import('./mocks/portfolio').then((response) => response.DATA),
    import('./mocks/transactions').then((response) => response.DATA),
    import('./mocks/currencies').then((response) => response.DATA),
  ]);

  computePortfolios(
    parsePortfolioResponse(portfolioData),
    transactionsData,
    parseInstitutionsResponse(institutionsData),
    parseCurrencyReponse(currenciesData),
  );
  loading = false;
  if (!process.env.production) {
    debug('[pnl-widget] Static Dev State:', { portfolios });
  }
}

function computePortfolios(portfolioData, transactions, accounts, currencyData) {
  console.log('[pnl-widget] computePortfolios - portfolioData keys:', Object.keys(portfolioData).length);
  console.log('[pnl-widget] computePortfolios - transactions count:', transactions?.length || 0);
  console.log('[pnl-widget] computePortfolios - accounts count:', accounts?.length || 0);

  const transactionsByDate = parseTransactionsResponse(transactions, currencyData, accounts);
  console.log('[pnl-widget] transactionsByDate keys:', Object.keys(transactionsByDate).length);

  const portfolioPerDay = Object.keys(portfolioData).reduce((hash, date) => {
    const data = transactionsByDate[date] || {};
    hash[date] = {
      value: portfolioData[date],
      deposit: data.deposit || 0,
      withdrawal: data.withdrawal || 0,
      income: data.income || 0,
      interest: data.interest || 0,
    };
    return hash;
  }, {});

  const _portfolios: Portfolio[] = [];

  const sortedDates = Object.keys(portfolioPerDay).sort();
  console.log('[pnl-widget] sortedDates count:', sortedDates.length);
  if (sortedDates.length > 0) {
    console.log('[pnl-widget] First date:', sortedDates[0]);
    console.log('[pnl-widget] Last date:', sortedDates[sortedDates.length - 1]);
  }

  let deposits = Object.keys(transactionsByDate)
    .filter((date) => date < sortedDates[0])
    .reduce((totalDeposits, date) => {
      const transaction = transactionsByDate[date];
      totalDeposits += transaction.deposit - transaction.withdrawal;
      return totalDeposits;
    }, 0);

  sortedDates.forEach((date) => {
    const portfolio = portfolioPerDay[date];
    deposits += portfolio.deposit - portfolio.withdrawal;
    _portfolios.push({
      date: date,
      value: portfolio.value,
      deposits: deposits,
    });
  });

  console.log('[pnl-widget] Final portfolios count:', _portfolios.length);
  portfolios = _portfolios;
}

function debug(...data: any[]) {
  if (!process.env.production) {
    console.debug(...data);
  }
}

function loadCurrenciesCache() {
  if (currencyCache) {
    return null;
  }

  debug('[pnl-widget] Loading currencies data.');
  return addon
    .request({
      method: 'GET',
      endpoint: 'currencies/usd/history',
      query: {
        base: 'cad',
      },
    })
    .then((response) => parseCurrencyReponse(response))
    .catch((error) => {
      console.error('[pnl-widget] Failed to load currency data.', error);
    });
}

function loadPortfolioData(options) {
  debug('[pnl-widget] Loading portfolio data.');
  const query = {
    assets: false,
    from: options.fromDate,
    to: options.toDate,
    groups: options.groupsFilter,
    institutions: options.institutionsFilter,
    investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
  };
  return addon
    .request({
      query,
      method: 'GET',
      endpoint: 'portfolio',
    })
    .then((response) => parsePortfolioResponse(response))
    .catch((error) => {
      console.error('[pnl-widget] Failed to load portfolio data.', error);
    });
}

function loadInstitutionsData(options) {
  debug('[pnl-widget] Loading institutions data..');
  const query = {
    assets: false,
    groups: options.groupsFilter,
    institutions: options.institutionsFilter,
    investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
  };
  return addon
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
      console.error('[pnl-widget] Failed to load institutions data.', error);
    });
}

function loadTransactions(options) {
  debug('[pnl-widget] Loading transactions data.');
  const fromDate = options.fromDate;
  const query = {
    assets: false,
    from: fromDate && fromDate < TRANSACTIONS_FROM_DATE ? fromDate : TRANSACTIONS_FROM_DATE,
    groups: options.groupsFilter,
    institutions: options.institutionsFilter,
    investments: options.investmentsFilter === 'all' ? null : options.investmentsFilter,
  };
  return addon
    .request({
      query,
      method: 'GET',
      endpoint: 'transactions',
    })
    .then((response) => response)
    .catch((error) => {
      console.error('[pnl-widget] Failed to load transactions data.', error);
    });
}
</script>

<svelte:head>
  <Tailwindcss />
</svelte:head>

<main>
  <div class={!addon ? 'flex border w-max my-4 mx-auto p-2 rounded-lg' : ''}>
    <div class="container" style={`--width:${addon ? '100%' : '219px'};`}>
      {#if loading}
        <div class="flex justify-center py-2 w-full h-full">
          <Loading />
        </div>
      {:else if portfolios}
        <PnLWidget {portfolios} {privateMode} {prod} />
      {:else}
        <p>No Data</p>
      {/if}
    </div>
  </div>
</main>

<style>
  .container {
    width: var(--width);
    height: 240px;
  }
</style>
