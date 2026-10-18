import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/tailwind.css';
import { bootstrapTheme } from '@/shared/ui/themeBootstrap';

// 先写主题再挂载，避免深色偏好下先闪一帧浅色
void bootstrapTheme().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
