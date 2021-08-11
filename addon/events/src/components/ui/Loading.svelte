<script lang="ts">
  import { onMount } from 'svelte';
  let text = '';

  async function loop() {
    if (text.length === 4) text = '';
    text += '.';
    await new Promise((resolve) => setTimeout(resolve, 150));
    loop();
  }

  onMount(() => {
    loop();
  });
</script>

<div class="LoadingIndicator">
  {text}
</div>

<style>
  .LoadingIndicator {
    @apply flex;
    @apply justify-center;
    @apply items-center;
    @apply text-center;
    @apply text-purple-700;
    font-size: 75px;
  }
</style>
