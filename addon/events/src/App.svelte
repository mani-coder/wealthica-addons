<script lang="ts">
  import { Addon } from '@wealthica/wealthica.js/index';
  import Events from 'components/Events.svelte';
  import { default as addDays } from 'date-fns/add';
  import format from 'date-fns/format';
  import { default as subDays } from 'date-fns/sub';
  import { parsePositionsResponse } from './api';
  import Loading from './components/ui/Loading.svelte';
  import Tailwindcss from './styles/Tailwindcss.svelte';
  import type { Position } from './types';

  let addon: any;
  let loading: boolean = true;
  let positions: Position[];
  let timer;
  let prod = !(window.location.search || '').includes('?developer');

  try {
    addon = new Addon(prod ? { id: 'mani-coder/wealthica-events-addon' } : {});
    addon.on('init', (options) => {
      console.debug('[events-addon] Addon initialization', options);
      debouncedLoad(options);
    });

    addon.on('reload', () => {
      // Start reloading
      console.debug('[events-addon] Reload invoked!');
    });

    addon.on('update', (options) => {
      // Update according to the received options
      console.debug('[events-addon] Addon update - options: ', options);
      debouncedLoad(options);
    });
  } catch (error) {
    prod = false;
    console.warn('[events-addon] Falied to load the addon -- ', error);
    setTimeout(() => loadStaticPortfolioData(), 100);
  }

  const debouncedLoad = (options) => {
    clearTimeout(timer);
    timer = setTimeout(() => load(options), 100);
  };

  async function load(options) {
    loading = true;
    const [positionsData] = await Promise.all([loadPositions(options)]);
    computeData(positionsData);
    console.debug('Done with loading data', { positions });
  }

  async function loadStaticPortfolioData() {
    loading = true;
    const [positionsData] = await Promise.all([import('./mocks/positions').then((response) => response.DATA)]);

    computeData(parsePositionsResponse(positionsData));
  }

  function loadPositions(options: any): Position[] {
    console.debug('[events-addon] Loading positions data.');
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
        endpoint: 'positions',
      })
      .then((response) => parsePositionsResponse(response))
      .catch((error) => {
        console.error('[events-addon] Failed to load position data.', error);
        return [];
      });
  }

  async function computeData(positionsData: Position[]) {
    positions = positionsData;
    await fetchEvents(positionsData);
  }

  function fetchEvents(positions: Position[]) {
    const startDate = subDays(new Date(), { months: 1 });
    const endDate = addDays(new Date(), { months: 4 });
    const _symbols = positions
      .filter((position) => {
        const symbol = position.symbol || position.name;
        return !(symbol.includes('-') || position.type === 'crypto');
      })
      .map((position) => position.ticker)
      .join(',');

    if (!_symbols.length) {
      loading = false;
      return;
    }

    const url = `https://cors.bridged.cc/https://portfolio.nasdaq.com/api/portfolio/getPortfolioEvents/?fromDate=${format(
      startDate,
      'yyyy-MM-dd',
    )}&toDate=${format(endDate, 'yyyy-MM-dd')}&tickers=${_symbols}`;

    const positionByTicker = positions.reduce((hash, position) => {
      hash[position.ticker] = position;
      return hash;
    }, {} as { [K: string]: Position });

    return fetch(url, {
      cache: 'force-cache',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((response) => {
        if (response) {
          response.earnings.map((earning) => {
            const position = positionByTicker[earning.ticker];
            if (position && earning.date) {
              position.events.push(earning.date);
            }
          });

          response.dividends.map((dividend) => {
            const position = positionByTicker[dividend.ticker];
            if (position) {
              ['exDate', 'payDate', 'recDate'].forEach((field) => {
                const type =
                  field === 'exDate' ? 'ex-dividend' : field === 'payDate' ? 'pay-dividend' : 'record-dividend';
                if (dividend[field]) {
                  position.events.push({
                    type,
                    date: dividend[field],
                  });
                }
              });
            }
          });
        }
      })
      .catch((error) => console.info('[events-addon] Failed to load events.', error))
      .finally(() => {
        loading = false;
      });
  }
</script>

<svelte:head>
  <Tailwindcss />
</svelte:head>

<main>
  <div class={!addon ? 'flex border w-max my-4 mx-auto p-2 rounded-lg' : ''}>
    <div class="container" style={`--width:${addon ? '100%' : '1100px'};`}>
      {#if loading}
        <div class="flex justify-center w-full h-full">
          <Loading />
        </div>
      {:else if positions}
        <Events {positions} />
      {:else}
        <p>You don't have any open positions.</p>
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
