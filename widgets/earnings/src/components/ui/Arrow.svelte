<script lang="ts">
  import ChevronLeft from 'svelte-icons/fa/FaChevronLeft.svelte';
  import ChevronRight from 'svelte-icons/fa/FaChevronRight.svelte';

  export let left: boolean = false;
  export let disabled: boolean = false;
  export let onClick: () => void;
</script>

<div
  class:disabled
  class="p-1 cursor-pointer opacity-90 text-gray-500 w-8 h-full rounded-md items-center bg-gray-50"
  on:click={onClick}
>
  {#if left}
    <ChevronLeft />
  {:else}
    <ChevronRight />
  {/if}
</div>

<style>
  .disabled {
    pointer-events: none;
    opacity: 0.5;
  }
</style>
