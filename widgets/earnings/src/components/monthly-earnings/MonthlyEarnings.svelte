<script lang="ts">
  import { default as format } from 'date-fns/format';
  import type { Earning, Timeline } from 'types';
  import Arrow from '../ui/Arrow.svelte';
  import EventsCalendar from './EventCalendar.svelte';

  export let onDateChange: (date: Date, changeTimeline?: Timeline) => void;
  export let selectedDate: Date;
  export let earnings: Earning[];

  const earningsByMonth = earnings.reduce((hash, earning) => {
    const month = earning.date.getMonth();
    if (!hash[month]) {
      hash[month] = [];
    }
    hash[month].push(earning);
    return hash;
  }, {} as { [K: number]: Earning[] });

  const monthlyEarnings = Object.keys(earningsByMonth)
    .map((month) => ({ month: parseInt(month), earnings: earningsByMonth[parseInt(month)] }))
    .sort((a, b) => a.month - b.month);

  $: currentEventIdx = monthlyEarnings.findIndex((earning) => earning.month === selectedDate.getMonth());
  $: event = monthlyEarnings[currentEventIdx];
  $: earningsByDateNumber = event.earnings.reduce((hash, earning) => {
    hash[earning.date.getDate()] = earning;
    return hash;
  }, {} as { [K: number]: Earning });

  function handleDateChange(idx) {
    onDateChange(monthlyEarnings[idx].earnings[0].date);
  }
  function toNext() {
    handleDateChange(currentEventIdx < monthlyEarnings.length - 1 ? currentEventIdx + 1 : 0);
  }
  function toPrev() {
    handleDateChange(currentEventIdx === 0 ? monthlyEarnings.length - 1 : currentEventIdx - 1);
  }

  function formatWeek(event: { month: number; earnings: Earning[] }) {
    return format(event.earnings[0].date, 'MMM yyyy');
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

  <EventsCalendar date={selectedDate} {earningsByDateNumber} onDateSelect={(date) => onDateChange(date, 'day')} />
</div>
