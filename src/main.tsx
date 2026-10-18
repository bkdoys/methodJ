import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import './index.css';
import { applyStoredTextScale } from './utils/textScale';

// Taille du texte choisie sur cet appareil, avant le premier affichage
applyStoredTextScale();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </ErrorBoundary>
);
