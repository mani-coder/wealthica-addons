<script lang="ts">
  import { default as format } from 'date-fns/format';
  import type { Dividend, Timeline } from 'types';
  import Arrow from '../ui/Arrow.svelte';
  import EventsCalendar from './EventCalendar.svelte';

  export let onDateChange: (date: Date, changeTimeline?: Timeline) => void;
  export let selectedDate: Date;
  export let dividends: Dividend[];

  const dividendsByMonth = dividends.reduce((hash, dividend) => {
    const month = dividend.date.getMonth();
    if (!hash[month]) {
      hash[month] = [];
    }
    hash[month].push(dividend);
    return hash;
  }, {} as { [K: number]: Dividend[] });

  const monthlyDividends = Object.keys(dividendsByMonth)
    .map((month) => ({ month: parseInt(month), dividends: dividendsByMonth[parseInt(month)] }))
    .sort((a, b) => a.month - b.month);

  $: currentEventIdx = monthlyDividends.findIndex((earning) => earning.month === selectedDate.getMonth());
  $: event = monthlyDividends[currentEventIdx];
  $: dividendsByDateNumber = event.dividends.reduce((hash, earning) => {
    hash[earning.date.getDate()] = earning;
    return hash;
  }, {} as { [K: number]: Dividend });

  function handleDateChange(idx) {
    onDateChange(monthlyDividends[idx].dividends[0].date);
  }
  function toNext() {
    handleDateChange(currentEventIdx < monthlyDividends.length - 1 ? currentEventIdx + 1 : 0);
  }
  function toPrev() {
    handleDateChange(currentEventIdx === 0 ? monthlyDividends.length - 1 : currentEventIdx - 1);
  }

  function formatWeek(event: { month: number; dividends: Dividend[] }) {
    return format(event.dividends[0].date, 'MMM yyyy');
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

  <EventsCalendar date={selectedDate} {dividendsByDateNumber} onDateSelect={(date) => onDateChange(date, 'day')} />
</div>
