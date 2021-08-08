<script lang="ts">
  import clsx from 'clsx';

  import Button from './Button.svelte';

  export let options: { value: string; label: string }[];
  export let onClick: (value: string) => void;
  export let value: string;
</script>

<div class="flex">
  {#each options as option}
    <Button
      class={clsx(option.value === value ? 'font-medium' : 'opacity-50 bg-gray-100', 'border border-gray-50')}
      buttonGroup
      onClick={() => onClick(option.value)}
      active={option.value === value}
      small
    >
      {option.label}
    </Button>
  {/each}
</div>
