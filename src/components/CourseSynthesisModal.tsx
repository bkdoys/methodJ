import React, { useEffect, useState } from 'react';
import { RichNote } from './RichNote';
import { Course, RevisionItem, Subject } from '../types';
import { MasteryStars } from './MasteryStars';
import { RevisionNotesJournal } from './RevisionNotesJournal';
import { Check, CopyPlus, NotebookPen, X } from 'lucide-react';
import { appendNoteEntry, formatSlotNoteEntry, hasNoteEntry, MAX_NOTES_LENGTH } from '../utils/notes';
import { getCourseEffectiveColor } from '../utils/colorUtils';
import { t } from '../i18n';

interface CourseSynthesisModalProps {
  course: Course;
  subject: Subject;
  revisions: RevisionItem[];
  isDark?: boolean;
  /** Enregistre les notes du cours (ajout d'une note de créneau). */
  onUpdateCourseNotes?: (courseId: string, notes: string) => void;
  onClose: () => void;
}

/** Synthèse en lecture seule : notes du cours + notes saisies sur chaque créneau (J). */
export const CourseSynthesisModal: React.FC<CourseSynthesisModalProps> = ({
  course,
  subject,
  revisions,
  isDark = false,
  onUpdateCourseNotes,
  onClose,
}) => {
  const [error, setError] = useState<string | null>(null);
  const color = getCourseEffectiveColor(course, subject);
  // Même parti pris que la vue Cours : fenêtre neutre, couleur du cours en barre fine à gauche et pastille teintée
  const badgeStyle = {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    color: `color-mix(in srgb, ${color} 78%, ${isDark ? '#f1f5f9' : '#0f172a'})`,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const entryFor = (r: RevisionItem) => formatSlotNoteEntry(r.jIndex, r.completedDate || r.scheduledDate, r.notes ?? '');

  const addToCourseNotes = (r: RevisionItem) => {
    if (!onUpdateCourseNotes) return;
    const res = appendNoteEntry(course.notes, entryFor(r));
    if (res.status === 'added') {
      setError(null);
      onUpdateCourseNotes(course.id, res.notes);
    } else if (res.status === 'too-long') {
      setError(
        t('Les notes du cours dépasseraient la limite de {max} caractères ({over} en trop). Raccourcissez-les d\'abord.', { max: MAX_NOTES_LENGTH, over: res.overBy })
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Synthèse des notes : {title}', { title: course.title })}
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `inset 4px 0 0 ${color}` }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-5 py-4 pl-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-bold"
                style={badgeStyle}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {subject.name}
              </span>
              <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                {course.itemCode}
              </span>
              <MasteryStars level={course.mastery} size={14} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <NotebookPen className="w-6 h-6 shrink-0" style={{ color }} />
              <span className="truncate">{course.title}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Fermer')}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid gap-5 md:grid-cols-5">
          <section className="md:col-span-2 space-y-1.5">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {t('Notes du cours & pièges d\'annales')}
            </h3>
            <div
              style={{ borderLeft: `3px solid ${color}` }}
              className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300"
            >
              {course.notes?.trim() ? (
                <RichNote text={course.notes} />
              ) : (
                <span className="text-slate-400 dark:text-slate-500 italic text-xs">
                  {t('Aucune note de cours.')}
                </span>
              )}
            </div>
          </section>

          <section className="md:col-span-3">
            <RevisionNotesJournal
              courseId={course.id}
              revisions={revisions}
              title={t('Notes retenues à chaque créneau')}
              expanded
              accentColor={color}
              emptyMessage={t('Aucune note saisie sur les créneaux de ce cours.')}
              renderAction={
                onUpdateCourseNotes
                  ? (r) =>
                      hasNoteEntry(course.notes, entryFor(r)) ? (
                        <span
                          title={t('Déjà dans les notes du cours')}
                          aria-label={t('Déjà dans les notes du cours')}
                          role="img"
                          className="p-1.5 inline-flex text-emerald-600 dark:text-emerald-400"
                        >
                          <Check className="w-4 h-4" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCourseNotes(r)}
                          title={t('Ajouter aux notes du cours')}
                          aria-label={t('Ajouter la note de J{n} aux notes du cours', { n: r.jIndex })}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                          style={{ color }}
                        >
                          <CopyPlus className="w-4 h-4" />
                        </button>
                      )
                  : undefined
              }
            />
            {error && (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
