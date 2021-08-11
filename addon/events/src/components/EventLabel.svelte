<script lang="ts">
  import type { EventType } from 'types';
  import { getColorForEvent } from 'utils';
  import Badge from './ui/Badge.svelte';

  export let onClick: (() => void) | undefined = undefined;
  export let eventType: EventType;
  export let outline: boolean = false;
</script>

<Badge color={getColorForEvent(eventType)} class="w-fit py-2" {onClick} {outline}>
  <span class="px-2">
    {#if eventType === 'earning'}
      Earning
    {:else if eventType === 'ex-dividend'}
      ED: Ex-Dividend
    {:else if eventType === 'pay-dividend'}
      PD: Pay Dividend
    {:else}
      RD: Record Dividend
    {/if}
  </span>
</Badge>
