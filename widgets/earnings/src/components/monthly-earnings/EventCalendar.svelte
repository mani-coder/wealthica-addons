<script lang="ts">
  import calendarize from 'calendarize';
  import type { Earning } from 'types';
  import { DAY_LABELS } from '../../constants';
  import Cell from './Cell.svelte';

  export let offset: number = 0; // Sun
  export let earningsByDateNumber: { [K: number]: Earning };
  export let date: Date;
  export let onDateSelect: (date: Date) => void;

  $: prev = calendarize(new Date(date.getFullYear(), date.getMonth() - 1), offset);
  $: current = calendarize(new Date(date.getFullYear(), date.getMonth()), offset);
  $: next = calendarize(new Date(date.getFullYear(), date.getMonth() + 1), offset);
</script>

<div class="pt-1.5 px-1 grid grid-cols-7 text-right gap-0.5 text-xs">
  {#each DAY_LABELS as txt, idx (txt)}
    <span class="font-light text-xs text-gray-500 pr-0.5">{DAY_LABELS[(idx + offset) % 7]}</span>
  {/each}

  {#each { length: 6 } as w, idxw (idxw)}
    {#if current[idxw]}
      {#each { length: 7 } as d, idxd (idxd)}
        {#if current[idxw][idxd] != 0}
          <Cell day={current[idxw][idxd]} earning={earningsByDateNumber[current[idxw][idxd]]} current {onDateSelect} />
        {:else if idxw < 1}
          <Cell day={prev[prev.length - 1][idxd]} />
        {:else}
          <Cell day={next[0][idxd]} />
        {/if}
      {/each}
    {/if}
  {/each}
</div>
