const _production = !process.env.ROLLUP_WATCH;
module.exports = {
  content: ['./src/**/*.svelte', './src/*.svelte'],
  darkMode: 'media',
  theme: {
    extend: {},
  },
  plugins: [],
};
