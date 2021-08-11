<script lang="ts">
  import type { EventType } from 'types';
  import { getColorForEvent } from 'utils';
  import Badge from './ui/Badge.svelte';

  const LABELS: EventType[] = ['earning', 'ex-dividend', 'pay-dividend', 'record-dividend'];
</script>

<div class="flex flex-col space-y-4 w-full px-4 py-2 pb-4 border border-gray-200 bg-gray-50 rounded-lg">
  <h6 class="mb-2">Categories</h6>

  {#each LABELS as label}
    <Badge color={getColorForEvent(label)} class="w-fit-content py-2">
      <span class="px-2">
        {#if label === 'earning'}
          Earning
        {:else if label === 'ex-dividend'}
          Ex-Dividend
        {:else if label === 'pay-dividend'}
          Pay Dividend
        {:else}
          Record Dividend
        {/if}
      </span>
    </Badge>
  {/each}
</div>
