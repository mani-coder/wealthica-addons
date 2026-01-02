/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        loading: {
          '0%': { width: '0%', marginLeft: '0%' },
          '25%': { width: '50%', marginLeft: '0%' },
          '50%': { width: '75%', marginLeft: '0%' },
          '100%': { width: '0%', marginLeft: '100%' },
        },
      },
      animation: {
        loading: 'loading 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
  corePlugins: {
    // Disable preflight to avoid conflicts with Ant Design
    preflight: false,
  },
};
