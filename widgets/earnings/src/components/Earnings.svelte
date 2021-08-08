<script lang="ts">
  import { default as format } from 'date-fns/format';
  import { getRandomInt } from 'utils';
  import type { Position } from '../types';
  import Arrow from './Arrow.svelte';
  import Badge from './Badge.svelte';

  export let positions: Position[];
  export let prod: boolean;

  const COLORS: string[] = ['bg-purple-200', 'bg-pink-200', 'bg-green-200', 'bg-blue-200', 'bg-yellow-200'];

  const earningsByDate = positions.reduce((hash, position) => {
    if (position.events && position.events.length > 0) {
      position.events.forEach((event) => {
        if (!hash[event.date]) {
          hash[event.date] = [];
        }
        hash[event.date].push(position.symbol);
      });
    }
    return hash;
  }, {} as { [K: string]: string[] });

  const upcomingEarnings = Object.keys(earningsByDate)
    .map((date) => ({ date: new Date(date), tickers: earningsByDate[date] }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  $: currentEventIdx = 0;
  $: event = upcomingEarnings[currentEventIdx];
  const toNext = () => {
    currentEventIdx = currentEventIdx < upcomingEarnings.length - 1 ? currentEventIdx + 1 : 0;
  };

  const toPrev = () => {
    currentEventIdx = currentEventIdx === 0 ? upcomingEarnings.length + 1 : currentEventIdx - 1;
  };
</script>

<div class="w-full h-full overflow-scroll no-scrollbar">
  <h3 class="my-0 mb-1 text-sm text-center text-gray-500">
    {#if !prod}
      <div class="font-semibold py-1">EARNINGS</div>
    {/if}
  </h3>

  <div class="flex border-gray-200 border w-full p-1 rounded-lg items-center justify-between">
    <Arrow left on:click={toPrev} />
    <div class="flex flex-col justify-center w-full items-center">
      <span class="text-gray-600 font-medium text-sm">{format(event.date, 'MMM dd, yyyy')}</span>
      <span class="text-gray-500 font-normal text-xs">{format(event.date, 'EEEE')}</span>
    </div>
    <Arrow on:click={toNext} />
  </div>
  <div class="flex pt-3 w-full flex-wrap">
    {#each event.tickers as ticker}
      <div class="mr-1 pb-1">
        <Badge color={COLORS[getRandomInt(0, COLORS.length - 1)]}>
          <div class="font-medium text-sm">{ticker}</div>
        </Badge>
      </div>
    {/each}
  </div>
</div>
