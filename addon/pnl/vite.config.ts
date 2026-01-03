import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/mani-coder/wealthica-portfolio-addon/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core React libraries
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }

          // Ant Design icons - separate chunk
          if (id.includes('node_modules/@ant-design/icons')) {
            return 'antd-icons';
          }

          // Ant Design core - separate from icons
          if (id.includes('node_modules/antd')) {
            return 'antd';
          }

          // Day.js - used by antd and throughout the app
          if (id.includes('node_modules/dayjs')) {
            return 'dayjs';
          }

          // Charting libraries
          if (id.includes('node_modules/highcharts')) {
            return 'charts';
          }

          // Other large dependencies
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
