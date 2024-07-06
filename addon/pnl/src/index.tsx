import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import * as serviceWorker from './serviceWorker';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ConfigProvider
    theme={{ token: { colorPrimary: '#9948d1' }, components: { Tabs: { itemSelectedColor: '#9948d1' } } }}
  >
    <App />
  </ConfigProvider>,
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
