import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </ErrorBoundary>
);
