import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Tier 1 Maps JavaScript API quota and auth failure listener
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args.map((a) => String((a as any)?.message || a)).join(' ');
  if (
    msg.includes('WebSocket closed without opened') ||
    (msg.includes('[vite]') && msg.includes('WebSocket')) ||
    msg.includes('popup-closed-by-user') ||
    msg.includes('cancelled-popup-request') ||
    msg.includes('insufficient authentication scopes') ||
    msg.includes('insufficient_scope') ||
    msg.includes('insufficient permissions') ||
    msg.includes('Re-authorize Google Drive') ||
    msg.includes('Drive folder lookup and creation error')
  ) {
    return;
  }
  origError.apply(console, args);
  if (msg.includes('OverQuotaMapError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
