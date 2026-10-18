import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarCheck, CheckCircle2, Layers, Target } from 'lucide-react';
import { Course, Deck, MasteryLevel, RevisionItem, Subject } from '../types';
import { diffInDays, formatFrenchDate, formatFrenchDayShort, formatMinutes, getTodayIso } from '../utils/dateUtils';
import {
  averageDelay,
  compareWeeks,
  computeCoverage,
  computeExamProjection,
  computeDrift,
  computeStudyStats,
  computeSubjectProgress,
  forecastLoad,
  startedCourseIds,
} from '../utils/stats';
import { computeCardStats, LEECH_LAPSES, MATURE_DAYS } from '../utils/cardStats';
import { ReviewLog } from '../utils/reviewLog';
import { computeReviewLogStats } from '../utils/reviewLogStats';
import { Card } from './Card';
import { FlashcardText } from './FlashcardText';
import { plural, t } from '../i18n';
import { INBOX_COURSE_ID } from '../utils/inbox';

interface StatsProgressViewProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  decks: Record<string, Deck>;
  /** Journal des notes de cartes (historique des révisions). */
  reviewLog: ReviewLog;
  /** Objectif quotidien (h), pour repérer les jours surchargés. */
  dailyTargetHours?: number;
  /** Date d'examen (réglages) : sans elle, aucune projection. */
  examDate?: string;
  /** Ouvre l'éditeur des cartes d'un cours sur une carte (sangsues). */
  onOpenDeck?: (courseId: string, cardId?: string) => void;
}

const MASTERY_BAR_COLORS: Record<MasteryLevel, string> = {
  0: 'bg-slate-400',
  1: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-lime-500',
  4: 'bg-emerald-500',
};
const LEVELS: MasteryLevel[] = [4, 3, 2, 1, 0];
/** Moins de notes que ça à une étape J : la moyenne n'est pas fiable, la barre est pâlie. */
const FEW_RATINGS = 5;
/** Une discipline commencée sans révision depuis plus longtemps que ça est signalée. */
const STALE_DAYS = 14;
const HORIZONS = [14, 30, 60] as const;

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Petite tuile chiffrée du haut de la vue. */
const Tile: React.FC<{ label: string; icon: React.ReactNode; value: React.ReactNode; sub: React.ReactNode }> = ({ label, icon, value, sub }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors min-w-0">
    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
      <span className="text-xs font-semibold">{label}</span>
      {icon}
    </div>
    <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{value}</div>
    <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{sub}</span>
  </div>
);

/** Barres verticales d'une série de jours (survol = détail). */
const DayBars: React.FC<{
  days: { date: string; value: number; title: string; highlight?: boolean }[];
  max: number;
  color: string;
  label: string;
  target?: number | null;
}> = ({ days, max, color, label, target }) => (
  <div className={`flex items-end h-28 relative ${days.length > 30 ? 'gap-px' : 'gap-[3px]'}`} role="img" aria-label={label}>
    {target != null && (
      <div className="absolute inset-x-0 border-t border-dashed border-amber-500/70 pointer-events-none" style={{ bottom: `${(target / max) * 100}%` }} />
    )}
    {days.map((d) => (
      <div key={d.date} className="flex-1 h-full flex items-end" title={d.title}>
        <div
          className={`w-full rounded-t-sm ${d.highlight ? 'bg-rose-500' : color}`}
          style={{ height: d.value > 0 ? `${Math.max(4, (d.value / max) * 100)}%` : '2px', opacity: d.value > 0 ? 1 : 0.25 }}
        />
      </div>
    ))}
  </div>
);

const Axis: React.FC<{ left: string; right: string }> = ({ left, right }) => (
  <div className="flex justify-between text-[0.625rem] text-slate-400 dark:text-slate-500">
    <span>{left}</span>
    <span>{right}</span>
  </div>
);

/** Répartition de la maîtrise en une barre empilée (4★ à gauche). */
const MasteryStrip: React.FC<{ counts: Record<MasteryLevel, number>; className?: string }> = ({ counts, className = '' }) => {
  const total = LEVELS.reduce<number>((a, l) => a + counts[l], 0);
  return (
    <div className={`flex h-2 rounded overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}>
      {total > 0 &&
        LEVELS.map((l) =>
          counts[l] > 0 ? (
            <div key={l} className={MASTERY_BAR_COLORS[l]} style={{ width: `${(counts[l] / total) * 100}%` }} title={`${l} ★ : ${counts[l]}`} />
          ) : null
        )}
    </div>
  );
};

export const StatsProgressView: React.FC<StatsProgressViewProps> = ({
  courses,
  revisions,
  subjects,
  decks,
  reviewLog,
  dailyTargetHours,
  examDate,
  onOpenDeck,
}) => {
  const todayIso = getTodayIso();
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(14);

  const stats = useMemo(() => computeStudyStats(courses, revisions, todayIso), [courses, revisions, todayIso]);
  const coverage = useMemo(() => computeCoverage(courses, revisions, todayIso), [courses, revisions, todayIso]);
  const weeks = useMemo(() => compareWeeks(revisions, todayIso), [revisions, todayIso]);
  const delay = useMemo(() => averageDelay(revisions), [revisions]);
  const exam = useMemo(() => computeExamProjection(courses, revisions, examDate, todayIso), [courses, revisions, examDate, todayIso]);
  const drift = useMemo(() => computeDrift(courses, revisions, todayIso), [courses, revisions, todayIso]);
  const load = useMemo(() => forecastLoad(revisions, todayIso, horizon), [revisions, todayIso, horizon]);
  const bySubject = useMemo(
    () => computeSubjectProgress(subjects, courses, revisions, todayIso).filter((s) => s.courseCount > 0),
    [subjects, courses, revisions, todayIso]
  );
  const history = useMemo(() => computeReviewLogStats(reviewLog, todayIso), [reviewLog, todayIso]);
  const cards = useMemo(() => computeCardStats(decks, [...courses.map((c) => c.id), INBOX_COURSE_ID], new Date()), [decks, courses]);

  // Maîtrise parmi les cours commencés : un cours jamais révisé n'a pas encore de note
  const mastery = useMemo(() => {
    const started = startedCourseIds(revisions);
    const counts: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    courses.forEach((c) => started.has(c.id) && counts[c.mastery]++);
    return counts;
  }, [courses, revisions]);
  const maxMastery = Math.max(1, ...Object.values(mastery));

  const completed = revisions.filter((r) => r.completed).length;
  const targetMinutes = dailyTargetHours ? dailyTargetHours * 60 : null;
  const max30 = Math.max(60, ...stats.last30.map((d) => d.minutes));
  const maxLoad = Math.max(60, ...load.map((d) => d.minutes), targetMinutes ?? 0);
  const weekDelta = weeks.current.count - weeks.previous.count;
  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const maxForecast = Math.max(1, ...cards.forecast.map((d) => d.count));

  const lastDoneLabel = (iso?: string) => {
    if (!iso) return t('jamais');
    const n = diffInDays(todayIso, iso);
    return n <= 0 ? t('aujourd\'hui') : plural(n, 'il y a {n} jour', 'il y a {n} jours');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label={t('Cours commencés')}
          icon={<BookOpen className="w-4 h-4 text-teal-600" />}
          value={
            <>
              {coverage.started} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">/ {coverage.total}</span>
            </>
          }
          sub={t('{pct}% du programme · {n}/sem. sur 4 semaines', { pct: pct(coverage.started, coverage.total), n: coverage.perWeek })}
        />
        <Tile
          label={t('Créneaux faits')}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          value={
            <>
              {completed} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">/ {revisions.length}</span>
            </>
          }
          sub={t('{pct}% des créneaux prévus', { pct: pct(completed, revisions.length) })}
        />
        <Tile
          label={t('7 derniers jours')}
          icon={<CalendarCheck className="w-4 h-4 text-sky-600" />}
          value={
            <>
              {weeks.current.count}{' '}
              {weekDelta !== 0 && (
                <span className={`text-xs font-semibold ${weekDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {weekDelta > 0 ? `+${weekDelta}` : weekDelta}
                </span>
              )}
            </>
          }
          sub={
            <>
              {t('créneaux, {prev} la semaine d\'avant', { prev: weeks.previous.count })}
              {weeks.current.avgRating !== null && ` · ${weeks.current.avgRating.toFixed(1)} ★`}
            </>
          }
        />
        <Tile
          label={t('Ponctualité')}
          icon={<Target className="w-4 h-4 text-teal-600" />}
          value={stats.onTimeRate === null ? '—' : `${stats.onTimeRate}%`}
          sub={
            delay
              ? t('validés à temps · retard moyen {d} j', { d: delay.days.toLocaleString() })
              : t('validés à la date prévue actuelle ou avant')
          }
        />
      </div>

      {exam && (
        <Card
          title={t('Avant l\'examen')}
          hint={t('Extrapolation du rythme des 4 dernières semaines : un repère, pas une prévision (vacances et nouveaux cours ne sont pas pris en compte).')}
          tone={exam.onTrack ? undefined : 'warn'}
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
                {t('{n} j', { n: exam.daysLeft })}
              </div>
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{t('avant l\'examen du {d}', { d: formatFrenchDate(examDate as string) })}</p>
            </div>
            <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300 lg:col-span-2">
              {exam.remaining === 0 ? (
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">{t('Tous les cours sont déjà commencés.')}</p>
              ) : (
                <>
                  <p>
                    {t('{n} cours à commencer', { n: exam.remaining })}
                    {' · '}
                    {t('il faut {need} cours par semaine, vous en êtes à {have}.', { need: exam.neededPerWeek.toLocaleString(), have: exam.perWeek.toLocaleString() })}
                  </p>
                  <p className={exam.onTrack ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>
                    {exam.projectedDate === null
                      ? t('Aucun cours commencé ces 4 dernières semaines : pas de projection possible.')
                      : exam.onTrack
                        ? t('À ce rythme, tous les cours seront commencés le {d}, avant l\'examen.', { d: formatFrenchDate(exam.projectedDate) })
                        : t('À ce rythme, tous les cours seront commencés le {d}, après l\'examen.', { d: formatFrenchDate(exam.projectedDate) })}
                  </p>
                  {exam.cycleDays > 0 && (
                    <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                      {exam.lastFullCycleStart >= todayIso
                        ? t('Un cours commencé après le {d} n\'aura pas tout son cycle (jusqu\'à J{j}) avant l\'examen.', { d: formatFrenchDate(exam.lastFullCycleStart), j: exam.cycleDays })
                        : t('Le cycle complet (jusqu\'à J{j}) ne tient plus avant l\'examen pour un cours commencé maintenant.', { j: exam.cycleDays })}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={t('Activité : 30 derniers jours')}
          hint={t('Durée prévue des créneaux validés · série {s} j (record {b} j) · {a}/30 jours actifs', {
            s: stats.streak,
            b: stats.bestStreak,
            a: stats.activeDaysLast30,
          })}
        >
          <DayBars
            days={stats.last30.map((d) => ({
              date: d.date,
              value: d.minutes,
              title: `${formatFrenchDayShort(d.date)} : ${formatMinutes(d.minutes)} (${plural(d.count, '{n} créneau', '{n} créneaux')})`,
            }))}
            max={max30}
            color="bg-teal-600/70 dark:bg-teal-500/60"
            label={t('Temps révisé par jour sur 30 jours')}
          />
          <Axis left={formatFrenchDayShort(stats.last30[0].date)} right={t('Aujourd\'hui')} />
        </Card>

        <Card
          title={t('Charge à venir')}
          hint={`${t('Créneaux restants (les retards sont comptés aujourd\'hui)')}${targetMinutes ? ` · ${t('objectif {d}/j', { d: formatMinutes(targetMinutes) })}` : ''}`}
          aside={
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 shrink-0" role="group" aria-label={t('Période')}>
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={horizon === h}
                  onClick={() => setHorizon(h)}
                  className={`px-2 py-0.5 text-[0.6875rem] font-semibold rounded-md ${
                    horizon === h ? 'bg-teal-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('{n} j', { n: h })}
                </button>
              ))}
            </div>
          }
        >
          <DayBars
            days={load.map((d) => ({
              date: d.date,
              value: d.minutes,
              highlight: targetMinutes !== null && d.minutes > targetMinutes,
              title: `${formatFrenchDayShort(d.date)} : ${formatMinutes(d.minutes)} (${plural(d.count, '{n} créneau', '{n} créneaux')})`,
            }))}
            max={maxLoad}
            color="bg-sky-600/70 dark:bg-sky-500/60"
            label={t('Charge prévue jour par jour')}
            target={targetMinutes}
          />
          <Axis left={t('Aujourd\'hui')} right={formatFrenchDayShort(load[load.length - 1].date)} />
        </Card>

        <Card title={t('Répartition de la maîtrise')} hint={t('Cours commencés, par niveau (★)')}>
          <div className="space-y-1.5">
            {LEVELS.map((lvl) => (
              <div key={lvl} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 font-mono text-slate-600 dark:text-slate-300">{lvl} ★</span>
                <div className="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded ${MASTERY_BAR_COLORS[lvl]}`} style={{ width: `${(mastery[lvl] / maxMastery) * 100}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right font-mono font-bold text-slate-800 dark:text-white">{mastery[lvl]}</span>
              </div>
            ))}
          </div>
          {coverage.total > coverage.started && (
            <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
              {plural(coverage.total - coverage.started, '{n} cours pas encore commencé.', '{n} cours pas encore commencés.')}
            </p>
          )}
        </Card>

        <Card
          title={t('Mémorisation selon l\'étape J')}
          hint={t('Auto-évaluation moyenne à chaque J : une chute signale l\'étape où l\'on oublie')}
        >
          {stats.retentionByJ.length === 0 ? (
            <p className="text-xs italic text-slate-400 dark:text-slate-500">{t('Validez des créneaux avec une note pour voir la courbe.')}</p>
          ) : (
            <>
              <div className="flex items-end gap-2 h-28">
                {stats.retentionByJ.map((r) => (
                  <div
                    key={r.jIndex}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0"
                    title={t('J{j} : {avg} ★ sur {count}', { j: r.jIndex, avg: r.avgRating.toFixed(1), count: plural(r.count, '{n} créneau', '{n} créneaux') })}
                  >
                    <span className="text-[0.625rem] font-mono font-bold text-slate-700 dark:text-slate-200">{r.avgRating.toFixed(1)}</span>
                    <div
                      className={`w-full rounded-t-sm ${r.count < FEW_RATINGS ? 'bg-amber-500/30' : 'bg-amber-500/80'}`}
                      style={{ height: `${Math.max(4, (r.avgRating / 4) * 60)}%` }}
                    />
                    <span className="text-[0.625rem] font-mono text-slate-500 dark:text-slate-400">J{r.jIndex}</span>
                    <span className="text-[0.5625rem] text-slate-400 dark:text-slate-500">{t('n={n}', { n: r.count })}</span>
                  </div>
                ))}
              </div>
              {stats.retentionByJ.some((r) => r.count < FEW_RATINGS) && (
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {t('Barres pâles : moins de {n} notes, moyenne peu fiable.', { n: FEW_RATINGS })}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {drift.tracked > 0 && (
        <Card
          title={t('Écart au planning d\'origine')}
          hint={t('La date d\'origine est figée à la validation du J0 : repousser un créneau ne la change pas.')}
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
                  {drift.done > 0 ? `${pct(drift.onOriginal, drift.done)}%` : '—'}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('à la date d\'origine ou avant')}</span>
              </div>
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {drift.avgDrift === null
                  ? t('Aucun créneau suivi n\'est encore validé.')
                  : t('Écart moyen {d} j sur {n}.', {
                      d: `${drift.avgDrift > 0 ? '+' : ''}${drift.avgDrift.toLocaleString()}`,
                      n: plural(drift.done, '{n} créneau validé', '{n} créneaux validés'),
                    })}
              </p>
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('Écart moyen par étape J (jours)')}</p>
              {drift.byJ.length === 0 ? (
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{t('Pas encore de créneau validé.')}</p>
              ) : (
                <ul className="space-y-1">
                  {drift.byJ.map((j) => (
                    <li key={j.jIndex} className="flex items-center gap-2 text-xs" title={plural(j.count, '{n} créneau', '{n} créneaux')}>
                      <span className="w-8 shrink-0 font-mono text-slate-600 dark:text-slate-300">J{j.jIndex}</span>
                      <div className="flex-1 h-2.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded ${j.avg > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, Math.max(j.avg !== 0 ? 4 : 0, (Math.abs(j.avg) / Math.max(1, ...drift.byJ.map((x) => Math.abs(x.avg)))) * 100))}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono font-bold text-slate-800 dark:text-white">
                        {j.avg > 0 ? '+' : ''}
                        {j.avg.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('Cours les plus décalés')}</p>
              {drift.courses.length === 0 ? (
                <p className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-medium">{t('Aucun cours décalé.')}</p>
              ) : (
                <ul className="space-y-1">
                  {drift.courses.slice(0, 5).map((c) => (
                    <li key={c.course.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-800 dark:text-slate-200">{c.course.title}</span>
                      <span className="shrink-0 font-semibold text-rose-600 dark:text-rose-400">+{c.drift} {t('j')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {cards.total > 0 && (
        <Card title={t('Flashcards')} hint={t('D\'après l\'état de programmation de chaque carte (une carte à trous compte un trou par carte)')}>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
                  {cards.retention === null ? '—' : `${Math.round(cards.retention * 100)}%`}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('rétention estimée')}</span>
              </div>
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {t('Probabilité moyenne de vous souvenir aujourd\'hui, sur {n}.', { n: plural(cards.rated, '{n} carte déjà révisée', '{n} cartes déjà révisées') })}
              </p>
              <div className="flex h-3 rounded overflow-hidden bg-slate-100 dark:bg-slate-800" role="img" aria-label={t('Cartes par état')}>
                {(
                  [
                    ['mature', 'bg-emerald-500'],
                    ['young', 'bg-lime-500'],
                    ['learning', 'bg-amber-500'],
                    ['fresh', 'bg-slate-400'],
                  ] as const
                ).map(([k, color]) =>
                  cards.states[k] > 0 ? <div key={k} className={color} style={{ width: `${(cards.states[k] / cards.total) * 100}%` }} /> : null
                )}
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[0.6875rem] text-slate-600 dark:text-slate-300">
                <li><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />{t('Mûres (≥ {d} j) : {n}', { d: MATURE_DAYS, n: cards.states.mature })}</li>
                <li><span className="inline-block w-2 h-2 rounded-sm bg-lime-500 mr-1" />{t('Jeunes : {n}', { n: cards.states.young })}</li>
                <li><span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1" />{t('En apprentissage : {n}', { n: cards.states.learning })}</li>
                <li><span className="inline-block w-2 h-2 rounded-sm bg-slate-400 mr-1" />{t('Nouvelles : {n}', { n: cards.states.fresh })}</li>
              </ul>
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('Cartes dues : 30 jours')}</p>
              <DayBars
                days={cards.forecast.map((d) => ({
                  date: d.date,
                  value: d.count,
                  title: `${formatFrenchDayShort(d.date)} : ${plural(d.count, '{n} carte', '{n} cartes')}`,
                }))}
                max={maxForecast}
                color="bg-violet-500/70 dark:bg-violet-400/60"
                label={t('Cartes dues par jour sur 30 jours')}
              />
              <Axis left={t('Aujourd\'hui')} right={formatFrenchDayShort(cards.forecast[cards.forecast.length - 1].date)} />
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('Cartes souvent oubliées')}</p>
              {cards.leeches.length === 0 ? (
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {t('Aucune carte oubliée {n} fois ou plus.', { n: LEECH_LAPSES })}
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {cards.leeches.slice(0, 5).map((l) => (
                      <li key={`${l.courseId}/${l.card.id}`}>
                        <button
                          type="button"
                          disabled={!onOpenDeck}
                          onClick={() => onOpenDeck?.(l.courseId, l.card.id)}
                          className="w-full text-left rounded-lg px-2 py-1 border border-slate-200 dark:border-slate-800 enabled:hover:border-teal-300 dark:enabled:hover:border-teal-500/50"
                        >
                          <span className="flex items-center justify-between gap-2">
                            {l.card.front ? (
                              <FlashcardText text={l.card.front} cloze={l.card.kind === 'cloze'} className="text-xs text-slate-900 dark:text-slate-100 line-clamp-1" />
                            ) : (
                              <span className="text-xs text-slate-500">{t('Masques sur image')}</span>
                            )}
                            <span className="text-[0.6875rem] font-semibold text-rose-600 dark:text-rose-400 shrink-0">{t('{n}× oubliée', { n: l.lapses })}</span>
                          </span>
                          <span className="block text-[0.625rem] text-slate-400 dark:text-slate-500 truncate">{courseOf.get(l.courseId)?.title ?? (l.courseId === INBOX_COURSE_ID ? t('Cartes à trier') : '')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{t('À reformuler ou découper : elles coûtent du temps sans rester.')}</p>
                </>
              )}
            </div>
          </div>

          {history.total > 0 && (
            <div className="grid gap-5 lg:grid-cols-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
                    {history.trueRetention === null ? '—' : `${Math.round(history.trueRetention * 100)}%`}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('rétention réelle')}</span>
                </div>
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {history.trueRetention === null
                    ? t('Pas encore de carte revue après son délai.')
                    : t('Réponses autres que « Encore » sur des cartes déjà en révision : {n} sur 30 jours.', { n: history.retentionBase })}
                </p>
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {t('Série : {s} j · {a}/30 jours actifs · {n} par jour actif', {
                    s: history.streak,
                    a: history.activeDays,
                    n: history.avgPerActiveDay,
                  })}
                </p>
              </div>

              <div className="space-y-2 min-w-0 lg:col-span-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('Cartes révisées : 30 jours')}{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">· {plural(history.total, '{n} note au total', '{n} notes au total')}</span>
                </p>
                <DayBars
                  days={history.perDay.map((d) => ({
                    date: d.date,
                    value: d.count,
                    title: `${formatFrenchDayShort(d.date)} : ${plural(d.count, '{n} carte', '{n} cartes')}`,
                  }))}
                  max={Math.max(10, ...history.perDay.map((d) => d.count))}
                  color="bg-violet-500/70 dark:bg-violet-400/60"
                  label={t('Cartes révisées par jour sur 30 jours')}
                />
                <Axis left={formatFrenchDayShort(history.perDay[0].date)} right={t('Aujourd\'hui')} />
              </div>
            </div>
          )}
        </Card>
      )}

      {bySubject.length > 0 && (
        <Card title={t('Progression par discipline')} hint={t('Temps : durée prévue des créneaux validés')}>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {bySubject.map((item) => {
              const stale = item.started > 0 && (!item.lastDone || diffInDays(todayIso, item.lastDone) > STALE_DAYS);
              return (
                <div key={item.subject.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: item.subject.color }} />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">{item.subject.name}</span>
                      <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                        {t('{started}/{courses} cours commencés · {done}/{total} créneaux', {
                          started: item.started,
                          courses: item.courseCount,
                          done: item.completedCount,
                          total: item.revisionCount,
                        })}
                        {item.overdueCount > 0 && (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold"> · {t('{n} en retard', { n: item.overdueCount })}</span>
                        )}
                      </span>
                      <div className="mt-1 h-1.5 w-40 max-w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${pct(item.started, item.courseCount)}%`, backgroundColor: item.subject.color }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs shrink-0">
                    <div>
                      <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400 block">{t('Maîtrise')}</span>
                      {item.started > 0 ? <MasteryStrip counts={item.mastery} className="w-24 mt-1" /> : <span className="text-slate-400">—</span>}
                    </div>
                    <div>
                      <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400 block">{t('Temps')}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white">{formatMinutes(item.minutes)}</span>
                    </div>
                    <div className="w-24">
                      <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400 block">{t('Dernière révision')}</span>
                      <span className={`font-semibold ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-white'}`}>
                        {lastDoneLabel(item.lastDone)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {cards.total === 0 && (
        <p className="flex items-center gap-1.5 text-[0.6875rem] text-slate-400 dark:text-slate-500">
          <Layers className="w-3.5 h-3.5" />
          {t('Les statistiques des flashcards apparaîtront ici dès vos premières cartes.')}
        </p>
      )}
    </div>
  );
};
