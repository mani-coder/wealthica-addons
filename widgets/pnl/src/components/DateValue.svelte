<script lang="ts">
  import { formatCurrency } from 'utils';

  export let date: string;
  export let value: number;
  export let ratio: number;
  export let privateMode: boolean;
</script>

<div class="flex w-full text-xs text-gray-600">
  <div class="w-5/12 font-light">{date}</div>

  <div class="flex w-7/12 justify-between pl-1">
    <div class="font-medium">{ratio.toFixed(2)}%</div>
    <div class="font-normal">
      {#if privateMode}
        $--
      {:else}
        {value >= 0 ? '' : '-'}${formatCurrency(Math.abs(value), 2)}
      {/if}
    </div>
  </div>
</div>
