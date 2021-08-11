<script lang="ts">
  import clsx from 'clsx';
  import type { Event } from 'types';
  import { getColorForEvent } from 'utils';
  import Dot from '../ui/Dot.svelte';

  export let day: number;
  export let current: boolean = false;
  export let event: Event | undefined = undefined;
  export let onDateSelect: ((date: Date) => void) | undefined = undefined;
  $: symbols = event ? event.symbols.slice(0, 3) : [];
</script>

<span
  class={clsx(
    'p-1',
    event ? 'text-purple-700 bg-purple-50 font-bold rounded-md cursor-pointer' : 'pointer-events-none',
  )}
  on:click={() => (onDateSelect && event ? onDateSelect(event.date) : null)}
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
