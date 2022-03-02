declare module '@wealthica/wealthica.js/index';

interface ProcessEnv {
  [key: string]: string | undefined;
}

interface Window {
  analytics: any;
}
