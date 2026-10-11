import React, { useState } from 'react';
import { ArrowRightLeft, BookOpen, Check, Clock, Play, X } from 'lucide-react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { RichTextEditor } from './RichTextEditor';
import { DurationSelect } from './DurationSelect';
import { MASTERY_CONFIG } from './MasteryBadge';
import { MasteryStars } from './MasteryStars';
import { RichNote } from './RichNote';
import { formatTime, getDayBreaks, getDayWindow, resolveDayLayout } from '../utils/dayLayout';
import { formatFrenchDate, formatMinutes, getTodayIso } from '../utils/dateUtils';
import { getCourseEffectiveColor, getSubjectBadgeStyle } from '../utils/colorUtils';
import { t } from '../i18n';

interface SlotDetailModalProps {
  revision: RevisionItem;
  course: Course;
  subject: Subject | undefined;
  /** Tous les créneaux (pour l'heure affichée et le rappel des notes des J précédents). */
  revisions: RevisionItem[];
  settings: AppSettings;
  onClose: () => void;
  /** Bascule vers la fiche du cours. */
  onOpenCourse: () => void;
  onResizeSlot: (revisionId: string, durationMinutes: number) => void;
  /** Enregistre la note de préparation d'un créneau non validé. */
  onUpdateNotes: (revisionId: string, notes: string) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
}

/** Vue d'un seul créneau J : l'essentiel pour agir dessus, avec un lien vers le cours complet. */
export const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  revision: rev,
  course,
  subject,
  revisions,
  settings,
  onClose,
  onOpenCourse,
  onResizeSlot,
  onUpdateNotes,
  onOpenCompleteModal,
  onOpenQuickShift,
  onStartStudySession,
}) => {
  const [note, setNote] = useState(rev.notes ?? '');
  // Enregistre la note en cours avant toute action qui quitte ou change cette fiche
  const commit = () => {
    if (!rev.completed) onUpdateNotes(rev.id, note);
  };
  const then = (action: () => void) => () => {
    commit();
    action();
  };
  const todayIso = getTodayIso();
  const color = getCourseEffectiveColor(course, subject);
  const placement = resolveDayLayout(
    revisions.filter((r) => r.scheduledDate === rev.scheduledDate),
    getDayWindow(settings, rev.scheduledDate).start,
    getDayBreaks(settings, rev.scheduledDate)
  ).find((p) => p.id === rev.id);
  const isToday = rev.scheduledDate === todayIso;
  const isPastDue = !rev.completed && rev.scheduledDate < todayIso;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && then(onClose)()}
    >
      <div
        role="dialog"
        aria-label={t('Créneau J{n}', { n: rev.jIndex })}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-fit min-w-[min(28rem,100%)] max-w-[min(92vw,48rem)] my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="h-2 w-full" style={{ backgroundColor: color }} />

        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm px-2 py-0.5 rounded bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-300">
                J{rev.jIndex}
              </span>
              {subject && (
                <span className="subject-badge px-2 py-0.5 rounded-md text-xs font-bold" style={getSubjectBadgeStyle(course, subject)}>
                  {subject.name}
                </span>
              )}
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">{course.itemCode}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{course.title}</h2>
          </div>
          <button
            onClick={then(onClose)}
            aria-label={t('Fermer')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatFrenchDate(rev.scheduledDate)}</span>
            {placement && (
              <span className="font-mono text-slate-600 dark:text-slate-400">
                {formatTime(placement.start)}–{formatTime(placement.end)}
              </span>
            )}
            {isToday && (
              <span className="text-[10px] font-bold text-teal-700 bg-teal-100 dark:bg-teal-900/50 dark:text-teal-300 px-1.5 py-0.5 rounded">
                {t('Aujourd\'hui')}
              </span>
            )}
            {isPastDue && (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-900/50 dark:text-rose-300 px-1.5 py-0.5 rounded">
                {t('En retard')}
              </span>
            )}
            {rev.completed && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                {t('Validé')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {rev.completed ? (
              <span>{t('Créneau de {d}', { d: formatMinutes(rev.durationMinutes) })}</span>
            ) : (
              <>
                <span>{t('Créneau de')}</span>
                <DurationSelect
                  value={rev.durationMinutes}
                  onChange={(m) => onResizeSlot(rev.id, m)}
                  label={t('Durée du créneau J{n}', { n: rev.jIndex })}
                />
              </>
            )}
          </div>

          {rev.completed && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('Niveau de maîtrise')}</span>
              <MasteryStars level={rev.rating ?? 0} size={18} />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 min-w-[4.5rem]">
                {MASTERY_CONFIG[rev.rating ?? 0]?.shortLabel}
              </span>
            </div>
          )}

          {!rev.completed && (
            <div>
              <label htmlFor="slot-note" className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                {t('Note de préparation')}
              </label>
              <RichTextEditor
                id="slot-note"
                minRows={3}
                maxHeight="35vh"
                value={note}
                onChange={setNote}
                onBlur={commit}
                placeholder={t('Ce que je veux revoir ou vérifier pendant ce créneau…')}
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}

          {rev.completed && rev.notes && (
            <RichNote
              text={rev.notes}
              className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2"
            />
          )}

        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
          <button
            onClick={then(() => onOpenCompleteModal({ ...rev, notes: note.trim() || undefined }))}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              rev.completed
                ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                : 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-xs'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {rev.completed ? t('Modifier la validation') : t('Valider')}
          </button>
          {!rev.completed && (
            <>
              <button
                onClick={then(() => onOpenQuickShift(rev))}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg"
                title={t('Décaler ce créneau (cascade automatique)')}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600" />
                {t('Décaler')}
              </button>
              <button
                onClick={then(() => {
                  onStartStudySession(rev);
                  onClose();
                })}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
              >
                <Play className="w-3 h-3 fill-current" />
                {t('Lancer')}
              </button>
            </>
          )}
          <button
            onClick={then(onOpenCourse)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t('Voir le cours')}
          </button>
        </div>
      </div>
    </div>
  );
};
