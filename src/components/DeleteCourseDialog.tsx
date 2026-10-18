import React, { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowRightLeft, Trash2, X } from 'lucide-react';
import { plural, t } from '../i18n';

interface DeleteCourseDialogProps {
  title: string;
  /** Cartes du cours : elles disparaissent avec lui, sauf si on les déplace. */
  cardCount: number;
  onDeleteAll: () => void;
  onMoveCards: () => void;
  onClose: () => void;
}

/**
 * Suppression d'un cours qui contient des cartes : on ne les perd jamais sans l'avoir décidé. Deux issues, supprimer
 * le cours avec ses cartes ou déplacer les cartes (historique de révision compris) vers un autre cours avant de le
 * supprimer. Échap, un clic à côté ou « Annuler » ne changent rien.
 */
export const DeleteCourseDialog: React.FC<DeleteCourseDialogProps> = ({ title, cardCount, onDeleteAll, onMoveCards, onClose }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-course-title"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5">
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h2 id="delete-course-title" className="text-sm font-bold text-slate-900 dark:text-white break-words">
              {t('Supprimer le cours « {title} » ?', { title })}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {plural(cardCount, 'Ce cours contient {n} carte.', 'Ce cours contient {n} cartes.')}{' '}
              {t('Ses révisions planifiées seront supprimées. Que faire de ses cartes ?')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('Fermer')}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-2">
          <button
            type="button"
            onClick={onMoveCards}
            className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30 hover:bg-teal-50 dark:hover:bg-teal-950/50"
          >
            <ArrowRightLeft className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 dark:text-white">{t('Déplacer les cartes vers un autre cours')}</span>
              <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {t('Elles gardent leur historique de révision ; le cours est supprimé ensuite.')}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onDeleteAll}
            className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-rose-700 dark:text-rose-400">
                {plural(cardCount, 'Tout supprimer, avec la carte', 'Tout supprimer, avec les {n} cartes')}
              </span>
              <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">{t('Action irréversible.')}</span>
            </span>
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('Annuler')}
          </button>
        </div>
      </div>
    </div>
  );
};
