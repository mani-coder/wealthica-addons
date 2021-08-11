<script lang="ts">
  import addDays from 'date-fns/addDays';
  import endOfWeek from 'date-fns/endOfWeek';
  import { default as format } from 'date-fns/format';
  import getWeek from 'date-fns/getWeek';
  import startOfWeek from 'date-fns/startOfWeek';
  import subDays from 'date-fns/subDays';
  import type { Event, Timeline } from 'types';
  import { getColorForEvent, getDisplaySymbol } from '../utils';
  import Arrow from './ui/Arrow.svelte';
  import Badge from './ui/Badge.svelte';

  const THIS_WEEK = getWeek(new Date());

  export let onDateChange: (date: Date, changeTimeline?: Timeline) => void;
  export let selectedDate: Date;
  export let events: Event[];

  const eventsByWeekNumber = events.reduce((hash, event) => {
    const week = getWeek(event.date);
    if (!hash[week]) {
      hash[week] = [];
    }
    hash[week].push(event);
    return hash;
  }, {} as { [K: number]: Event[] });

  const weeklyevents = Object.keys(eventsByWeekNumber)
    .map((week) => ({ week: parseInt(week), events: eventsByWeekNumber[parseInt(week)] }))
    .sort((a, b) => a.week - b.week);

  $: selectedDateWeek = getWeek(selectedDate);
  $: currentEventIdx = weeklyevents.findIndex((earning) => earning.week === selectedDateWeek);
  $: event = weeklyevents[currentEventIdx];

  function handleDateChange(idx) {
    onDateChange(weeklyevents[idx].events[0].date);
  }
  function toNext() {
    handleDateChange(currentEventIdx < weeklyevents.length - 1 ? currentEventIdx + 1 : 0);
  }
  function toPrev() {
    handleDateChange(currentEventIdx === 0 ? weeklyevents.length - 1 : currentEventIdx - 1);
  }

  function formatWeek(event: { week: number; events: Event[] }) {
    if (THIS_WEEK === event.week) {
      return 'This Week';
    } else if (THIS_WEEK + 1 === event.week) {
      return 'Next Week';
    } else {
      const date = event.events[0].date;
      return `${format(addDays(startOfWeek(date), 1), 'MMM dd')} - ${format(subDays(endOfWeek(date), 1), 'MMM dd')}`;
    }
  }
</script>

<div class="w-full">
  <div class="flex border-gray-200 bg-gray-50 p-0.5 border w-full rounded-lg items-center justify-between">
    <Arrow class="w-4" onClick={toPrev} left disabled={!currentEventIdx} />
    <div class="flex flex-col justify-center w-full items-center">
      <span class="text-gray-600 font-medium text-sm">{formatWeek(event)}</span>
    </div>
    <Arrow class="w-4" onClick={toNext} />
  </div>

  <div class="flex flex-col space-y-1 pt-2 w-full">
    {#each event.events as event}
      <div class="flex space-x-1">
        <div class="mr-1 pb-1">
          <Badge color="gray" onClick={() => onDateChange(event.date, 'day')}>
            <div class="font-medium text-sm">
              {format(event.date, 'dd')}
            </div>
          </Badge>
        </div>
        <div class="flex overflow-scroll no-scrollbar">
          {#each event.symbols as symbol}
            <div class="mr-1 pb-1">
              <Badge color={getColorForEvent(symbol.type)}>
                <div class="font-medium text-sm">{getDisplaySymbol(symbol)}</div>
              </Badge>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
