<script lang="ts">
  import { TIMELINE_OPTIONS } from '../constants';
  import type { Dividend, DividendEventSymbol, Position, Timeline } from '../types';
  import DailyDividends from './DailyDividends.svelte';
  import MonthlyDividends from './monthly-earnings/MonthlyDividends.svelte';
  import ButtonGroup from './ui/ButtonGroup.svelte';
  import WeeklyDividends from './WeeklyDividends.svelte';

  export let positions: Position[];
  export let prod: boolean;

  const dividendsByDate = positions.reduce((hash, position) => {
    if (position.events && position.events.length > 0) {
      position.events.forEach((event) => {
        if (!hash[event.date]) {
          hash[event.date] = [];
        }
        hash[event.date].push({ symbol: position.symbol, type: event.type });
      });
    }
    return hash;
  }, {} as { [K: string]: DividendEventSymbol[] });

  const dividends: Dividend[] = Object.keys(dividendsByDate)
    .map((date) => {
      const _date = new Date(date);
      _date.setHours(0, 0, 0, 0);
      return { date: _date, symbols: dividendsByDate[date] };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let timeline: Timeline = 'day';
  function onTimelineSelect(value: string) {
    timeline = value as Timeline;
  }

  let selectedDate: Date = dividends.length ? dividends[0].date : new Date();
  function onDateChange(date: Date, changeTimeline?: Timeline) {
    selectedDate = date;
    if (changeTimeline) {
      onTimelineSelect(changeTimeline);
    }
  }
</script>

<div class="w-full h-full overflow-scroll no-scrollbar">
  <h3 class="my-0 mb-1 text-sm text-center text-gray-500">
    {#if !prod}
      <div class="font-semibold">DIVIDENDS</div>
    {/if}
  </h3>

  {#if dividends.length}
    <ButtonGroup value={timeline} options={TIMELINE_OPTIONS} onClick={onTimelineSelect} />

    <div class="py-0.5" />

    {#if timeline === 'day'}
      <DailyDividends {dividends} {onDateChange} {selectedDate} />
    {:else if timeline === 'week'}
      <WeeklyDividends {dividends} {onDateChange} {selectedDate} />
    {:else}
      <MonthlyDividends {dividends} {onDateChange} {selectedDate} />
    {/if}
  {:else}
    <div class="flex items-center justify-center py-10 text-sm font-semibold text-center">
      No upcoming dividends for your positions in recent times.
    </div>
  {/if}
</div>
