import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CalendarCheck,
  Cloud,
  CloudOff,
  Flame,
  Inbox,
  Layers,
  Play,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { Card } from './Card';
import { computeDashboard } from '../utils/dashboard';
import { describeDayAlert, findAlertDays } from '../utils/dayLoad';
import { CATCH_UP_HORIZON_DAYS, Plan, PlannedMove, Proposal, planCatchUp, planSmoothing, selectMoves } from '../utils/smoothing';
import { PlanningRules } from './PlanningRules';
import { CalendarExportModal } from './CalendarExportModal';
import { googleClientId } from '../utils/firebase';
import { getCourseEffectiveColor, getSubject } from '../utils/colorUtils';
import { diffInDays, formatFrenchDate, formatFrenchDayShort, formatMinutes, getTodayIso } from '../utils/dateUtils';
import { formatCoursePath } from '../utils/folders';
import { isFreeCourse, revLabel } from '../utils/jMethod';
import { FreeCourseAlert, findFreeCourseAlerts } from '../utils/freeAlerts';
import { FreeCourseBadge } from './FreeCourseBadge';
import { getLocale, plural, t } from '../i18n';
import type { SyncStatus } from '../hooks/useCloudSync';

const OVERDUE_VISIBLE = 6;
const ALERT_DAYS_VISIBLE = 5;
const BRIEF_VISIBLE = 5;

interface DashboardViewProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
  // Synchro cloud
  cloudAvailable: boolean;
  userEmail?: string | null;
  syncStatus: SyncStatus;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  safetyBackupCount: number;
  onSyncNow: () => void;
  onOpenConflict: () => void;
  onOpenBackupSettings: () => void;
  // Actions sur les créneaux
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onShiftToToday: (revision: RevisionItem) => void;
  /** Applique un plan de déplacements d'un coup (un seul message, annulable). */
  onApplyShifts: (moves: PlannedMove[]) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  onGoToSlot: (date: string, revisionId: string) => void;
  onOpenCourseDetail: (course: Course) => void;
  /** Fusionne des réglages (ex. date du dernier envoi vers Google Agenda). */
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  /** Cartes du jour (information, hors pastille) ; carte masquée sans aucune carte. */
  cardsToday?: { due: number; fresh: number; total: number };
  onPlayCards?: () => void;
  onOpenCards?: () => void;
  /** Cartes créées sans cours, à ranger (« Cartes à trier ») ; carte masquée à 0. */
  inboxCards?: number;
  onOpenInbox?: () => void;
  /** Reporte l'alerte d'un cours en révision libre laissé de côté. */
  onSnoozeFreeAlert?: (alert: FreeCourseAlert) => void;
}

const SYNC_LABEL: Record<SyncStatus, () => string> = {
  synced: () => t('À jour'),
  pending: () => t('Modifications en attente d\'envoi'),
  offline: () => t('Hors ligne'),
  conflict: () => t('Conflit à arbitrer'),
};

const ghostBtn =
  'inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors';
const primaryBtn =
  'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-colors';

export const DashboardView: React.FC<DashboardViewProps> = ({
  courses,
  revisions,
  subjects,
  cloudAvailable,
  userEmail,
  syncStatus,
  isSyncing,
  lastSyncedAt,
  safetyBackupCount,
  onSyncNow,
  onOpenConflict,
  onOpenBackupSettings,
  onOpenCompleteModal,
  onOpenQuickShift,
  onShiftToToday,
  onApplyShifts,
  onStartStudySession,
  onGoToSlot,
  onOpenCourseDetail,
  onChangeSettings,
  settings,
  cardsToday,
  onPlayCards,
  onOpenCards,
  inboxCards = 0,
  onOpenInbox,
  onSnoozeFreeAlert,
}) => {
  const todayIso = getTodayIso();
  const data = useMemo(() => computeDashboard(courses, revisions, todayIso), [courses, revisions, todayIso]);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [showAllWatched, setShowAllWatched] = useState(false);
  const [showAllIdle, setShowAllIdle] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const { overdue } = data.stats;
  const targetMinutes = settings.dailyTargetHours * 60;
  const alertDays = useMemo(() => findAlertDays(revisions, settings, todayIso), [revisions, settings, todayIso]);
  const visibleDays = showAllDays ? alertDays : alertDays.slice(0, ALERT_DAYS_VISIBLE);
  const smoothing = useMemo(() => planSmoothing(revisions, settings, todayIso), [revisions, settings, todayIso]);
  const catchUp = useMemo(() => planCatchUp(revisions, settings, todayIso), [revisions, settings, todayIso]);
  // Tout est coché par défaut : on ne retient que les propositions que l'utilisateur décoche
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const toggleChecked = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const slotLabel = (rev: RevisionItem) => {
    const course = courseById.get(rev.courseId);
    const subject = course ? getSubject(course.subjectId, subjects) : undefined;
    return {
      course,
      color: getCourseEffectiveColor(course, subject),
      title: course?.title ?? t('Cours supprimé'),
      path: course ? formatCoursePath(subject, course.folderId, 40) : { text: '', full: '' },
    };
  };

  const renderRow = (rev: RevisionItem, late = false) => {
    const { course, color, title, path } = slotLabel(rev);
    const daysLate = late ? diffInDays(todayIso, rev.scheduledDate) : 0;
    return (
      <li key={rev.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 py-2">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
        <div className="min-w-0 flex-1 basis-[12rem]">
          <button
            type="button"
            onClick={() => onGoToSlot(rev.scheduledDate, rev.id)}
            className="block max-w-full truncate text-left text-xs font-bold text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400"
            title={t('Voir ce jour dans le planning')}
          >
            <span className="font-mono text-teal-700 dark:text-teal-400">{revLabel(rev)}</span> · {title}
          </button>
          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400" title={path.full}>
            {late
              ? `${plural(daysLate, '{n} jour de retard', '{n} jours de retard')} · ${formatFrenchDate(rev.scheduledDate)}`
              : `${path.text}${path.text ? ' · ' : ''}${formatMinutes(rev.durationMinutes)}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 pl-[1.125rem] sm:pl-0">
          {rev.completed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              {t('Fait')}
            </span>
          ) : (
            <>
              {course && !late && (
                <button type="button" onClick={() => onStartStudySession(rev)} className={ghostBtn} title={t('Lancer le minuteur')}>
                  <Play className="w-3 h-3" />
                  {t('Lancer')}
                </button>
              )}
              {late && (
                <button type="button" onClick={() => onShiftToToday(rev)} className={ghostBtn} title={t('Replanifier aujourd\'hui')}>
                  <ArrowRightLeft className="w-3 h-3" />
                  {t('Aujourd\'hui')}
                </button>
              )}
              <button type="button" onClick={() => onOpenQuickShift(rev)} className={ghostBtn} title={t('Choisir un autre jour')}>
                {t('Décaler')}
              </button>
              <button type="button" onClick={() => onOpenCompleteModal(rev)} className={primaryBtn}>
                <Check className="w-3 h-3" />
                {t('Valider')}
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  const proposalLine = (p: Proposal, isBlocked: boolean) => {
    const course = courseById.get(p.courseId);
    const isChecked = !unchecked.has(p.revisionId);
    return (
      <li key={p.revisionId} className={isBlocked ? 'opacity-50' : undefined}>
        <label
          className="flex items-start gap-2 py-1 cursor-pointer text-[11px] text-slate-700 dark:text-slate-200"
          title={isBlocked ? t('Dépend d\'un déplacement décoché') : undefined}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleChecked(p.revisionId)}
            className="mt-0.5 accent-teal-600 shrink-0"
          />
          <span className="min-w-0">
            <span className="font-mono font-bold text-teal-700 dark:text-teal-400">{p.label}</span>
            {' · '}
            <span className="font-semibold">{course?.title ?? t('Cours supprimé')}</span>
            {' : '}
            <span className="capitalize">{formatFrenchDayShort(p.fromDate)}</span>
            {p.toStart !== undefined ? (
              // Remontée dans la journée : même jour, une autre heure
              <>
                {' · '}
                {p.fromStart}
                {' → '}
                <span className="font-bold">{p.toStart}</span>
                <span className="text-slate-500 dark:text-slate-400"> · {t('même jour')}</span>
              </>
            ) : (
              <>
                {' → '}
                <span className="capitalize font-bold">{formatFrenchDayShort(p.toDate)}</span>
              </>
            )}
            {p.cascade.length > 0 && (
              <span className="text-slate-500 dark:text-slate-400"> · +{p.cascade.length}</span>
            )}
          </span>
        </label>
      </li>
    );
  };

  const renderPlan = (plan: Plan, kind: 'smooth' | 'catchup') => {
    if (plan.proposals.length === 0 && plan.unresolved.length === 0) return null;
    const isSmooth = kind === 'smooth';
    // Ce qui sera réellement appliqué : les propositions cochées qui restent sûres (une proposition qui comptait sur une
    // proposition décochée est grisée et ne compte pas)
    const selection = selectMoves(kind, plan.proposals, (id) => !unchecked.has(id), revisions, settings, todayIso);
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
        {plan.proposals.length > 0 && (
          <>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {isSmooth ? t('Lissage proposé') : t('Plan de rattrapage')}
            </p>
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-700/70">
              {plan.proposals.map((p) => proposalLine(p, selection.blocked.has(p.revisionId)))}
            </ul>
            <button
              type="button"
              disabled={selection.moves.length === 0}
              onClick={() => onApplyShifts(selection.moves)}
              className={`${primaryBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Check className="w-3 h-3" />
              {plural(selection.moves.length, 'Accepter ({n} déplacement)', 'Accepter ({n} déplacements)')}
            </button>
          </>
        )}
        {plan.unresolved.length > 0 && (
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {isSmooth
              ? t('Aucune solution simple, à traiter à la main (déplacer un créneau ou ajuster la plage de travail) : {days}', {
                  days: plan.unresolved.map((u) => (u.date ? formatFrenchDayShort(u.date) : '')).join(', '),
                })
              : plural(
                  plan.unresolved.length,
                  '{n} créneau en retard sans solution simple dans les {days} prochains jours : à décaler à la main.',
                  '{n} créneaux en retard sans solution simple dans les {days} prochains jours : à décaler à la main.',
                  { days: CATCH_UP_HORIZON_DAYS }
                )}
          </p>
        )}
        <details className="text-[11px] text-slate-600 dark:text-slate-300">
          <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">{t('Comment ça marche ?')}</summary>
          <div className="mt-1.5">
            <PlanningRules kind={kind} />
          </div>
        </details>
      </div>
    );
  };

  const watched = data.stats.watched;
  const idle = data.idleCourses;
  const courseRow = (course: Course, detail?: string) => {
    const subject = getSubject(course.subjectId, subjects);
    const path = formatCoursePath(subject, course.folderId, 40);
    return (
      <li key={course.id} className="flex items-center gap-3 py-2">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: getCourseEffectiveColor(course, subject) }} aria-hidden />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenCourseDetail(course)}
            className="block max-w-full truncate text-left text-xs font-bold text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400"
          >
            {course.title}
          </button>
          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400" title={path.full}>
            {detail ? `${detail} · ${path.text}` : path.text}
          </span>
        </div>
      </li>
    );
  };

  const syncTone = syncStatus === 'conflict' ? 'alert' : syncStatus === 'offline' || syncStatus === 'pending' ? 'warn' : undefined;
  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
    : t('jamais sur cet appareil');
  const freeAlerts = useMemo(() => findFreeCourseAlerts(courses, revisions, settings, todayIso), [courses, revisions, settings, todayIso]);
  const hasAction = overdue.length > 0 || alertDays.length > 0 || freeAlerts.length > 0 || inboxCards > 0;
  const allClear = !hasAction && syncStatus !== 'conflict';
  const visibleOverdue = showAllOverdue ? overdue : overdue.slice(0, OVERDUE_VISIBLE);

  const cardDays = (
  <Card
    title={t('Jours à surveiller')}
    hint={
      alertDays.length === 0
        ? undefined
        : t('Au-dessus de l\'objectif de {target} par jour, ou avec des créneaux hors de la plage de travail', {
            target: formatMinutes(targetMinutes),
          })
    }
    tone={alertDays.length > 0 ? 'warn' : undefined}
  >
    {alertDays.length === 0 ? (
      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
        {t('Aucun jour surchargé à venir.')}
      </p>
    ) : (
      <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleDays.map((d) => {
            const slotId = d.overflowIds[0] ?? revisions.find((r) => r.scheduledDate === d.date)?.id;
            return (
              <li key={d.date} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <span className="block text-xs font-bold text-slate-900 dark:text-white capitalize">
                    {formatFrenchDate(d.date)}
                    {d.date === todayIso && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400 normal-case">{t('Aujourd\'hui')}</span>}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {formatMinutes(d.totalMinutes)} · {describeDayAlert(d, settings.dailyTargetHours)}
                  </span>
                </div>
                {slotId && (
                  <button type="button" onClick={() => onGoToSlot(d.date, slotId)} className={ghostBtn}>
                    {t('Voir le jour')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {alertDays.length > ALERT_DAYS_VISIBLE && (
          <button type="button" onClick={() => setShowAllDays((v) => !v)} className={ghostBtn}>
            {showAllDays ? t('Réduire') : t('Voir les {n} autres', { n: alertDays.length - ALERT_DAYS_VISIBLE })}
          </button>
        )}
        {renderPlan(smoothing, 'smooth')}
      </>
    )}
  </Card>
  );

  const cardToday = (
  <Card
    title={t('Aujourd\'hui')}
    hint={
      data.today.length === 0
        ? undefined
        : t('{done} sur {total} créneaux faits · {planned} prévues pour un objectif de {target}', {
            done: data.today.length - data.todayPending.length,
            total: data.today.length,
            planned: formatMinutes(data.todayMinutes),
            target: formatMinutes(targetMinutes),
          })
    }
    tone={data.todayMinutes > targetMinutes ? 'warn' : undefined}
    aside={<Sun className="w-4 h-4 text-amber-500 shrink-0" />}
  >
    {data.today.length === 0 ? (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {data.next
          ? t('Aucun créneau aujourd\'hui. Prochain : {date}.', { date: formatFrenchDate(data.next.scheduledDate) })
          : t('Aucun créneau à venir.')}
      </p>
    ) : (
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.today.map((rev) => renderRow(rev))}
      </ul>
    )}
  </Card>
  );

  const cardOverdue = (
  <Card
    title={t('Retards')}
    hint={overdue.length === 0 ? undefined : plural(overdue.length, '{n} créneau à rattraper', '{n} créneaux à rattraper')}
    tone={overdue.length > 0 ? 'alert' : undefined}
  >
    {overdue.length === 0 ? (
      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t('Aucun créneau en retard.')}</p>
    ) : (
      <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleOverdue.map((rev) => renderRow(rev, true))}
        </ul>
        {overdue.length > OVERDUE_VISIBLE && (
          <button type="button" onClick={() => setShowAllOverdue((v) => !v)} className={ghostBtn}>
            {showAllOverdue ? t('Réduire') : t('Voir les {n} autres', { n: overdue.length - OVERDUE_VISIBLE })}
          </button>
        )}
        {renderPlan(catchUp, 'catchup')}
      </>
    )}
  </Card>
  );

  const cardSync = cloudAvailable ? (
  <Card
    title={t('Synchronisation')}
    hint={userEmail ?? t('Non connecté')}
    tone={syncTone}
    aside={
      syncStatus === 'offline' ? (
        <CloudOff className="w-4 h-4 text-slate-400 shrink-0" />
      ) : (
        <Cloud className="w-4 h-4 text-teal-600 shrink-0" />
      )
    }
  >
    {userEmail ? (
      <>
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{SYNC_LABEL[syncStatus]()}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('Dernière synchronisation : {date}', { date: lastSyncText })}
          {safetyBackupCount > 0 && (
            <>
              {' · '}
              {plural(safetyBackupCount, '{n} version de sécurité', '{n} versions de sécurité')}
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {syncStatus === 'conflict' ? (
            <button type="button" onClick={onOpenConflict} className={primaryBtn}>
              <AlertTriangle className="w-3 h-3" />
              {t('Résoudre le conflit')}
            </button>
          ) : (
            <button type="button" onClick={onSyncNow} disabled={isSyncing} className={ghostBtn}>
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {t('Synchroniser maintenant')}
            </button>
          )}
          <button type="button" onClick={onOpenBackupSettings} className={ghostBtn}>
            {t('Réglages de sauvegarde')}
          </button>
        </div>
      </>
    ) : (
      <>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('Connectez-vous pour retrouver vos cours sur tous vos appareils.')}
        </p>
        <button type="button" onClick={onOpenBackupSettings} className={primaryBtn}>
          {t('Se connecter')}
        </button>
      </>
    )}
  </Card>

  ) : null;

  const cardWatched = (
  <Card
    title={t('Cours à surveiller')}
    hint={watched.length === 0 ? undefined : t('Retards ou résultats faibles')}
  >
    {watched.length === 0 ? (
      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t('Aucun cours en difficulté.')}</p>
    ) : (
      <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(showAllWatched ? watched : watched.slice(0, BRIEF_VISIBLE)).map((w) => courseRow(w.course, w.reasons.join(' · ')))}
        </ul>
        {watched.length > BRIEF_VISIBLE && (
          <button type="button" onClick={() => setShowAllWatched((v) => !v)} className={ghostBtn}>
            {showAllWatched ? t('Réduire') : t('Voir les {n} autres', { n: watched.length - BRIEF_VISIBLE })}
          </button>
        )}
      </>
    )}
  </Card>
  );

  const cardIdle = (
  <Card
    title={t('Cours sans créneau à venir')}
    hint={idle.length === 0 ? undefined : t('Cycle terminé ou rien de prévu')}
  >
    {idle.length === 0 ? (
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Chaque cours a encore un créneau à faire.')}</p>
    ) : (
      <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(showAllIdle ? idle : idle.slice(0, BRIEF_VISIBLE)).map((c) => courseRow(c))}
        </ul>
        {idle.length > BRIEF_VISIBLE && (
          <button type="button" onClick={() => setShowAllIdle((v) => !v)} className={ghostBtn}>
            {showAllIdle ? t('Réduire') : t('Voir les {n} autres', { n: idle.length - BRIEF_VISIBLE })}
          </button>
        )}
      </>
    )}
  </Card>
  );

  const cardStreak = (
  <Card title={t('Régularité')} aside={<Flame className="w-4 h-4 text-orange-500 shrink-0" />}>
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-white">{data.stats.streak}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{plural(data.stats.streak, 'jour de suite', 'jours de suite')}</span>
      </div>
      <div>
        <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-white">{data.stats.bestStreak}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('meilleure série')}</span>
      </div>
      <div>
        <span className="block text-2xl font-mono font-bold text-slate-900 dark:text-white">
          {data.stats.onTimeRate === null ? '–' : `${data.stats.onTimeRate}%`}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('à la date prévue')}</span>
      </div>
    </div>
  </Card>
  );

  const cardCards = cardsToday && cardsToday.total > 0 ? (
  <Card title={t('Cartes du jour')} aside={<Layers className="w-4 h-4 text-teal-600 shrink-0" />}>
    <p className="text-sm text-slate-700 dark:text-slate-300">
      {cardsToday.due + cardsToday.fresh > 0 ? (
        <>
          <span className="font-bold text-slate-900 dark:text-white">{t('{n} à revoir', { n: cardsToday.due })}</span>
          {' · '}
          {plural(cardsToday.fresh, '{n} nouvelle', '{n} nouvelles')}
        </>
      ) : (
        t('Rien à réviser aujourd\'hui')
      )}
    </p>
    <div className="flex items-center gap-2 flex-wrap">
      {cardsToday.due + cardsToday.fresh > 0 && onPlayCards && (
        <button type="button" onClick={onPlayCards} className={primaryBtn}>
          <Play className="w-3 h-3 fill-current" />
          {t('Réviser')}
        </button>
      )}
      {onOpenCards && (
        <button type="button" onClick={onOpenCards} className={ghostBtn}>
          {t('Toutes les cartes')}
        </button>
      )}
    </div>
  </Card>
  ) : null;

  const cardGoogle = googleClientId && settings.googleCalendarId ? (
  <Card
    title={t('Google Agenda')}
    hint={
      settings.googleCalendarSyncedAt
        ? t('Dernière mise à jour : {date}', {
            date: new Date(settings.googleCalendarSyncedAt).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
          })
        : t('Date de dernière mise à jour inconnue')
    }
    aside={<CalendarCheck className="w-4 h-4 text-teal-600 shrink-0" />}
  >
    <button type="button" onClick={() => setExportOpen(true)} className={ghostBtn}>
      {t('Mettre à jour')}
    </button>
  </Card>

  ) : null;

  // Cours en révision libre sans R planifiée ni révision récente (absente s'il n'existe aucun cours libre)
  const hasFreeCourses = courses.some(isFreeCourse);
  const cardFree = (
  <Card
    title={t('Cours libres à réviser')}
    tone={freeAlerts.length > 0 ? 'warn' : undefined}
    hint={
      freeAlerts.length > 0
        ? t('Aucune révision planifiée et rien de fait depuis un moment : planifiez une R depuis la fiche du cours, ou reportez.')
        : undefined
    }
  >
    {freeAlerts.length === 0 && (
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Chaque cours libre a une révision prévue ou récente.')}</p>
    )}
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {freeAlerts.map((a) => {
        const subject = getSubject(a.course.subjectId, subjects);
        const never = a.since === a.course.createdAt && !revisions.some((r) => r.courseId === a.course.id && r.completed);
        return (
          <li key={a.course.id} className="flex items-center gap-3 py-2 flex-wrap">
            <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: getCourseEffectiveColor(a.course, subject) }} aria-hidden />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpenCourseDetail(a.course)}
                className="flex items-center gap-1.5 max-w-full text-left text-xs font-bold text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400"
              >
                <span className="truncate">{a.course.title}</span>
                <FreeCourseBadge />
              </button>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {never
                  ? plural(a.idleDays, 'Créé il y a {n} jour, aucune révision', 'Créé il y a {n} jours, aucune révision')
                  : plural(a.idleDays, 'Dernière révision il y a {n} jour', 'Dernière révision il y a {n} jours')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => onOpenCourseDetail(a.course)} className={primaryBtn}>
                {t('Planifier une R')}
              </button>
              {a.nextSnooze !== null && onSnoozeFreeAlert ? (
                <button type="button" onClick={() => onSnoozeFreeAlert(a)} className={ghostBtn} title={t('L\'alerte revient dans {n} j ; chaque report est deux fois plus court', { n: a.nextSnooze })}>
                  {plural(a.nextSnooze, 'Reporter {n} jour', 'Reporter {n} jours')}
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('Plus de report possible')}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  </Card>
  );

  // Cartes créées sans cours, à ranger dans un cours (masquée quand il n'y en a pas)
  const cardInbox = (
  <Card title={t('Cartes à trier')} tone="warn" aside={<Inbox className="w-4 h-4 text-slate-500 shrink-0" />}>
    <div className="flex items-center gap-2 flex-wrap">
      <p className="flex-1 text-sm text-slate-700 dark:text-slate-300">
        {plural(inboxCards, '{n} carte créée sans cours, à ranger dans un cours.', '{n} cartes créées sans cours, à ranger dans un cours.')}
      </p>
      {onOpenInbox && (
        <button type="button" onClick={onOpenInbox} className={primaryBtn}>
          {t('Trier')}
        </button>
      )}
    </div>
  </Card>
  );

  // Cartes d'action, dans l'ordre d'importance : retards, jours surchargés, cours libres à réviser, cartes à trier.
  // Active, une carte passe au-dessus d'« Aujourd'hui » ; vide, en dessous. `optional` : vide, elle n'apparaît pas.
  const actionCards = [
    { key: 'overdue', el: cardOverdue, active: overdue.length > 0 },
    { key: 'days', el: cardDays, active: alertDays.length > 0 },
    { key: 'free', el: cardFree, active: freeAlerts.length > 0, optional: !hasFreeCourses },
    { key: 'inbox', el: cardInbox, active: inboxCards > 0, optional: true },
  ];

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        {allClear ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            {t('Rien à traiter pour le moment.')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-400">
            <AlertTriangle className="w-4 h-4" />
            {t('Des éléments demandent votre attention.')}
          </span>
        )}
      </div>

      {/* Colonne principale large : ce qui demande une action ; colonne latérale : l'information */}
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* Une carte d'action qui a quelque chose à traiter passe au-dessus d'« Aujourd'hui », une carte vide passe dessous */}
          {actionCards.filter((c) => c.active).map((c) => <React.Fragment key={c.key}>{c.el}</React.Fragment>)}
          {cardToday}
          {actionCards.filter((c) => !c.active && !c.optional).map((c) => <React.Fragment key={c.key}>{c.el}</React.Fragment>)}
        </div>
        <div className="space-y-4 min-w-0">
          {cardSync}
          {cardCards}
          {cardWatched}
          {cardIdle}
          {cardStreak}
          {cardGoogle}
        </div>
      </div>

      {exportOpen && (
        <CalendarExportModal
          courses={courses}
          revisions={revisions}
          subjects={subjects}
          settings={settings}
          onSaveSettings={(next) =>
            onChangeSettings({ googleCalendarId: next.googleCalendarId, googleCalendarSyncedAt: next.googleCalendarSyncedAt })
          }
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
};
