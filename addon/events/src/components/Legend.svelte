<script lang="ts">
  import { EVENT_TYPES } from '../constants';
  import EventLabel from './EventLabel.svelte';
</script>

<div class="flex flex-col space-y-4 w-full px-4 py-2 pb-4 border border-gray-200 bg-gray-50 rounded-lg">
  <h6 class="mb-2">Categories</h6>

  {#each EVENT_TYPES as eventType}
    <EventLabel {eventType} />
  {/each}
</div>
