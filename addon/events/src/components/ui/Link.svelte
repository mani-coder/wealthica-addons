<!-- svelte-ignore module-script-reactive-declaration -->
<script lang="ts" context="module">
  export const makeButtonClassName = ({
    // using defaults here since svelte doesn't make prop typing easy
    button = false,
    color = 'gray' as Color,
    primary = false,
    transparent = false,
    active = false,
    disabled = false,
    buttonGroup = false,
    shadow = false,
    small = false,
    noUnderline = false,
    hideFocus = false,
  }) => {
    const tr = transparent;
    const ds = disabled;
    const gp = buttonGroup;
    const ac = active;
    const cl = primary ? 'purple' : color;
    const sh = shadow;
    return clsx(
      !ds && 'cursor-pointer',
      button
        ? [
            gp && 'border-l-0 first:border-l',
            !hideFocus && 'focus:ring focus:ring-purple-500 focus:ring-opacity-50', // a11y

            gp && 'flex-1',
            sh && 'hover:shadow-none',
            sh && 'shadow',
            small
              ? [
                  'border-0',
                  !gp && 'rounded-lg',
                  gp && 'first:rounded-l-lg',
                  gp && 'last:rounded-r-lg',
                  'truncate',
                  'min-w-max',
                  'whitespace-nowrap',
                  'px-2',
                  'py-1',
                  'text-xs',
                ]
              : [
                  'border',
                  !gp && 'rounded-xl',
                  gp && 'first:rounded-l-xl',
                  gp && 'last:rounded-r-xl',
                  'p-4',
                  'text-base',
                ],
            'flex',
            'text-shadow-0',
            'focus:outline-none',
            'no-underline',
            'inline-block',
            'items-center',
            'justify-center',
            'leading-none',
            'outline-none',
            'text-center',
            'whitespace-no-wrap',
          ]
        : noUnderline
        ? ['no-underline']
        : ['underline'],
      button
        ? [
            tr && !ac && `bg-transparent`,
            !tr && !ac && `bg-${cl}-100 dark:bg-${cl}-800`,

            tr && ac && `bg-${cl}-100 dark:bg-${cl}-800`,
            !tr && ac && `bg-${cl}-300 dark:bg-${cl}-700`,

            !ds && tr && !ac && `hover:bg-${cl}-100 dark:hover:bg-${cl}-800`,
            !ds && !tr && !ac && `hover:bg-${cl}-300 dark:hover:bg-${cl}-700`,

            !ds && tr && ac && `hover:bg-${cl}-300 dark:hover:bg-${cl}-700`,
            !ds && !tr && ac && `hover:bg-${cl}-400 dark:hover:bg-${cl}-600`,

            // Text
            tr && `text-${cl}-600 dark:text-${cl}-400`,
            !tr && `text-${cl}-700 dark:text-${cl}-300`,

            // Text Hover
            !ds && tr && `hover:text-${cl}-500 dark:hover:text-${cl}-300`,
            !ds && !tr && `hover:text-${cl}-800 dark:hover:text-${cl}-100`,

            // Border
            (!tr || gp) && `border-${cl}-400 dark:border-${cl}-600`,
            tr && !gp && `border-transparent`,
          ]
        : [`text-${cl}-800 dark:text-${cl}-400`, !ds && `hover:text-${cl}-600 dark:hover:text-${cl}-300`],
    );
  };
</script>

<script lang="ts">
  import clsx from 'clsx';
  import type { Color } from '../../types';
  export let button = false,
    primary = false,
    transparent = false,
    active = false,
    disabled = false,
    buttonGroup = false,
    shadow = false,
    small = false;

  export let icon;
  export let color: Color = 'gray';
  export let onClick: (e: MouseEvent) => void;

  const Icon = icon;

  // Used for hiding the ugly focus ring on click but keeps it for a11y
  let hideFocus = false;

  $: btnClass = makeButtonClassName({
    active,
    button,
    buttonGroup,
    disabled,
    primary,
    color,
    shadow,
    transparent,
    small,
    hideFocus,
  });
</script>

<!-- svelte-ignore a11y-invalid-attribute -->
<a
  href="#"
  on:blur={() => {
    hideFocus = false;
  }}
  on:mousedown={() => {
    hideFocus = true;
  }}
  on:click|preventDefault={disabled ? () => {} : onClick}
  class={clsx(btnClass, hideFocus && 'outline-none', $$props.class)}
>
  {#if Icon}
    <Icon class="mr-1" />
  {/if}
  <slot />
</a>
