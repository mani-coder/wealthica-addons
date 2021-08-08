<script lang="ts">
  import { default as format } from 'date-fns/format';
  import type { Earning, Timeline } from 'types';
  import { COLORS } from '../constants';
  import { getRandomInt } from '../utils';
  import Arrow from './ui/Arrow.svelte';
  import Badge from './ui/Badge.svelte';
  import Calendar from './ui/Calendar.svelte';

  const THIS_MONTH = new Date().getMonth();

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
    const date = event.earnings[0].date;
    if (THIS_MONTH === event.month) {
      return `This Month (${format(date, 'MMM')})`;
    } else if (THIS_MONTH + 1 === event.month) {
      return `Next Month (${format(date, 'MMM')})`;
    } else {
      return format(date, 'MMM yyyy');
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

  <Calendar />

  <div class="flex flex-col space-y-1 pt-2 w-full">
    {#each event.earnings as earning}
      <div class="flex space-x-1">
        <div class="mr-1 pb-1">
          <Badge color="gray" onClick={() => onDateChange(earning.date, 'week')}>
            <div class="font-medium text-sm">
              {format(earning.date, 'dd')}
            </div>
          </Badge>
        </div>
        <div class="flex overflow-scroll no-scrollbar">
          {#each earning.symbols as symbol}
            <div class="mr-1 pb-1">
              <Badge color={COLORS[getRandomInt(0, COLORS.length - 1)]}>
                <div class="font-medium text-sm">{symbol}</div>
              </Badge>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
