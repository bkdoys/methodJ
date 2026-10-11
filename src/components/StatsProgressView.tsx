import React from 'react';
import { Course, MasteryLevel, RevisionItem, Subject } from '../types';
import { formatMinutes, formatFrenchDayShort, getTodayIso } from '../utils/dateUtils';
import { computeStudyStats } from '../utils/stats';
import {
  CheckCircle2,
  Clock,
  BookOpen,
  Award,
  Flame,
  AlertTriangle,
  Target,
  Eye,
} from 'lucide-react';
import { Card } from './Card';
import { plural, t } from '../i18n';

interface StatsProgressViewProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  /** Objectif quotidien (h), pour repérer les jours surchargés. */
  dailyTargetHours?: number;
  onOpenCourseDetail?: (course: Course) => void;
}

const MASTERY_BAR_COLORS: Record<MasteryLevel, string> = {
  0: 'bg-slate-400',
  1: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-lime-500',
  4: 'bg-emerald-500',
};

export const StatsProgressView: React.FC<StatsProgressViewProps> = ({
  courses,
  revisions,
  subjects,
  dailyTargetHours,
  onOpenCourseDetail,
}) => {
  const todayIso = getTodayIso();
  const stats = computeStudyStats(courses, revisions, todayIso);
  const max30 = Math.max(60, ...stats.last30.map((d) => d.minutes));
  const max14 = Math.max(60, ...stats.next14.map((d) => d.minutes), (dailyTargetHours ?? 0) * 60);
  const targetMinutes = dailyTargetHours ? dailyTargetHours * 60 : null;
  const maxMastery = Math.max(1, ...Object.values(stats.masteryCounts));

  // Mastery distribution
  const masteryCounts: Record<MasteryLevel, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  };
  courses.forEach((c) => {
    masteryCounts[c.mastery]++;
  });

  // Revisions stats
  const totalRevisions = revisions.length;
  const completedRevisions = revisions.filter((r) => r.completed);
  const totalMinutesStudied = completedRevisions.reduce((acc, r) => acc + r.durationMinutes, 0);

  // Subject breakdown
  const subjectStats = subjects.map((sub) => {
    const subCourses = courses.filter((c) => c.subjectId === sub.id);
    const subCourseIds = new Set(subCourses.map((c) => c.id));
    const subRevisions = revisions.filter((r) => subCourseIds.has(r.courseId));
    const subCompleted = subRevisions.filter((r) => r.completed);
    const subStudiedMinutes = subCompleted.reduce((acc, r) => acc + r.durationMinutes, 0);

    const avgMastery =
      subCourses.length > 0
        ? (subCourses.reduce((acc, c) => acc + c.mastery, 0) / subCourses.length).toFixed(1)
        : '0.0';

    return {
      subject: sub,
      courseCount: subCourses.length,
      revisionCount: subRevisions.length,
      completedCount: subCompleted.length,
      studiedMinutes: subStudiedMinutes,
      overdueCount: stats.overdue.filter((r) => subCourseIds.has(r.courseId)).length,
      avgMastery,
    };
  });

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Total Cours EDN')}</span>
            <BookOpen className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {courses.length}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('Chapitres au catalogue')}</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Révisions effectuées')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {completedRevisions.length}{' '}
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">/ {totalRevisions}</span>
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {totalRevisions > 0
              ? t('{pct}% du cycle validé', { pct: Math.round((completedRevisions.length / totalRevisions) * 100) })
              : '0%'}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Temps total révisé')}</span>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {formatMinutes(totalMinutesStudied)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('Durée cumulée des créneaux validés')}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Items Maîtrisés (★4)')}</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {masteryCounts[4]}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {courses.length > 0
              ? t('{pct}% de rétention optimale', { pct: Math.round((masteryCounts[4] / courses.length) * 100) })
              : '0%'}
          </span>
        </div>
      </div>

      {/* Indicateurs de suivi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Série en cours')}</span>
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {stats.streak} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">j</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('Record : {best} j · {active}/30 jours actifs', { best: stats.bestStreak, active: stats.activeDaysLast30 })}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('En retard')}</span>
            <AlertTriangle className={`w-4 h-4 ${stats.overdue.length > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-2xl font-mono font-bold ${stats.overdue.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {stats.overdue.length}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('{today} aujourd\'hui · {week} d\'ici 7 jours', { today: stats.dueToday.length, week: stats.upcoming7Days })}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('Ponctualité')}</span>
            <Target className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {stats.onTimeRate === null ? '—' : `${stats.onTimeRate}%`}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('Créneaux validés à la date prévue ou avant')}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">{t('7 derniers jours')}</span>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {formatMinutes(stats.last7Minutes)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {stats.avgMinutesPerActiveDay > 0
              ? t('{d} par jour actif', { d: formatMinutes(stats.avgMinutesPerActiveDay) })
              : t('Aucune activité récente')}
            {stats.avgRating !== null && ` · ${t('éval. moy.')} ${stats.avgRating.toFixed(1)} ★`}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Temps révisé : 30 derniers jours')} hint={t('Minutes validées par jour')}>
          <div className="flex items-end gap-[3px] h-28" role="img" aria-label={t('Temps révisé par jour sur 30 jours')}>
            {stats.last30.map((d) => (
              <div
                key={d.date}
                className="flex-1 h-full flex items-end"
                title={`${formatFrenchDayShort(d.date)} : ${formatMinutes(d.minutes)} (${plural(d.count, '{n} créneau', '{n} créneaux')})`}
              >
                <div
                  className={`w-full rounded-t-sm ${d.date === todayIso ? 'bg-teal-500' : 'bg-teal-600/70 dark:bg-teal-500/60'}`}
                  style={{ height: d.minutes > 0 ? `${Math.max(4, (d.minutes / max30) * 100)}%` : '2px', opacity: d.minutes > 0 ? 1 : 0.25 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>{formatFrenchDayShort(stats.last30[0].date)}</span>
            <span>{t('Aujourd\'hui')}</span>
          </div>
        </Card>

        <Card
          title={t('Charge à venir : 14 jours')}
          hint={`${t('Créneaux restants (les retards sont comptés aujourd\'hui)')}${targetMinutes ? ` · ${t('objectif {d}/j', { d: formatMinutes(targetMinutes) })}` : ''}`}
        >
          <div className="flex items-end gap-1 h-28 relative" role="img" aria-label={t('Charge prévue sur 14 jours')}>
            {targetMinutes !== null && (
              <div
                className="absolute inset-x-0 border-t border-dashed border-amber-500/70 pointer-events-none"
                style={{ bottom: `${(targetMinutes / max14) * 100}%` }}
              />
            )}
            {stats.next14.map((d) => {
              const over = targetMinutes !== null && d.minutes > targetMinutes;
              return (
                <div
                  key={d.date}
                  className="flex-1 h-full flex items-end"
                  title={`${formatFrenchDayShort(d.date)} : ${formatMinutes(d.minutes)} (${plural(d.count, '{n} créneau', '{n} créneaux')})`}
                >
                  <div
                    className={`w-full rounded-t-sm ${over ? 'bg-rose-500' : 'bg-sky-600/70 dark:bg-sky-500/60'}`}
                    style={{ height: d.minutes > 0 ? `${Math.max(4, (d.minutes / max14) * 100)}%` : '2px', opacity: d.minutes > 0 ? 1 : 0.25 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>{t('Aujourd\'hui')}</span>
            <span>{formatFrenchDayShort(stats.next14[13].date)}</span>
          </div>
        </Card>

        <Card title={t('Répartition de la maîtrise')} hint={t('Nombre de cours par niveau (★)')}>
          <div className="space-y-1.5">
            {([4, 3, 2, 1, 0] as MasteryLevel[]).map((lvl) => (
              <div key={lvl} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 font-mono text-slate-600 dark:text-slate-300">{lvl} ★</span>
                <div className="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded ${MASTERY_BAR_COLORS[lvl]}`}
                    style={{ width: `${(stats.masteryCounts[lvl] / maxMastery) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono font-bold text-slate-800 dark:text-white">
                  {stats.masteryCounts[lvl]}
                </span>
              </div>
            ))}
          </div>
          {stats.coursesWithoutRevisionDone > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('{n} cours sans aucun créneau validé pour l\'instant.', { n: stats.coursesWithoutRevisionDone })}
            </p>
          )}
        </Card>

        <Card
          title={t('Mémorisation selon l\'étape J')}
          hint={t('Auto-évaluation moyenne à chaque J : une chute signale l\'étape où l\'on oublie')}
        >
          {stats.retentionByJ.length === 0 ? (
            <p className="text-xs italic text-slate-400 dark:text-slate-500">
              {t('Validez des créneaux avec une note pour voir la courbe.')}
            </p>
          ) : (
            <div className="flex items-end gap-2 h-28">
              {stats.retentionByJ.map((r) => (
                <div
                  key={r.jIndex}
                  className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0"
                  title={t('J{j} : {avg} ★ sur {count}', { j: r.jIndex, avg: r.avgRating.toFixed(1), count: plural(r.count, '{n} créneau', '{n} créneaux') })}
                >
                  <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                    {r.avgRating.toFixed(1)}
                  </span>
                  <div
                    className="w-full rounded-t-sm bg-amber-500/80"
                    style={{ height: `${Math.max(4, (r.avgRating / 4) * 70)}%` }}
                  />
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">J{r.jIndex}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title={t('Cours à surveiller')}
        hint={t('Créneaux en retard, dernière auto-évaluation basse ou maîtrise faible')}
      >
        {stats.watched.length === 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {t('Rien à signaler : aucun retard ni cours fragile.')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.watched.slice(0, 8).map((w) => {
              const sub = subjects.find((x) => x.id === w.course.subjectId);
              return (
                <li key={w.course.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => onOpenCourseDetail?.(w.course)}
                    disabled={!onOpenCourseDetail}
                    className="w-full text-left flex items-center justify-between gap-3 enabled:hover:text-teal-600 dark:enabled:hover:text-teal-400 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Eye className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: w.course.customColor || sub?.color || '#0d9488' }}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {w.course.title}
                      </span>
                    </span>
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium shrink-0">
                      {w.reasons.join(' · ')}
                      {w.oldestOverdueDays > 0 && ` (${w.oldestOverdueDays} ${t('j')})`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {stats.watched.length > 8 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('+ {n} autres cours', { n: stats.watched.length - 8 })}</p>
        )}
      </Card>

      {/* Progress per Medical Discipline */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 transition-colors">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t('Progression par discipline médicale')}
        </h3>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {subjectStats.map((item) => (
            <div
              key={item.subject.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.subject.color }}
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {item.subject.name}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('{courses} cours · {done}/{total} créneaux faits', { courses: item.courseCount, done: item.completedCount, total: item.revisionCount })}
                    {item.overdueCount > 0 && (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold"> · {t('{n} en retard', { n: item.overdueCount })}</span>
                    )}
                  </span>
                  <div className="mt-1 h-1.5 w-40 max-w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${item.revisionCount > 0 ? Math.round((item.completedCount / item.revisionCount) * 100) : 0}%`,
                        backgroundColor: item.subject.color,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{t('Temps révisé')}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {formatMinutes(item.studiedMinutes)}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{t('Note moyenne')}</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {item.avgMastery} ★
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
