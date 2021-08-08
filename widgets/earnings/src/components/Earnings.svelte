<script lang="ts">
  import type { Position, Timeline } from '../types';
  import DailyEarnings from './DailyEarnings.svelte';
  import ButtonGroup from './ui/ButtonGroup.svelte';
  import WeeklyEarnings from './WeeklyEarnings.svelte';

  export let positions: Position[];
  export let prod: boolean;

  const TIMELINE_OPTIONS: { label: string; value: string }[] = [
    { label: 'DAY', value: 'day' },
    { label: 'WEEK', value: 'week' },
  ];

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

  const earnings = Object.keys(earningsByDate)
    .map((date) => {
      const _date = new Date(date);
      _date.setHours(0, 0, 0, 0);
      return { date: _date, symbols: earningsByDate[date] };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let timeline: Timeline = 'day';
  function onTimelineSelect(value: string) {
    timeline = value as Timeline;
  }
</script>

<div class="w-full h-full overflow-scroll no-scrollbar">
  <h3 class="my-0 mb-1 text-sm text-center text-gray-500">
    {#if !prod}
      <div class="font-semibold">EARNINGS</div>
    {/if}
  </h3>

  <ButtonGroup value={timeline} options={TIMELINE_OPTIONS} onClick={onTimelineSelect} />

  <div class="py-0.5" />

  {#if timeline === 'day'}
    <DailyEarnings {earnings} />
  {:else}
    <WeeklyEarnings {earnings} />
  {/if}
</div>
