<script lang="ts">
  import addDays from 'date-fns/addDays';
  import endOfWeek from 'date-fns/endOfWeek';
  import format from 'date-fns/format';
  import getWeek from 'date-fns/getWeek';
  import startOfWeek from 'date-fns/startOfWeek';
  import subDays from 'date-fns/subDays';
  import type { Event, EventSymbol, Position, Timeline } from '../types';
  import Legend from './Legend.svelte';
  import MonthlyEvents from './monthly-events/MonthlyEvents.svelte';
  import Arrow from './ui/Arrow.svelte';
  import Divider from './ui/Divider.svelte';
  import FaCalendarAlt from 'svelte-icons/fa/FaCalendarAlt.svelte';
  import WeeklyEvents from './WeeklyEvents.svelte';

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const THIS_WEEK = getWeek(new Date());

  export let positions: Position[];

  const eventsByDate = positions.reduce((hash, position) => {
    if (position.events && position.events.length > 0) {
      position.events.forEach((event) => {
        if (!hash[event.date]) {
          hash[event.date] = [];
        }
        hash[event.date].push({ symbol: position.symbol, type: event.type });
      });
    }
    return hash;
  }, {} as { [K: string]: EventSymbol[] });

  const events: Event[] = Object.keys(eventsByDate)
    .map((date) => {
      const _date = new Date(date);
      _date.setHours(0, 0, 0, 0);
      return { date: _date, symbols: eventsByDate[date] };
    })
    .filter((event) => event.date.getTime() >= TODAY.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  console.log('mani is cool', events);
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

  let timeline: Timeline = 'week';
  function onTimelineSelect(value: string) {
    timeline = value as Timeline;
  }

  let selectedDate: Date = events.length ? events[0].date : new Date();
  function onDateChange(date: Date, changeTimeline?: Timeline) {
    selectedDate = date;
    if (changeTimeline) {
      onTimelineSelect(changeTimeline);
    }
  }

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

<div class="w-full pt-2">
  <div class="flex items-end space-x-2">
    <div class="w-6 text-purple-500"><FaCalendarAlt /></div>
    <h4 class="px-1 md:px-2 m-0">Earnings & Dividends</h4>
  </div>

  <Divider disablePadding class="mt-4 mb-8" />

  {#if events.length}
    <div class="p-1 md:p-2 flex w-full">
      <div class="flex flex-col w-3/4 mr-8">
        <div class="flex justify-center w-full h-fit">
          <Arrow
            class="border w-6 pr-1.5 rounded-md border-gray-300"
            onClick={toPrev}
            left
            disabled={!currentEventIdx}
          />
          <div class="flex mx-2 w-64 px-4 py-3 items-center justify-center bg-gray-100 rounded-lg">
            <span class="font-normal px-8 text-lg">{formatWeek(event)}</span>
          </div>
          <Arrow class="border pl-1.5 w-6 rounded-md border-gray-300" onClick={toNext} />
        </div>
        <div class="py-2" />
        <WeeklyEvents events={event.events} />
      </div>

      <div class="flex flex-col w-1/4">
        <MonthlyEvents {events} {onDateChange} {selectedDate} />
        <Divider />
        <Legend />
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-center py-10 text-sm font-semibold text-center">
      No upcoming events for your positions in next 4 months.
    </div>
  {/if}
</div>
