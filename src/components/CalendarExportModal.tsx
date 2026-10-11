import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { CalendarExportSection } from './CalendarExportSection';
import { t } from '../i18n';

interface CalendarExportModalProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onClose: () => void;
}

/** Petite fenêtre d'export vers un agenda, ouverte depuis le planning (même contenu que Réglages > Sauvegarde). */
export const CalendarExportModal: React.FC<CalendarExportModalProps> = ({ onClose, ...section }) => {
  // Après un export réussi, on laisse voir le résultat un instant puis la fenêtre se referme
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const handleDone = (kind: 'ics' | 'google') => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(onClose, kind === 'google' ? 2500 : 900);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={t('Exporter vers un agenda (.ics)')}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg my-6 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex justify-end px-3 pt-3 -mb-1">
          <button
            onClick={onClose}
            aria-label={t('Fermer')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <CalendarExportSection {...section} onDone={handleDone} />
        </div>
      </div>
    </div>
  );
};
