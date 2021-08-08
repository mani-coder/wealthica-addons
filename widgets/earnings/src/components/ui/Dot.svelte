<script lang="ts">
  import type { Color } from 'types';

  export let color: Color = 'purple';

  const styles = `bg-${color}-200 text-black`;
</script>

<div class="{$$props.class} dot cursor-pointer rounded-md flex items-center {styles}">
  <span class="leading-none">
    <slot />
  </span>
</div>

<style>
  .dot {
    padding: 3px;
  }
</style>
