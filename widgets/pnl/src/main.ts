import { mount } from 'svelte';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isoWeek from 'dayjs/plugin/isoWeek';
import App from './App.svelte';

// Configure dayjs plugins globally
dayjs.extend(utc);
dayjs.extend(isoWeek);

const app = mount(App, { target: document.body });

export default app;
