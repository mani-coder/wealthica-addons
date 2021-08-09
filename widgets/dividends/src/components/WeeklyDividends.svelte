<script lang="ts">
  import addDays from 'date-fns/addDays';
  import endOfWeek from 'date-fns/endOfWeek';
  import { default as format } from 'date-fns/format';
  import getWeek from 'date-fns/getWeek';
  import startOfWeek from 'date-fns/startOfWeek';
  import subDays from 'date-fns/subDays';
  import type { Dividend, Timeline } from 'types';
  import { getColorForSymbol } from '../utils';
  import Arrow from './ui/Arrow.svelte';
  import Badge from './ui/Badge.svelte';

  const THIS_WEEK = getWeek(new Date());

  export let onDateChange: (date: Date, changeTimeline?: Timeline) => void;
  export let selectedDate: Date;
  export let dividends: Dividend[];

  const dividendsByWeekNumber = dividends.reduce((hash, dividend) => {
    const week = getWeek(dividend.date);
    if (!hash[week]) {
      hash[week] = [];
    }
    hash[week].push(dividend);
    return hash;
  }, {} as { [K: number]: Dividend[] });

  const weeklyDividends = Object.keys(dividendsByWeekNumber)
    .map((week) => ({ week: parseInt(week), dividends: dividendsByWeekNumber[parseInt(week)] }))
    .sort((a, b) => a.week - b.week);

  $: selectedDateWeek = getWeek(selectedDate);
  $: currentEventIdx = weeklyDividends.findIndex((earning) => earning.week === selectedDateWeek);
  $: event = weeklyDividends[currentEventIdx];

  function handleDateChange(idx) {
    onDateChange(weeklyDividends[idx].dividends[0].date);
  }
  function toNext() {
    handleDateChange(currentEventIdx < weeklyDividends.length - 1 ? currentEventIdx + 1 : 0);
  }
  function toPrev() {
    handleDateChange(currentEventIdx === 0 ? weeklyDividends.length - 1 : currentEventIdx - 1);
  }

  function formatWeek(event: { week: number; dividends: Dividend[] }) {
    if (THIS_WEEK === event.week) {
      return 'This Week';
    } else if (THIS_WEEK + 1 === event.week) {
      return 'Next Week';
    } else {
      const date = event.dividends[0].date;
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
    {#each event.dividends as dividend}
      <div class="flex space-x-1">
        <div class="mr-1 pb-1">
          <Badge color="gray" onClick={() => onDateChange(dividend.date, 'day')}>
            <div class="font-medium text-sm">
              {format(dividend.date, 'dd')}
            </div>
          </Badge>
        </div>
        <div class="flex overflow-scroll no-scrollbar">
          {#each dividend.symbols as symbol}
            <div class="mr-1 pb-1">
              <Badge color={getColorForSymbol(symbol.symbol)}>
                <div class="font-medium text-sm">{symbol.symbol}</div>
              </Badge>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
