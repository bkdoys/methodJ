import React, { useState } from 'react';
import { Course, MasteryLevel, RevisionItem, Subject } from '../types';
import { MasteryStars } from './MasteryStars';
import { CheckCircle2, RotateCcw, Sparkles, X } from 'lucide-react';
import { RevisionNotesJournal } from './RevisionNotesJournal';
import { RichTextEditor } from './RichTextEditor';
import confetti from 'canvas-confetti';
import { t } from '../i18n';
import { formatMinutes } from '../utils/dateUtils';

interface CompleteRevisionModalProps {
  revision: RevisionItem;
  course: Course;
  /** Tous les créneaux, pour rappeler les notes des J précédents. */
  revisions?: RevisionItem[];
  subject?: Subject;
  isOpen: boolean;
  onClose: () => void;
  onConfirmComplete: (
    revisionId: string,
    rating: MasteryLevel,
    notes?: string,
    updateCourseMastery?: boolean
  ) => void;
  /** Annule la validation ; renvoie true si elle a bien été annulée. */
  onUndoComplete?: (revisionId: string) => boolean;
}

export const CompleteRevisionModal: React.FC<CompleteRevisionModalProps> = ({
  revision,
  course,
  revisions = [],
  subject,
  isOpen,
  onClose,
  onConfirmComplete,
  onUndoComplete,
}) => {
  const [selectedRating, setSelectedRating] = useState<MasteryLevel>(
    revision.completed && revision.rating
      ? revision.rating
      : course.mastery > 0
      ? course.mastery
      : 2
  );
  const [notes, setNotes] = useState<string>(revision.notes || '');
  const [updateCourseMastery, setUpdateCourseMastery] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Trigger rewarding confetti (seulement à la première validation)
    if (!revision.completed) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // ignore
      }
    }

    onConfirmComplete(revision.id, selectedRating, notes, updateCourseMastery);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-fit min-w-[min(28rem,100%)] max-w-[min(92vw,48rem)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {revision.completed ? t('Révision') : t('Valider la révision')} J{revision.jIndex}{revision.completed ? t(' · Fait ✓') : ''}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{course.title}</p>
              </div>
            </div>
            <button
              aria-label={t('Fermer')}
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {/* Slot Info Banner */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">{t('Durée du créneau effectué :')}</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {formatMinutes(revision.durationMinutes)}
              </span>
            </div>

            {/* Knowledge / Mastery Evaluation : une ligne d'étoiles (largeur stable) */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {t('Votre niveau de maîtrise sur ce cours')}
              </span>
              <MasteryStars level={selectedRating} onChange={setSelectedRating} allowClear={false} size={20} />
            </div>

            {/* Checkbox to sync course general status */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="sync-course-status"
                type="checkbox"
                checked={updateCourseMastery}
                onChange={(e) => setUpdateCourseMastery(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
              />
              <label htmlFor="sync-course-status" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                {t('Mettre à jour le statut global du cours sur le catalogue')}
              </label>
            </div>

            {/* Rappel des notes des J précédents */}
            <RevisionNotesJournal
              courseId={course.id}
              revisions={revisions}
              excludeRevisionId={revision.id}
              beforeJIndex={revision.jIndex}
              title={t('Rappel : notes des J précédents')}
            />

            {/* Revision Notes / Pièges EDN */}
            <div>
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                {t('Notes ou pièges retenus pendant ce créneau (optionnel) :')}
              </label>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder={t('Ex: Ne pas oublier le dosage de la troponine à H0 et H3, contre-indication des bétabloquants en phase aiguë si OAP...')}
                minRows={3}
                maxHeight="45vh"
                className="w-full px-3 py-2 text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            {revision.completed && onUndoComplete && (
              <button
                type="button"
                onClick={() => {
                  if (onUndoComplete(revision.id)) onClose();
                }}
                className="mr-auto px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('Annuler la validation')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              {t('Fermer')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{revision.completed ? t('Mettre à jour') : t('Valider le créneau')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
