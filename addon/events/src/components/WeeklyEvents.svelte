<script lang="ts">
  import addDays from 'date-fns/addDays';
  import format from 'date-fns/format';
  import startOfWeek from 'date-fns/startOfWeek';
  import type { Event, EventType } from 'types';
  import { getColorForEvent, getDisplaySymbol } from 'utils';
  import Badge from './ui/Badge.svelte';

  export let events: Event[];
  export let types: EventType[];

  $: sunday = startOfWeek(events[0].date);
  $: weekEvents = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const date = addDays(sunday, day);
    const _event = events.find((event) => event.date.getTime() === date.getTime());
    return { date, symbols: _event ? _event.symbols.sort((a, b) => a.type.localeCompare(b.type)) : [] };
  });
</script>

<div class="w-full flex justify-between rounded-3xl h-full mt-2">
  {#each weekEvents as event}
    <div
      class="flex flex-col flex-grow border-gray-200 border-t border-b last:border-r border-l first:rounded-l-3xl last:rounded-r-3xl"
    >
      <div class="flex flex-col bg-gray-50 py-3 items-center justify-center border-b border-inherit">
        <span class="text-center">{format(event.date, 'cccc')}</span>
        <span class="text-center text-gray-400">{format(event.date, 'MMM dd')}</span>
      </div>

      <div class="flex flex-col px-2 py-3 space-y-2 w-full flex-wrap overflow-visible no-scrollbar">
        {#each event.symbols as symbol}
          {#if types.includes(symbol.type)}
            <div class="mr-1 pb-1">
              <Badge color={getColorForEvent(symbol.type)} class="w-fit">
                <div class="font-medium text-sm">{getDisplaySymbol(symbol)}</div>
              </Badge>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .border-inherit {
    border-top-left-radius: inherit;
    border-top-right-radius: inherit;
  }
</style>
