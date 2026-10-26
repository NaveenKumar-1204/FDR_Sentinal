import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { SessionProvider } from './session';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </SessionProvider>
  </StrictMode>,
);
