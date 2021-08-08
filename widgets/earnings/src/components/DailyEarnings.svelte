<script lang="ts">
  import format from 'date-fns/format';
  import getDayOfYear from 'date-fns/getDayOfYear';
  import type { Earning } from 'types';
  import { COLORS } from '../constants';
  import { getRandomInt } from '../utils';
  import Arrow from './ui/Arrow.svelte';
  import Badge from './ui/Badge.svelte';

  export let onDateChange: (date: Date) => void;
  export let selectedDate: Date;
  export let earnings: Earning[];

  const TODAY = getDayOfYear(new Date());

  $: currentEventIdx = earnings.findIndex((earning) => earning.date.getTime() === selectedDate!.getTime());
  $: event = earnings[currentEventIdx];

  function toNext() {
    onDateChange(earnings[currentEventIdx < earnings.length - 1 ? currentEventIdx + 1 : 0].date);
  }
  function toPrev() {
    onDateChange(earnings[currentEventIdx === 0 ? earnings.length - 1 : currentEventIdx - 1].date);
  }

  function formatDay(date: Date) {
    if (TODAY === getDayOfYear(date)) {
      return 'Today';
    } else if (TODAY + 1 === getDayOfYear(date)) {
      return 'Tomorrow';
    } else {
      return format(date, 'EEEE');
    }
  }
</script>

<div class="w-full">
  <div class="flex border-gray-200 border w-full p-0.5 rounded-lg items-stretch justify-between">
    <Arrow class="w-5" onClick={toPrev} left disabled={!currentEventIdx} />
    <div class="flex flex-col justify-center w-full items-center">
      <span class="text-gray-600 font-medium text-sm">{format(event.date, 'MMM dd, yyyy')}</span>
      <span class="text-gray-500 font-normal text-xs">{formatDay(event.date)}</span>
    </div>
    <Arrow class="w-5" onClick={toNext} />
  </div>

  <div class="flex pt-3 w-full flex-wrap overflow-visible no-scrollbar">
    {#each event.symbols as symbol}
      <div class="mr-1 pb-1">
        <Badge color={COLORS[getRandomInt(0, COLORS.length - 1)]}>
          <div class="font-medium text-sm">{symbol}</div>
        </Badge>
      </div>
    {/each}
  </div>
</div>
