<script lang="ts">
  export let data: { id: string; changeRatio: number }[];
  export let onClick: (index: number) => void;
  export let selectedPnLIndex: number;
</script>

<div class="flex flex-wrap rounded-lg" role="group">
  {#each data as value, index}
    <span
      on:click={() => onClick(index)}
      class={`inline-flex items-center cursor-pointer justify-center px-2 py-1 mr-2 mb-1 text-xs font-bold leading-none ${
        index === selectedPnLIndex
          ? `text-white ${value.changeRatio >= 0 ? 'bg-green-400' : 'bg-red-400'}`
          : `bg-white ${
              value.changeRatio >= 0 ? 'text-green-400 border border-green-400' : 'text-red-400 border border-red-400'
            }`
      }  rounded-full`}>{value.id}</span
    >
  {/each}
</div>
