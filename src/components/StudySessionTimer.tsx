import React, { useState, useEffect, useRef } from 'react';
import { Course, LinkType, MasteryLevel, RevisionItem, Subject } from '../types';
import { CourseLinkIcons } from './CourseLinkIcons';
import { MasteryStars } from './MasteryStars';
import { RevisionNotesJournal } from './RevisionNotesJournal';
import { RichTextEditor } from './RichTextEditor';
import { formatMinutes, getTodayIso } from '../utils/dateUtils';
import { getSubjectBadgeStyle } from '../utils/colorUtils';
import {
  Play,
  Layers,
  Pause,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { plural, t } from '../i18n';
import { isRReview, revLabel } from '../utils/jMethod';

interface StudySessionTimerProps {
  revisions: RevisionItem[];
  courses: Course[];
  subjects: Subject[];
  linkTypes: LinkType[];
  activeRevisionId?: string;
  onSelectRevision: (revisionId: string) => void;
  onCompleteRevision: (
    revisionId: string,
    rating: MasteryLevel,
    notes?: string,
    updateCourseMastery?: boolean
  ) => void;
  /** Nombre de cartes d'un cours, et lancement de leur révision depuis le créneau. */
  cardCount?: (courseId: string) => number;
  onPlayCards?: (revision: RevisionItem) => void;
}

export const StudySessionTimer: React.FC<StudySessionTimerProps> = ({
  revisions,
  courses,
  subjects,
  linkTypes,
  activeRevisionId,
  onSelectRevision,
  onCompleteRevision,
  cardCount,
  onPlayCards,
}) => {
  const todayIso = getTodayIso();
  const todayRevisions = revisions.filter((r) => r.scheduledDate === todayIso);

  const currentRevision = revisions.find((r) => r.id === activeRevisionId) || todayRevisions[0];
  const currentCourse = currentRevision
    ? courses.find((c) => c.id === currentRevision.courseId)
    : courses[0];

  const currentSubject = currentCourse
    ? subjects.find((s) => s.id === currentCourse.subjectId)
    : subjects[0];

  // Default duration in seconds based on 90 min (J0/J1) or 60 min (others)
  const defaultSeconds = currentRevision
    ? currentRevision.durationMinutes * 60
    : 90 * 60;

  const [timeLeft, setTimeLeft] = useState(defaultSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [studyNotes, setStudyNotes] = useState('');
  const [rating, setRating] = useState<MasteryLevel>(
    currentCourse?.mastery && currentCourse.mastery > 0 ? currentCourse.mastery : 2
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const TIMER_STORAGE_KEY = 'medj_active_timer_session';

  // Restore or set timer duration when revision changes
  useEffect(() => {
    if (currentRevision) {
      const durSec = currentRevision.durationMinutes * 60;
      setStudyNotes(currentRevision.notes || '');
      if (currentCourse && currentCourse.mastery > 0) {
        setRating(currentCourse.mastery);
      }

      // Check if there was an active session in sessionStorage
      try {
        const raw = sessionStorage.getItem(TIMER_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.revisionId === currentRevision.id) {
            if (saved.isRunning && saved.targetEndTime) {
              const diffSec = Math.round((saved.targetEndTime - Date.now()) / 1000);
              if (diffSec > 0) {
                setTimeLeft(diffSec);
                setIsRunning(true);
                return;
              }
            } else if (typeof saved.timeLeft === 'number') {
              setTimeLeft(saved.timeLeft);
              setIsRunning(false);
              return;
            }
          }
        }
      } catch {
        // ignore parse error
      }

      setTimeLeft(durSec);
      setIsRunning(false);
    }
  }, [currentRevision?.id]);

  // Synchronize active timer session in sessionStorage
  useEffect(() => {
    if (!currentRevision) return;
    try {
      if (isRunning) {
        const targetEndTime = Date.now() + timeLeft * 1000;
        sessionStorage.setItem(
          TIMER_STORAGE_KEY,
          JSON.stringify({
            revisionId: currentRevision.id,
            targetEndTime,
            isRunning: true,
          })
        );
      } else {
        sessionStorage.setItem(
          TIMER_STORAGE_KEY,
          JSON.stringify({
            revisionId: currentRevision.id,
            timeLeft,
            isRunning: false,
          })
        );
      }
    } catch {
      // ignore
    }
  }, [isRunning, currentRevision?.id]);

  // Fermer la vue chrono met la séance en pause (le temps restant est figé). Un rafraîchissement
  // de page n'exécute pas ce nettoyage : il garde l'heure de fin enregistrée ci-dessus et le
  // décompte continue.
  const latestTimer = useRef({ isRunning, timeLeft, revisionId: currentRevision?.id });
  latestTimer.current = { isRunning, timeLeft, revisionId: currentRevision?.id };
  useEffect(() => {
    return () => {
      const { isRunning: running, timeLeft: remaining, revisionId } = latestTimer.current;
      if (!running || !revisionId) return;
      try {
        sessionStorage.setItem(
          TIMER_STORAGE_KEY,
          JSON.stringify({ revisionId, timeLeft: remaining, isRunning: false })
        );
      } catch {
        // ignore
      }
    };
  }, []);

  // Screen Wake Lock API to prevent iPad screen from sleeping during study session
  useEffect(() => {
    let released = false;

    async function acquireWakeLock() {
      if ('wakeLock' in navigator && isRunning && document.visibilityState === 'visible') {
        try {
          const lock = await (navigator as any).wakeLock.request('screen');
          if (!released) {
            wakeLockRef.current = lock;
          } else {
            lock.release().catch(() => {});
          }
        } catch (err) {
          console.warn('Wake Lock request error:', err);
        }
      }
    }

    if (isRunning) {
      acquireWakeLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isRunning]);

  // Timer interval tick
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            sessionStorage.removeItem(TIMER_STORAGE_KEY);
            playCompletionSound();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const playCompletionSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // audio context may require user gesture
    }
  };

  const handleToggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    sessionStorage.removeItem(TIMER_STORAGE_KEY);
    setTimeLeft(currentRevision ? currentRevision.durationMinutes * 60 : 90 * 60);
  };

  // +5 / −5 min ; on garde au moins 1 minute pour ne pas terminer le créneau par mégarde
  const handleAddMinutes = (mins: number) => {
    setTimeLeft((prev) => Math.max(60, prev + mins * 60));
  };

  const handleFinishSlot = () => {
    if (!currentRevision) return;

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    onCompleteRevision(currentRevision.id, rating, studyNotes, true);
    setIsRunning(false);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalDuration = currentRevision ? currentRevision.durationMinutes * 60 : 90 * 60;
  const progressPercent = Math.min(100, Math.max(0, ((totalDuration - timeLeft) / totalDuration) * 100));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Active Slot Selector Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              {t('Créneau d\'apprentissage sélectionné :')}
            </span>
            {currentCourse ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="subject-badge px-2 py-0.5 rounded text-xs font-bold"
                  style={getSubjectBadgeStyle(currentCourse, currentSubject)}
                >
                  {currentSubject?.name}
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {currentCourse.title}
                </span>
                {currentRevision && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    {revLabel(currentRevision)} ({formatMinutes(currentRevision.durationMinutes)})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('Aucun cours sélectionné')}</span>
            )}
          </div>

          {/* Quick select other slots of today */}
          <div className="flex items-center gap-2 phone:w-full phone:min-w-0">
            <select
              value={currentRevision?.id || ''}
              onChange={(e) => onSelectRevision(e.target.value)}
              className="text-xs px-3 py-2 phone:w-full phone:min-w-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:ring-1 focus:ring-teal-500"
            >
              <optgroup label={t('Créneaux prévus aujourd\'hui')}>
                {todayRevisions.map((r) => {
                  const c = courses.find((course) => course.id === r.courseId);
                  return (
                    <option key={r.id} value={r.id}>
                      {revLabel(r)} ({formatMinutes(r.durationMinutes)}) · {c?.title}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label={t('Tous les autres cours')}>
                {revisions
                  .filter((r) => r.scheduledDate !== todayIso && !r.completed)
                  .slice(0, 10)
                  .map((r) => {
                    const c = courses.find((course) => course.id === r.courseId);
                    return (
                      <option key={r.id} value={r.id}>
                        {revLabel(r)} ({r.scheduledDate}) · {c?.title}
                      </option>
                    );
                  })}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Main Focus Timer Display */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-xs text-center space-y-6 relative overflow-hidden transition-colors">
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-teal-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Course Header in Focus */}
        <div className="space-y-1">
          <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {currentRevision && !isRReview(currentRevision) && (currentRevision.jIndex === 0 || currentRevision.jIndex === 1)
              ? t('Séance approfondie (créneau {d})', { d: formatMinutes(currentRevision.durationMinutes) })
              : currentRevision
              ? t('Rappel actif espacé (créneau {d})', { d: formatMinutes(currentRevision.durationMinutes) })
              : t('Rappel actif espacé')}
          </span>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight max-w-xl mx-auto">
            {currentCourse?.title || t('Session de travail libre')}
          </h2>
          {currentCourse?.links && currentCourse.links.length > 0 && (
            <div className="flex justify-center pt-2">
              <CourseLinkIcons links={currentCourse.links} linkTypes={linkTypes} labels className="justify-center gap-2" />
            </div>
          )}
          {currentCourse && currentRevision && onPlayCards && (cardCount?.(currentCourse.id) ?? 0) > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => onPlayCards(currentRevision)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/15 hover:bg-teal-100 dark:hover:bg-teal-500/25"
              >
                <Layers className="w-4 h-4" />
                {t('Réviser les cartes')} · {plural(cardCount?.(currentCourse.id) ?? 0, '{n} carte', '{n} cartes')}
              </button>
            </div>
          )}
          {currentCourse && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('Niveau de maîtrise actuel :')}</span>
              <MasteryStars level={currentCourse.mastery} size={16} />
            </div>
          )}
        </div>

        {/* Big Tabular Clock */}
        <div className="py-4">
          <div className="text-6xl sm:text-7xl md:text-8xl font-mono font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 block">
            {t('{pct}% du créneau écoulé', { pct: progressPercent.toFixed(0) })}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleReset}
            className="p-3 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
            title={t('Réinitialiser le chronomètre')}
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={handleToggleTimer}
            className={`px-8 py-3.5 rounded-xl font-bold text-base transition-all shadow-sm flex items-center gap-2 ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>{t('Pause')}</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>{t('Démarrer le créneau')}</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleAddMinutes(-5)}
            className="px-3 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
            title={t('Retirer 5 minutes')}
          >
            {t('−5 min')}
          </button>

          <button
            onClick={() => handleAddMinutes(5)}
            className="px-3 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
            title={t('Ajouter 5 minutes')}
          >
            {t('+5 min')}
          </button>
        </div>

        {/* Completion & Self-assessment section */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 max-w-lg mx-auto space-y-4 text-left">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {t('Évaluer votre niveau de mémorisation après ce créneau :')}
            </span>
            <MasteryStars level={rating} onChange={setRating} size={20} />
          </div>

          {currentCourse && currentRevision && (
            <RevisionNotesJournal
              courseId={currentCourse.id}
              revisions={revisions}
              excludeRevisionId={currentRevision.id}
              beforeJIndex={currentRevision.jIndex}
              title={t('Rappel : notes des J précédents')}
            />
          )}

          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              {t('Notes de séance ou points difficiles :')}
            </label>
            <RichTextEditor
              value={studyNotes}
              onChange={setStudyNotes}
              placeholder={t('Ex: Bien revu les posologies, refaire les QCM de physiopath...')}
              minRows={3}
              maxHeight="50vh"
              className="w-full p-3 text-sm leading-relaxed border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            onClick={handleFinishSlot}
            className="w-full py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('Valider et enregistrer cette révision')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
