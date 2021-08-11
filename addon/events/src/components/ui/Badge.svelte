<script lang="ts">
  import clsx from 'clsx';
  import type { Color } from 'types';

  export let color: Color = 'purple';
  export let outline: boolean = false;
  export let onClick: (() => void) | undefined = undefined;
</script>

<div
  class={clsx(
    $$props.class,
    'px-2 py-1 rounded-md flex items-center',
    outline ? `bg-white border border-${color}-700 text-${color}-700` : `bg-${color}-200 text-black`,
    onClick && 'cursor-pointer',
  )}
  on:click={onClick}
>
  <span class="leading-none">
    <slot />
  </span>
</div>
