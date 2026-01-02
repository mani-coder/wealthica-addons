<style global lang="postcss">
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  html {
    scroll-behavior: smooth;
    @apply text-base;
    @apply leading-normal;
    @apply text-black;
    @apply bg-white;
  }

  h1 {
    @apply text-4xl;
  }
  @screen sm {
    h1 {
      @apply text-5xl;
    }
  }
  @screen md {
    h1 {
      @apply text-6xl;
    }
  }
  @screen lg {
    h1 {
      @apply text-7xl;
    }
  }
  @screen xl {
    h1 {
      @apply text-8xl;
    }
  }
  @screen 2xl {
    h1 {
      @apply text-9xl;
    }
  }

  h2 {
    @apply text-3xl;
  }

  h3 {
    @apply text-2xl;
  }
  h4 {
    @apply text-xl;
  }

  h5 {
    @apply text-lg;
  }

  h6 {
    @apply text-base;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-bold;
    @apply leading-none;
  }

  h1 {
    @apply my-6;
  }
  h2 {
    @apply my-6;
  }
  h3 {
    @apply my-4;
  }
  h4 {
    @apply my-4;
  }
  h5 {
    @apply my-4;
  }
  h6 {
    @apply my-4;
  }

  hr {
    @apply border-gray-300;
    @apply my-6;
  }

  a {
    @apply cursor-pointer;
    @apply underline;
  }

  img {
    @apply max-w-full;
    @apply m-0;
    @apply p-0;
  }

  p {
    @apply my-4;
  }

  @layer utilities {
    /* Chrome, Safari and Opera */
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }

    .no-scrollbar {
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
    }
  }
</style>
