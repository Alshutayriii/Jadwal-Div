import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useApp } from './store';

useApp.getState().init().catch((err) => {
  console.error('فشل تهيئة البيانات', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
