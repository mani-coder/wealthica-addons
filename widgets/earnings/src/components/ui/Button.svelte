<script lang="ts">
  import type { Color } from '../../types';
  import Link from './Link.svelte';
  export let primary = false,
    transparent = false,
    active = false,
    disabled = false,
    buttonGroup = false,
    shadow = false,
    small = false;

  export let icon: any = undefined;
  export let color: Color = 'gray';
  export let onClick: (e: MouseEvent) => void;

  $: props = {
    primary,
    transparent,
    active,
    disabled,
    buttonGroup,
    shadow,
    color,
    small,
    onClick,
    icon,
  };
</script>

<Link class={$$props.class} {...props} button>
  <slot />
</Link>
