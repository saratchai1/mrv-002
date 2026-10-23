import React from 'react';
import { createRoot } from 'react-dom/client';
import MrvApp from '@/app/components/MrvApp';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MrvApp publicReadOnly editorUrl="https://mangrove-mrv-baseline.gon1122.chatgpt.site" />
  </React.StrictMode>,
);
