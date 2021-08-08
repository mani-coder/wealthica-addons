<script lang="ts">
  import { default as format } from 'date-fns/format';
  import { getRandomInt } from 'utils';
  import type { Color, Position } from '../types';
  import Arrow from './Arrow.svelte';
  import Badge from './Badge.svelte';

  export let positions: Position[];
  export let prod: boolean;

  const COLORS: Color[] = ['purple', 'pink', 'green', 'blue', 'orange'];

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
  <h4 class="my-0 mb-1 text-sm text-center text-gray-500">
    {#if !prod}
      <div class="font-semibold">EARNINGS</div>
    {/if}
  </h4>

  <div class="flex border-gray-100 border w-full p-1 rounded-lg items-center justify-between">
    <Arrow left on:click={toPrev} />
    <h6>{format(event.date, 'MMM dd, yyyy')}</h6>
    <Arrow on:click={toNext} />
  </div>
  <div class="flex py-2 space-x-1 w-full">
    {#each event.tickers as ticker}
      <Badge color={COLORS[getRandomInt(0, COLORS.length - 1)]}>
        <div class="font-medium text-sm">{ticker}</div>
      </Badge>
    {/each}
  </div>
</div>
