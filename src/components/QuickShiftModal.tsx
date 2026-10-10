import React, { useState } from 'react';
import { Course, RevisionItem, Subject } from '../types';
import { addDays, diffInDays, formatFrenchDate, parseIsoDate } from '../utils/dateUtils';
import { Calendar, ArrowRight, AlertCircle, Sparkles, X } from 'lucide-react';
import { t } from '../i18n';

interface QuickShiftModalProps {
  revision: RevisionItem;
  course: Course;
  subject?: Subject;
  allCourseRevisions: RevisionItem[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmShift: (revisionId: string, newDate: string, autoCascade: boolean) => void;
}

export const QuickShiftModal: React.FC<QuickShiftModalProps> = ({
  revision,
  course,
  subject,
  allCourseRevisions,
  isOpen,
  onClose,
  onConfirmShift,
}) => {
  const [targetDate, setTargetDate] = useState<string>(addDays(revision.scheduledDate, 1));
  const [autoCascade, setAutoCascade] = useState<boolean>(true);

  if (!isOpen) return null;

  const currentDelta = diffInDays(targetDate, revision.scheduledDate);

  // Subsequent uncompleted revisions that will be shifted if autoCascade is true
  const subsequentRevisions = allCourseRevisions
    .filter((r) => r.courseId === course.id && r.jIndex > revision.jIndex && !r.completed)
    .sort((a, b) => a.jIndex - b.jIndex);

  const handlePreset = (days: number) => {
    setTargetDate(addDays(revision.scheduledDate, days));
  };

  const handleConfirm = () => {
    if (targetDate === revision.scheduledDate) {
      onClose();
      return;
    }
    onConfirmShift(revision.id, targetDate, autoCascade);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('Décaler la révision J{n}', { n: revision.jIndex })}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{course.title}</p>
            </div>
          </div>
          <button
            aria-label={t('Fermer')}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Current vs New Date comparison */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">{t('Date initiale (J{n})', { n: revision.jIndex })}</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">
                {formatFrenchDate(revision.scheduledDate)}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="text-right">
              <span className="text-[11px] font-medium text-teal-800 dark:text-teal-300 block">{t('Nouvelle date')}</span>
              <span className="text-sm font-bold text-teal-700 dark:text-teal-400 capitalize">
                {formatFrenchDate(targetDate)}
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              {t('Décalage rapide :')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('+1 jour'), days: 1 },
                { label: t('+2 jours'), days: 2 },
                { label: t('+3 jours'), days: 3 },
                { label: t('+1 semaine'), days: 7 },
              ].map((p) => {
                const isSelected = currentDelta === p.days;
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => handlePreset(p.days)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Input */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              {t('Ou choisir une date précise :')}
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => e.target.value && setTargetDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Cascade shifting explanation & toggle */}
          <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 space-y-2">
            <div className="flex items-start gap-2.5">
              <input
                id="cascade-check"
                type="checkbox"
                checked={autoCascade}
                onChange={(e) => setAutoCascade(e.target.checked)}
                className="mt-0.5 rounded border-teal-400 text-teal-600 focus:ring-teal-500 h-4 w-4"
              />
              <label htmlFor="cascade-check" className="text-xs font-bold text-teal-950 dark:text-teal-200 cursor-pointer">
                {t('Décalage automatique en cascade (recommandé)')}
              </label>
            </div>

            <p className="text-xs text-teal-900 dark:text-teal-300 leading-relaxed pl-6">
              {t('Maintient les intervalles optimaux de répétition espacée. Si vous décalez ce')}{' '}
              <strong className="font-bold">J{revision.jIndex}</strong> {t('de')}{' '}
              <strong className="font-mono font-bold">{currentDelta >= 0 ? `+${currentDelta}` : currentDelta} {t('j')}</strong>{t(', tous les créneaux suivants non faits seront décalés du même nombre de jours.')}
            </p>

            {autoCascade && subsequentRevisions.length > 0 && currentDelta !== 0 && (
              <div className="mt-2 pl-6 pt-2 border-t border-teal-200/60 dark:border-teal-800/60 text-xs text-teal-950 dark:text-teal-200 space-y-1">
                <span className="font-bold text-[11px] block text-teal-800 dark:text-teal-300">
                  {t('Répercussions prévues :')}
                </span>
                <ul className="space-y-0.5 font-mono text-[11px]">
                  {subsequentRevisions.slice(0, 3).map((sub) => (
                    <li key={sub.id} className="flex items-center gap-1.5">
                      <span className="font-bold">J{sub.jIndex}</span> : {sub.scheduledDate} ➔{' '}
                      <span className="font-bold text-teal-700 dark:text-teal-400">
                        {addDays(sub.scheduledDate, currentDelta)}
                      </span>
                    </li>
                  ))}
                  {subsequentRevisions.length > 3 && (
                    <li className="text-[10px] text-teal-700 dark:text-teal-400 italic">
                      {t('+ {n} révision(s) suivante(s)', { n: subsequentRevisions.length - 3 })}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            {t('Annuler')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors"
          >
            Confirmer le décalage ({currentDelta >= 0 ? `+${currentDelta}` : currentDelta}j)
          </button>
        </div>
      </div>
    </div>
  );
};
