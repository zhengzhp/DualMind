import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/tailwind.css';
import { SIDEPANEL_PORT } from '@/shared/messaging/protocol';

/** 向 Background 登记存活，供划词浮层 toggle / 关闭回退 */
try {
  const port = browser.runtime.connect({ name: SIDEPANEL_PORT });
  port.onMessage.addListener((msg: unknown) => {
    if ((msg as { type?: string })?.type === 'sidepanel:close-self') {
      window.close();
    }
  });
} catch {
  /* ignore */
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if ((message as { type?: string })?.type === 'sidepanel:close-self') {
    window.close();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
