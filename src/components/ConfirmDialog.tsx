import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { t } from '../i18n';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  /** Libellé du bouton de confirmation (« Confirmer » par défaut). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` : action destructrice (bouton rouge, le focus part sur « Annuler »). */
  tone?: 'danger' | 'default';
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Remplace `window.confirm` (fenêtre système, hors charte) : `if (await confirm({ title, message, tone: 'danger' })) …`.
 * Un seul dialogue à la fois ; une nouvelle demande annule la précédente.
 */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm doit être utilisé sous <ConfirmProvider>');
  return confirm;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onResult: (confirmed: boolean) => void;
}

/** Le dialogue lui-même : Échap ou clic hors de la carte = annuler, Tab reste dans la carte. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onResult,
}) => {
  const danger = tone === 'danger';
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const messageId = React.useId();

  // Focus : « Annuler » pour une action destructrice (un Entrée distrait ne supprime rien), « Confirmer » sinon
  useEffect(() => {
    (danger ? cancelRef : confirmRef).current?.focus();
  }, [danger]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onResult(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = [cancelRef.current, confirmRef.current].filter((b): b is HTMLButtonElement => !!b);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) onResult(false);
      }}
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        ref={cardRef}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${danger ? 'text-amber-500' : 'text-teal-600'}`} />
          <div className="min-w-0 space-y-1">
            <h4 id={titleId} className="text-sm font-bold text-slate-900 dark:text-white break-words">
              {title}
            </h4>
            {message && (
              <div id={messageId} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line break-words">
                {message}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResult(false)}
            className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {cancelLabel ?? t('Annuler')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResult(true)}
            className={`px-3 py-2 text-xs font-bold text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              danger ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500' : 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500'
            }`}
          >
            {confirmLabel ?? t('Confirmer')}
          </button>
        </div>
      </div>
    </div>
  );
};

/** À placer une fois autour de l'application (voir main.tsx). */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    resolve?.(confirmed);
    // Rend le focus à l'élément qui avait ouvert le dialogue
    const back = returnFocusRef.current as HTMLElement | null;
    returnFocusRef.current = null;
    if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
  }, []);

  const confirm = useCallback<Confirm>((options) => {
    // Une nouvelle demande annule celle qui serait encore ouverte
    resolveRef.current?.(false);
    if (!resolveRef.current) returnFocusRef.current = document.activeElement;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending(options);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog {...pending} onResult={settle} />}
    </ConfirmContext.Provider>
  );
};
