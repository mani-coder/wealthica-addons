<script lang="ts">
  import clsx from 'clsx';

  export let disablePadding: boolean = false;
</script>

<hr class={clsx('border-gray-200 mx-0 p-0', disablePadding ? 'my-0' : 'my-8', $$props.class)} />
