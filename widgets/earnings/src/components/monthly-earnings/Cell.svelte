<script lang="ts">
  import clsx from 'clsx';
  import type { Color, Earning } from 'types';
  import { getRandomInt } from 'utils';
  import Dot from '../ui/Dot.svelte';

  const COLORS: Color[] = ['pink', 'green', 'red', 'blue'];

  export let day: number;
  export let current: boolean = false;
  export let earning: Earning | undefined = undefined;
  export let onDateSelect: ((date: Date) => void) | undefined = undefined;
  $: symbols = earning ? earning.symbols.slice(0, 3) : [];
</script>

<span
  class={clsx(
    'p-1',
    earning ? 'text-purple-700 bg-purple-50 font-bold rounded-md cursor-pointer' : 'pointer-events-none',
  )}
  on:click={() => (onDateSelect && earning ? onDateSelect(earning.date) : null)}
>
  <span class={clsx('h06 text-xs font-semibold', !current && 'opacity-20')}>
    {day}
  </span>
  {#if symbols.length}
    <div class="flex justify-end">
      {#each symbols.slice(0, 3) as earning}
        <Dot color={COLORS[getRandomInt(0, COLORS.length - 1)]} />
      {/each}
    </div>
  {/if}
</span>
