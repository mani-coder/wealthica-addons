import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import { mount } from 'svelte';
import App from './App.svelte';

// Configure dayjs plugins globally
dayjs.extend(utc);
dayjs.extend(isoWeek);

const app = mount(App, { target: document.body });

export default app;
