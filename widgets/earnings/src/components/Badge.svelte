<script lang="ts">
  export let color: string = 'gray';

  const styles = `${color} text-black`;
</script>

<div class="{$$props.class} px-2 py-1 rounded-md flex items-center {styles}">
  <span class="leading-none">
    <slot />
  </span>
</div>
