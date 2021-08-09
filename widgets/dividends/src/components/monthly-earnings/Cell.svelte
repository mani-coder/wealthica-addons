<script lang="ts">
  import clsx from 'clsx';
  import type { Dividend } from 'types';
  import { getColorForEvent } from 'utils';
  import Dot from '../ui/Dot.svelte';

  export let day: number;
  export let current: boolean = false;
  export let dividend: Dividend | undefined = undefined;
  export let onDateSelect: ((date: Date) => void) | undefined = undefined;
  $: symbols = dividend ? dividend.symbols.slice(0, 3) : [];
</script>

<span
  class={clsx(
    'p-1',
    dividend ? 'text-purple-700 bg-purple-50 font-bold rounded-md cursor-pointer' : 'pointer-events-none',
  )}
  on:click={() => (onDateSelect && dividend ? onDateSelect(dividend.date) : null)}
>
  <span class={clsx('text-xs font-semibold', !current && 'opacity-20')}>
    {day}
  </span>
  {#if symbols.length}
    <div class="flex justify-end">
      {#each symbols.slice(0, 3) as symbol}
        <Dot color={getColorForEvent(symbol.type)} />
      {/each}
    </div>
  {/if}
</span>
