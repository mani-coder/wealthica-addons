<script lang="ts">
  import type { Color } from 'types';

  export let color: Color = 'purple';
  export let onClick: (() => void) | undefined = undefined;

  const styles = `bg-${color}-200 text-black ${onClick ? 'cursor-pointer' : ''}`;
</script>

<div class="{$$props.class} px-2 py-1 rounded-md flex items-center {styles}" on:click={onClick}>
  <span class="leading-none">
    <slot />
  </span>
</div>
