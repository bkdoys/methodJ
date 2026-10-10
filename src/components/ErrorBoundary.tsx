import React from 'react';
import { t } from '../i18n';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              {t('Une erreur est survenue')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {t('L\'application a rencontré un problème inattendu. Vos données sont sauvegardées localement.')}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
            >
              {t('Recharger l\'application')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
