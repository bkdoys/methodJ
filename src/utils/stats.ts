import { Course, MasteryLevel, RevisionItem } from '../types';
import { addDays, diffInDays } from './dateUtils';
import { t } from '../i18n';

export interface DayActivity {
  date: string;
  minutes: number;
  count: number;
}

export interface WatchedCourse {
  course: Course;
  overdueCount: number;
  oldestOverdueDays: number;
  lastRating?: MasteryLevel;
  reasons: string[];
}

export interface RetentionByJ {
  jIndex: number;
  avgRating: number;
  count: number;
}

export interface StudyStats {
  overdue: RevisionItem[];
  dueToday: RevisionItem[];
  upcoming7Days: number;
  onTimeRate: number | null;
  streak: number;
  bestStreak: number;
  last7Minutes: number;
  last30: DayActivity[];
  activeDaysLast30: number;
  avgMinutesPerActiveDay: number;
  next14: DayActivity[];
  masteryCounts: Record<MasteryLevel, number>;
  retentionByJ: RetentionByJ[];
  avgRating: number | null;
  watched: WatchedCourse[];
  coursesWithoutRevisionDone: number;
}

function rangeDays(endIso: string, length: number): string[] {
  return Array.from({ length }, (_, i) => addDays(endIso, i - (length - 1)));
}

/** Calcule toutes les statistiques d'étude à partir des cours et créneaux. */
export function computeStudyStats(
  courses: Course[],
  revisions: RevisionItem[],
  todayIso: string
): StudyStats {
  const done = revisions.filter((r) => r.completed);
  const pending = revisions.filter((r) => !r.completed);

  const overdue = pending
    .filter((r) => r.scheduledDate < todayIso)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const dueToday = pending.filter((r) => r.scheduledDate === todayIso);
  const in7 = addDays(todayIso, 7);
  const upcoming7Days = pending.filter((r) => r.scheduledDate > todayIso && r.scheduledDate <= in7).length;

  // Créneaux validés à la date prévue ou avant
  const withDates = done.filter((r) => r.completedDate);
  const onTime = withDates.filter((r) => (r.completedDate as string) <= r.scheduledDate).length;
  const onTimeRate = withDates.length > 0 ? Math.round((onTime / withDates.length) * 100) : null;

  // Activité par jour de validation
  const byDay = new Map<string, DayActivity>();
  done.forEach((r) => {
    if (!r.completedDate) return;
    const entry = byDay.get(r.completedDate) ?? { date: r.completedDate, minutes: 0, count: 0 };
    entry.minutes += r.durationMinutes;
    entry.count += 1;
    byDay.set(r.completedDate, entry);
  });
  const dayOf = (iso: string): DayActivity => byDay.get(iso) ?? { date: iso, minutes: 0, count: 0 };

  // Série en cours (tolère qu'aujourd'hui ne soit pas encore fait) et meilleure série
  let streak = 0;
  let cursor = byDay.has(todayIso) ? todayIso : addDays(todayIso, -1);
  while (byDay.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const sortedDays = [...byDay.keys()].sort();
  let bestStreak = 0;
  let run = 0;
  sortedDays.forEach((d, i) => {
    run = i > 0 && diffInDays(d, sortedDays[i - 1]) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  });

  const last30 = rangeDays(todayIso, 30).map(dayOf);
  const last7Minutes = last30.slice(-7).reduce((acc, d) => acc + d.minutes, 0);
  const activeDaysLast30 = last30.filter((d) => d.count > 0).length;
  const avgMinutesPerActiveDay =
    activeDaysLast30 > 0
      ? Math.round(last30.reduce((acc, d) => acc + d.minutes, 0) / activeDaysLast30)
      : 0;

  // Charge à venir : retards ramenés à aujourd'hui + 14 jours
  const next14: DayActivity[] = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(todayIso, i);
    const slots = pending.filter((r) => (i === 0 ? r.scheduledDate <= date : r.scheduledDate === date));
    return { date, minutes: slots.reduce((a, r) => a + r.durationMinutes, 0), count: slots.length };
  });

  const masteryCounts: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  courses.forEach((c) => masteryCounts[c.mastery]++);

  // Auto-évaluation moyenne par étape J : montre où la mémorisation décroche
  const ratedByJ = new Map<number, number[]>();
  done.forEach((r) => {
    if (r.rating === undefined) return;
    ratedByJ.set(r.jIndex, [...(ratedByJ.get(r.jIndex) ?? []), r.rating]);
  });
  const retentionByJ = [...ratedByJ.entries()]
    .map(([jIndex, vals]) => ({
      jIndex,
      count: vals.length,
      avgRating: vals.reduce((a, b) => a + b, 0) / vals.length,
    }))
    .sort((a, b) => a.jIndex - b.jIndex);
  const allRatings: number[] = done.flatMap((r) => (r.rating === undefined ? [] : [r.rating]));
  const avgRating =
    allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;

  // Cours à surveiller : retard, maîtrise faible, ou dernière évaluation basse
  const watched: WatchedCourse[] = courses
    .map((course) => {
      const own = revisions.filter((r) => r.courseId === course.id);
      const late = own.filter((r) => !r.completed && r.scheduledDate < todayIso);
      const lastDone = own
        .filter((r) => r.completed && r.rating !== undefined)
        .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? '') || b.jIndex - a.jIndex)[0];
      const lastRating = lastDone?.rating;
      const reasons: string[] = [];
      if (late.length > 0) reasons.push(t('{n} en retard', { n: late.length }));
      if (lastRating !== undefined && lastRating <= 1) reasons.push(t('dernière éval. {n} ★', { n: lastRating }));
      else if (course.mastery <= 1 && own.some((r) => r.completed)) reasons.push(t('maîtrise {n} ★', { n: course.mastery }));
      const oldest = late.length > 0 ? Math.max(...late.map((r) => diffInDays(todayIso, r.scheduledDate))) : 0;
      return { course, overdueCount: late.length, oldestOverdueDays: oldest, lastRating, reasons };
    })
    .filter((w) => w.reasons.length > 0)
    .sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays || b.reasons.length - a.reasons.length);

  const withDone = new Set(done.map((r) => r.courseId));
  const coursesWithoutRevisionDone = courses.filter((c) => !withDone.has(c.id)).length;

  return {
    overdue,
    dueToday,
    upcoming7Days,
    onTimeRate,
    streak,
    bestStreak,
    last7Minutes,
    last30,
    activeDaysLast30,
    avgMinutesPerActiveDay,
    next14,
    masteryCounts,
    retentionByJ,
    avgRating,
    watched,
    coursesWithoutRevisionDone,
  };
}
