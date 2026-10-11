import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';
import { t } from '../i18n';

interface ToastBannerProps {
  toast: ToastMessage;
  onClose: () => void;
}

// Une apparence par type : succès (vert), information (teal), erreur (rouge, annoncée tout de suite aux lecteurs d'écran)
const TOAST_STYLE = {
  success: { border: 'border-emerald-300 dark:border-emerald-700', Icon: CheckCircle2, icon: 'text-emerald-600 dark:text-emerald-400' },
  info: { border: 'border-teal-300 dark:border-teal-700', Icon: Info, icon: 'text-teal-600 dark:text-teal-400' },
  error: { border: 'border-rose-300 dark:border-rose-700', Icon: AlertTriangle, icon: 'text-rose-600 dark:text-rose-400' },
} as const;

export const ToastBanner: React.FC<ToastBannerProps> = ({ toast, onClose }) => {
  const style = TOAST_STYLE[toast.type];
  return (
  <aside
    role={toast.type === 'error' ? 'alert' : 'status'}
    aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    className={`fixed bottom-4 right-4 z-[100] max-w-md bg-white dark:bg-slate-900 border ${style.border} rounded-2xl shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200`}
  >
    <style.Icon className={`w-5 h-5 ${style.icon} shrink-0 mt-0.5`} />
    <div className="space-y-0.5 flex-1">
      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{toast.title}</h4>
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{toast.description}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            // On ferme d'abord : l'action peut afficher son propre message, qui ne doit pas être effacé
            onClose();
            toast.action?.onClick();
          }}
          className="mt-1.5 px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-200 dark:border-teal-800 rounded-lg"
        >
          {toast.action.label}
        </button>
      )}
    </div>
    <button
      aria-label={t('Fermer la notification')}
      onClick={onClose}
      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded"
    >
      <X className="w-4 h-4" />
    </button>
  </aside>
  );
};
