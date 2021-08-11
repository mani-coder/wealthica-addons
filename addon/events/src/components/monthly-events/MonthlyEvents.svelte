<script lang="ts">
  import { default as format } from 'date-fns/format';
  import type { Event, Timeline } from 'types';
  import Arrow from '../ui/Arrow.svelte';
  import EventsCalendar from './EventCalendar.svelte';

  export let onDateChange: (date: Date, changeTimeline?: Timeline) => void;
  export let selectedDate: Date;
  export let events: Event[];

  const eventsByMonth = events.reduce((hash, event) => {
    const month = event.date.getMonth();
    if (!hash[month]) {
      hash[month] = [];
    }
    hash[month].push(event);
    return hash;
  }, {} as { [K: number]: Event[] });

  const monthlyEvents = Object.keys(eventsByMonth)
    .map((month) => ({ month: parseInt(month), events: eventsByMonth[parseInt(month)] }))
    .sort((a, b) => a.month - b.month);

  $: currentEventIdx = monthlyEvents.findIndex((earning) => earning.month === selectedDate.getMonth());
  $: event = monthlyEvents[currentEventIdx];
  $: eventsByDateNumber = event.events.reduce((hash, earning) => {
    hash[earning.date.getDate()] = earning;
    return hash;
  }, {} as { [K: number]: Event });

  function handleDateChange(idx) {
    onDateChange(monthlyEvents[idx].events[0].date);
  }
  function toNext() {
    handleDateChange(currentEventIdx < monthlyEvents.length - 1 ? currentEventIdx + 1 : 0);
  }
  function toPrev() {
    handleDateChange(currentEventIdx === 0 ? monthlyEvents.length - 1 : currentEventIdx - 1);
  }

  function formatWeek(event: { month: number; events: Event[] }) {
    return format(event.events[0].date, 'MMM yyyy');
  }
</script>

<div class="w-full p-2 border border-gray-200 bg-gray-50 rounded-lg">
  <div class="flex w-full items-center">
    <Arrow class="w-5" onClick={toPrev} left disabled={!currentEventIdx} />
    <div class="flex flex-col justify-center w-full items-center">
      <span class="text-gray-700 font-bold text-base">{formatWeek(event)}</span>
    </div>
    <Arrow class="w-5" onClick={toNext} />
  </div>

  <div class="py-2" />

  <EventsCalendar date={selectedDate} {eventsByDateNumber} onDateSelect={(date) => onDateChange(date, 'week')} />
</div>
