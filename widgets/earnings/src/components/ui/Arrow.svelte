<script lang="ts">
  import clsx from 'clsx';
  import ChevronLeft from 'svelte-icons/fa/FaChevronLeft.svelte';
  import ChevronRight from 'svelte-icons/fa/FaChevronRight.svelte';

  export let left: boolean = false;
  export let disabled: boolean = false;
  export let onClick: () => void;
</script>

<div
  class:disabled
  class={clsx($$props.class, 'p-1 cursor-pointer text-gray-500 h-full rounded-md items-center bg-gray-50')}
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
