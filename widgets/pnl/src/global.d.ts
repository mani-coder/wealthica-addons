declare module '@wealthica/wealthica.js/index';

interface Window {
  analytics: any;
  process: {
    env: { [K: string]: string };
  };
}
