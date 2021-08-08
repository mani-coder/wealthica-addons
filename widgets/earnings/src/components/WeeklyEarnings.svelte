<script lang="ts">
  import endOfWeek from 'date-fns/endOfWeek';
  import { default as format } from 'date-fns/format';
  import getWeek from 'date-fns/getWeek';
  import startOfWeek from 'date-fns/startOfWeek';
  import addDays from 'date-fns/addDays';
  import subDays from 'date-fns/subDays';
  import { COLORS } from '../constants';
  import { getRandomInt } from '../utils';
  import Arrow from './ui/Arrow.svelte';
  import Badge from './ui/Badge.svelte';

  const THIS_WEEK = getWeek(new Date());

  type Earning = { date: Date; symbols: string[] };
  export let earnings: Earning[];

  const earningsByWeekNumber = earnings.reduce((hash, earning) => {
    const week = getWeek(earning.date);
    if (!hash[week]) {
      hash[week] = [];
    }
    hash[week].push(earning);
    return hash;
  }, {} as { [K: number]: Earning[] });

  const weeklyEarnings = Object.keys(earningsByWeekNumber)
    .map((week) => ({ week: parseInt(week), earnings: earningsByWeekNumber[parseInt(week)] }))
    .sort((a, b) => a.week - b.week);

  let currentEventIdx = 0;
  $: event = weeklyEarnings[currentEventIdx];
  function toNext() {
    currentEventIdx = currentEventIdx < weeklyEarnings.length - 1 ? currentEventIdx + 1 : 0;
  }

  function toPrev() {
    currentEventIdx = currentEventIdx === 0 ? weeklyEarnings.length - 1 : currentEventIdx - 1;
  }

  function formatWeek(event: { week: number; earnings: Earning[] }) {
    if (THIS_WEEK === event.week) {
      return 'This Week';
    } else if (THIS_WEEK + 1 === event.week) {
      return 'Next Week';
    } else {
      const date = event.earnings[0].date;
      return `${format(addDays(startOfWeek(date), 1), 'MMM dd')} - ${format(subDays(endOfWeek(date), 1), 'MMM dd')}`;
    }
  }
</script>

<div class="w-full">
  <div class="flex border-gray-200 border w-full p-1 rounded-lg items-center justify-between">
    <Arrow class="w-4 text-gray-700" onClick={toPrev} left disabled={!currentEventIdx} />
    <div class="flex flex-col justify-center w-full items-center">
      <span class="text-gray-600 font-medium text-sm">{formatWeek(event)}</span>
    </div>
    <Arrow class="w-4 text-gray-700" onClick={toNext} />
  </div>

  <div class="flex flex-col space-y-1 pt-2 w-full">
    {#each event.earnings as earning}
      <div class="flex space-x-1">
        <div class="mr-1 pb-1">
          <Badge color="gray">
            <div class="font-medium text-sm">{format(earning.date, 'dd')}</div>
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
