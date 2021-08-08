<script lang="ts">
  import type { Color } from '../types';

  export let color: Color = 'gray';

  const styles = `bg-${color}-200 text-black`;
</script>

<div class="{$$props.class} px-2 py-1 rounded-md flex items-center {styles}">
  <span class="leading-none">
    <slot />
  </span>
</div>
