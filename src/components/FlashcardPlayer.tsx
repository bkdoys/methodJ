import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Undo2, X } from 'lucide-react';
import { CardReview, Course, Deck } from '../types';
import {
  answer,
  currentItem,
  SessionItem,
  SessionState,
  SessionSummary,
  startSession,
  summarize,
} from '../utils/cardSession';
import { ReviewEvent } from '../utils/reviewLog';
import { CardGrade, GRADES, gradeCard, intervalParts, isShortTerm, previewIntervals } from '../utils/srs';
import { FlashcardText } from './FlashcardText';
import { CardImage } from './CardImage';
import { getLocale, plural, t } from '../i18n';

export type PlayMode = 'schedule' | 'cram';

interface FlashcardPlayerProps {
  /** Titre de la séance (cours, dossier, discipline…). */
  title: string;
  color: string;
  items: SessionItem[];
  decks: Record<string, Deck>;
  courses: Course[];
  /** `schedule` : chaque note met à jour la programmation de la carte ; `cram` : révision libre, sans effet. */
  mode: PlayMode;
  /**
   * Nouvel état d'une sous-carte (absent = remis à « jamais vue », pour annuler). `event` dit s'il s'agit d'une note
   * (avec l'état d'avant) ou de l'annulation de la dernière, pour tenir le journal.
   */
  onReview: (courseId: string, key: string, review: CardReview | undefined, event: ReviewEvent) => void;
  /** Fin de séance : `summary` absent si aucune carte n'a été notée ; `finished` = toutes les cartes jouées. */
  onClose: (summary: SessionSummary | undefined, finished: boolean) => void;
  /** Libellé du bouton de fin (ex. « Valider le créneau » depuis un J). */
  finishLabel?: string;
}

interface HistoryEntry {
  state: SessionState;
  courseId: string;
  key: string;
  before: CardReview | undefined;
  /** État posé par la note (programmation seulement) : l'annuler retire l'entrée du journal. */
  after?: CardReview;
}

const GRADE_STYLE: Record<CardGrade, string> = {
  1: 'bg-rose-600 hover:bg-rose-700',
  2: 'bg-amber-500 hover:bg-amber-600',
  3: 'bg-emerald-600 hover:bg-emerald-700',
  4: 'bg-sky-600 hover:bg-sky-700',
};

const gradeLabel = (g: CardGrade) =>
  g === 1 ? t('Encore') : g === 2 ? t('Difficile') : g === 3 ? t('Bien') : t('Facile');

function formatInterval(ms: number): string {
  const { n, unit } = intervalParts(ms);
  const shown = Number(n).toLocaleString(getLocale());
  if (unit === 'min') return t('{n} min', { n: shown });
  if (unit === 'h') return t('{n} h', { n: shown });
  if (unit === 'd') return t('{n} j', { n: shown });
  if (unit === 'mo') return t('{n} mois', { n: shown });
  return t('{n} an', { n: shown });
}

/** Lecteur plein écran : recto, réponse au toucher (ou Espace), quatre notes (touches 1 à 4), annulation. */
export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({
  title,
  color,
  items,
  decks,
  courses,
  mode,
  onReview,
  onClose,
  finishLabel,
}) => {
  const [session, setSession] = useState<SessionState>(() => startSession(items));
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const item = currentItem(session);
  const deck = item ? decks[item.courseId] : undefined;
  const card = item ? deck?.cards.find((c) => c.id === item.cardId && !c.deleted) : undefined;
  const review = item ? deck?.review[item.key] : undefined;
  const multiCourse = useMemo(() => new Set(items.map((i) => i.courseId)).size > 1, [items]);
  const courseTitle = item && multiCourse ? courses.find((c) => c.id === item.courseId)?.title : undefined;
  const intervals = useMemo(
    () => (item && revealed && mode === 'schedule' ? previewIntervals(review, new Date()) : null),
    [item, revealed, mode, review]
  );
  const summary = useMemo(() => summarize(session), [session]);
  const finished = !item;

  // Une carte supprimée pendant la séance est sautée
  useEffect(() => {
    if (item && !card) setSession((s) => ({ ...s, pos: s.pos + 1 }));
  }, [item, card]);

  const grade = useCallback(
    (g: CardGrade) => {
      if (!item || !revealed) return;
      const now = new Date();
      let again = g === 1;
      let gradeAfter: CardReview | undefined;
      if (mode === 'schedule') {
        const next = gradeCard(review, g, now);
        gradeAfter = next;
        onReview(item.courseId, item.key, next, { grade: g, before: review });
        again = isShortTerm(next, now);
      }
      setHistory((h) => [
        ...h,
        { state: session, courseId: item.courseId, key: item.key, before: review, after: gradeAfter },
      ]);
      setSession(answer(session, g, again));
      setRevealed(false);
    },
    [item, revealed, mode, review, onReview, session]
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    if (mode === 'schedule' && last.after) onReview(last.courseId, last.key, last.before, { undone: last.after });
    setHistory((h) => h.slice(0, -1));
    setSession(last.state);
    setRevealed(true);
  }, [history, mode, onReview]);

  const close = useCallback(
    () => onClose(summary.cards > 0 ? summary : undefined, finished),
    [onClose, summary, finished]
  );

  const replayMissed = () => {
    const missed = new Set(Object.entries(session.first).filter(([, g]) => g === 1).map(([k]) => k));
    const seen = new Set<string>();
    const again = session.queue.filter((i) => missed.has(i.key) && !seen.has(i.key) && seen.add(i.key));
    setSession(startSession(again));
    setHistory([]);
    setRevealed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (!finished && !revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (!finished && revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        grade(Number(e.key) as CardGrade);
      } else if ((e.key === 'Backspace' || e.key === 'z') && history.length > 0) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, revealed, grade, undo, close, history.length]);

  const total = session.queue.length;
  const progress = total ? Math.min(100, Math.round((session.pos / total) * 100)) : 100;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-white dark:bg-slate-950" role="dialog" aria-modal="true" aria-label={title}>
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: color }} />

      {/* Barre du haut */}
      <div
        className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          aria-label={t('Fermer')}
          onClick={close}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</p>
          {mode === 'cram' && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('Révision libre : la programmation des cartes ne change pas')}</p>
          )}
        </div>
        {!finished && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              {Math.min(session.pos + 1, total)} / {total}
            </span>
            <div className="hidden sm:block w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: color }} />
            </div>
          </div>
        )}
      </div>

      {finished ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-5">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('Séance terminée')}</h2>
            {summary.cards > 0 ? (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {plural(summary.cards, '{n} carte', '{n} cartes')} · {t('{p} % réussies', { p: summary.success })}
                </p>
                <div className="flex justify-center gap-2 flex-wrap">
                  {GRADES.map((g) => (
                    <span key={g} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {gradeLabel(g)} {summary.byGrade[g]}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('Aucune carte à réviser ici.')}</p>
            )}
            <div className="flex justify-center gap-3 flex-wrap pt-2">
              {summary.byGrade[1] > 0 && (
                <button
                  type="button"
                  onClick={replayMissed}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t('Revoir les ratées')}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="px-5 py-2.5 text-sm font-bold rounded-xl text-white bg-teal-600 hover:bg-teal-700"
              >
                {finishLabel ?? t('Terminer')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Carte : un toucher affiche la réponse */}
          <div
            className={`flex-1 overflow-y-auto px-5 sm:px-8 py-8 ${revealed ? '' : 'cursor-pointer'}`}
            onClick={() => !revealed && setRevealed(true)}
          >
            {card && (
              <div className="max-w-2xl mx-auto space-y-5">
                {courseTitle && <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">{courseTitle}</p>}
                {card.front && (
                  <FlashcardText
                    text={card.front}
                    cloze={card.kind === 'cloze'}
                    clozeNumber={item?.cloze}
                    revealed={revealed}
                    className="block text-xl sm:text-2xl leading-relaxed text-slate-900 dark:text-slate-100"
                  />
                )}
                {card.frontImage && (
                  <div className="flex justify-center">
                    <CardImage
                      key={`${item?.key}`}
                      id={card.frontImage}
                      zoomable
                      maxHeight="max-h-[55vh]"
                      occlusion={
                        card.kind === 'occlusion'
                          ? { masks: card.masks ?? [], mode: card.occlusionMode ?? 'hide-all', activeGroup: item?.mask, revealed }
                          : undefined
                      }
                    />
                  </div>
                )}
                {revealed && (card.back || card.backImage) && (
                  <>
                    <hr className="border-slate-200 dark:border-slate-800" />
                    {card.back && (
                      <FlashcardText text={card.back} className="block text-lg sm:text-xl leading-relaxed text-slate-700 dark:text-slate-300" />
                    )}
                    {card.backImage && (
                      <div className="flex justify-center">
                        <CardImage id={card.backImage} zoomable maxHeight="max-h-[45vh]" />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-4 sm:px-6 pt-4"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="max-w-2xl mx-auto">
              {revealed ? (
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => grade(g)}
                      className={`flex flex-col items-center justify-center min-h-14 py-2.5 rounded-xl text-white font-bold shadow-xs transition-colors ${GRADE_STYLE[g]}`}
                    >
                      <span className="text-sm">{gradeLabel(g)}</span>
                      {intervals && <span className="text-[11px] font-medium opacity-90">{formatInterval(intervals[g])}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="w-full min-h-14 rounded-xl text-base font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-xs"
                >
                  {t('Afficher la réponse')}
                </button>
              )}
              <div className="flex items-center justify-between h-9 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="hidden sm:inline">
                  {revealed ? t('Touches 1 à 4 pour noter') : t('Espace pour afficher la réponse')}
                </span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={undo}
                    className="ml-auto flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    {t('Annuler')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
