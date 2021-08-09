<script lang="ts">
  import clsx from 'clsx';
  import type { Earning } from 'types';
  import { getColorForSymbol } from 'utils';
  import Dot from '../ui/Dot.svelte';

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
  <span class={clsx('text-xs font-semibold', !current && 'opacity-20')}>
    {day}
  </span>
  {#if symbols.length}
    <div class="flex justify-end">
      {#each symbols.slice(0, 3) as symbol}
        <Dot color={getColorForSymbol(symbol)} />
      {/each}
    </div>
  {/if}
</span>
