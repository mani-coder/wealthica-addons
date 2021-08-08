const safelist = require("./tailwind.safelist");
const production = !process.env.ROLLUP_WATCH;

module.exports = {
  purge: {
    content: [
      "./src/**/*.svelte",
      "./src/*.svelte",
    ],
    options: {
      safelist,
    },
    enabled: production
  },
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {},
  },
  variants: {
    extend: {
      borderWidth: ['first', 'last'],
      borderRadius: ['first', 'last'],
    },
  },
  plugins: [],
}
