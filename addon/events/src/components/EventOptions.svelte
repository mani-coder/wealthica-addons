<script lang="ts">
  import { EVENT_TYPES } from '../constants';
  import type { EventType } from '../types';
  import EventLabel from './EventLabel.svelte';

  export let onChange: (types: EventType[]) => void;
  export let types: EventType[];

  function onClick(type: EventType) {
    const isSelected = types.includes(type);
    onChange(isSelected ? types.filter((_type) => _type !== type) : types.concat([type]));
  }
</script>

<div class="py-2 mt-2 flex flex-wrap justify-center">
  {#each EVENT_TYPES as eventType}
    <div class="mr-2 mb-2">
      <EventLabel {eventType} onClick={() => onClick(eventType)} outline={!types.includes(eventType)} />
    </div>
  {/each}
</div>
