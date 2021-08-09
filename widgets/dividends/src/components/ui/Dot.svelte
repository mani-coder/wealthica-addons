<script lang="ts">
  import clsx from 'clsx';

  import type { Color } from 'types';

  export let color: Color = 'purple';

  const styles = `bg-${color}-200 text-black`;
</script>

<div class={clsx($$props.class, 'dot cursor-pointer rounded-md', `bg-${color}-200`)} />

<style>
  .dot {
    padding: 3px;
  }
</style>
