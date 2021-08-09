<script lang="ts">
  import clsx from 'clsx';
  import type { Color } from 'types';

  export let color: Color = 'purple';
  export let onClick: (() => void) | undefined = undefined;
</script>

<div
  class={clsx(
    $$props.class,
    'px-2 py-1 rounded-md flex items-center text-black',
    `bg-${color}-200`,
    onClick && 'cursor-pointer',
  )}
  on:click={onClick}
>
  <span class="leading-none">
    <slot />
  </span>
</div>
