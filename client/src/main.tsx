import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { initDatabase } from './local/database';
import './index.css';

async function bootstrap() {
  if (Capacitor.isNativePlatform()) {
    await initDatabase();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
