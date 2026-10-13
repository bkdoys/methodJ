import { Course, MasteryLevel, RevisionItem, Subject } from '../types';
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

// ---------------------------------------------------------------------------
// Vue Statistiques : progression (le tableau de bord, lui, sert à agir)

/** Charge prévue jour par jour sur `days` jours ; le premier jour compte aussi les retards. */
export function forecastLoad(revisions: RevisionItem[], todayIso: string, days: number): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  const last = addDays(todayIso, days - 1);
  revisions.forEach((r) => {
    if (r.completed || r.scheduledDate > last) return;
    const date = r.scheduledDate < todayIso ? todayIso : r.scheduledDate;
    const entry = byDay.get(date) ?? { date, minutes: 0, count: 0 };
    entry.minutes += r.durationMinutes;
    entry.count += 1;
    byDay.set(date, entry);
  });
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(todayIso, i);
    return byDay.get(date) ?? { date, minutes: 0, count: 0 };
  });
}

/** Un cours est « commencé » quand son J0 est validé. */
export function startedCourseIds(revisions: RevisionItem[]): Set<string> {
  return new Set(revisions.filter((r) => r.completed && r.jIndex === 0).map((r) => r.courseId));
}

export interface Coverage {
  started: number;
  total: number;
  /** Cours commencés par semaine, en moyenne sur les 4 dernières semaines. */
  perWeek: number;
}

export function computeCoverage(courses: Course[], revisions: RevisionItem[], todayIso: string): Coverage {
  const known = new Set(courses.map((c) => c.id));
  const from = addDays(todayIso, -27);
  const j0 = revisions.filter((r) => r.completed && r.jIndex === 0 && known.has(r.courseId));
  const recent = j0.filter((r) => r.completedDate && r.completedDate >= from && r.completedDate <= todayIso);
  return {
    started: new Set(j0.map((r) => r.courseId)).size,
    total: courses.length,
    perWeek: Math.round((new Set(recent.map((r) => r.courseId)).size / 4) * 10) / 10,
  };
}

export interface WeekSummary {
  count: number;
  minutes: number;
  avgRating: number | null;
}

function summarizeRange(revisions: RevisionItem[], fromIso: string, toIso: string): WeekSummary {
  const list = revisions.filter((r) => r.completed && r.completedDate && r.completedDate >= fromIso && r.completedDate <= toIso);
  const ratings: number[] = list.flatMap((r) => (r.rating === undefined ? [] : [r.rating]));
  return {
    count: list.length,
    minutes: list.reduce((a, r) => a + r.durationMinutes, 0),
    avgRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}

/** Les 7 derniers jours (aujourd'hui compris) et les 7 d'avant. */
export function compareWeeks(revisions: RevisionItem[], todayIso: string): { current: WeekSummary; previous: WeekSummary } {
  return {
    current: summarizeRange(revisions, addDays(todayIso, -6), todayIso),
    previous: summarizeRange(revisions, addDays(todayIso, -13), addDays(todayIso, -7)),
  };
}

/** Retard moyen (jours) des créneaux validés après leur date ; null s'il n'y en a pas. */
export function averageDelay(revisions: RevisionItem[]): { days: number; count: number } | null {
  const late = revisions.filter((r) => r.completed && r.completedDate && r.completedDate > r.scheduledDate);
  if (late.length === 0) return null;
  const total = late.reduce((a, r) => a + diffInDays(r.completedDate as string, r.scheduledDate), 0);
  return { days: Math.round((total / late.length) * 10) / 10, count: late.length };
}

export interface SubjectProgress {
  subject: Subject;
  courseCount: number;
  started: number;
  revisionCount: number;
  completedCount: number;
  overdueCount: number;
  minutes: number;
  /** Cours par niveau de maîtrise, parmi les cours commencés (un cours neuf n'a pas encore de note). */
  mastery: Record<MasteryLevel, number>;
  /** Dernier créneau validé, ou undefined. */
  lastDone?: string;
}

export function computeSubjectProgress(
  subjects: Subject[],
  courses: Course[],
  revisions: RevisionItem[],
  todayIso: string
): SubjectProgress[] {
  const started = startedCourseIds(revisions);
  return subjects.map((subject) => {
    const own = courses.filter((c) => c.subjectId === subject.id);
    const ids = new Set(own.map((c) => c.id));
    const revs = revisions.filter((r) => ids.has(r.courseId));
    const done = revs.filter((r) => r.completed);
    const mastery: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    own.forEach((c) => started.has(c.id) && mastery[c.mastery]++);
    const lastDone = done.reduce<string | undefined>((a, r) => (r.completedDate && (!a || r.completedDate > a) ? r.completedDate : a), undefined);
    return {
      subject,
      courseCount: own.length,
      started: own.filter((c) => started.has(c.id)).length,
      revisionCount: revs.length,
      completedCount: done.length,
      overdueCount: revs.filter((r) => !r.completed && r.scheduledDate < todayIso).length,
      minutes: done.reduce((a, r) => a + r.durationMinutes, 0),
      mastery,
      lastDone,
    };
  });
}

export interface DriftStats {
  /** Créneaux suivis (une date d'origine figée) : validés ou déjà repoussés. */
  tracked: number;
  /** Créneaux validés, dont ceux faits à leur date d'origine ou avant. */
  done: number;
  onOriginal: number;
  /** Écart moyen (jours) des créneaux validés par rapport à leur date d'origine ; négatif = en avance. */
  avgDrift: number | null;
  /** Écart moyen par étape J, sur les créneaux validés. */
  byJ: { jIndex: number; avg: number; count: number }[];
  /** Cours les plus décalés : plus grand écart parmi leurs créneaux (validés ou encore à faire, repoussés ou en retard). */
  courses: { course: Course; drift: number }[];
}

/**
 * Dérive par rapport au planning d'origine (`originalDate`, figée à la validation du J0). Un créneau validé compte
 * `completedDate - originalDate` ; un créneau à faire compte l'écart déjà pris (date prévue ou aujourd'hui si en retard)
 * seulement quand il est positif.
 */
export function computeDrift(courses: Course[], revisions: RevisionItem[], todayIso: string): DriftStats {
  const byCourse = new Map<string, number>();
  const perJ = new Map<number, number[]>();
  const doneDrifts: number[] = [];
  let tracked = 0;

  revisions.forEach((r) => {
    if (!r.originalDate) return;
    if (r.completed && r.completedDate) {
      const d = diffInDays(r.completedDate, r.originalDate);
      tracked++;
      doneDrifts.push(d);
      perJ.set(r.jIndex, [...(perJ.get(r.jIndex) ?? []), d]);
      byCourse.set(r.courseId, Math.max(byCourse.get(r.courseId) ?? 0, d));
    } else if (!r.completed) {
      const effective = r.scheduledDate < todayIso ? todayIso : r.scheduledDate;
      const d = diffInDays(effective, r.originalDate);
      if (d > 0) {
        tracked++;
        byCourse.set(r.courseId, Math.max(byCourse.get(r.courseId) ?? 0, d));
      }
    }
  });

  const known = new Map(courses.map((c) => [c.id, c]));
  return {
    tracked,
    done: doneDrifts.length,
    onOriginal: doneDrifts.filter((d) => d <= 0).length,
    avgDrift: doneDrifts.length > 0 ? Math.round((doneDrifts.reduce((a, b) => a + b, 0) / doneDrifts.length) * 10) / 10 : null,
    byJ: [...perJ.entries()]
      .map(([jIndex, vals]) => ({ jIndex, count: vals.length, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
      .sort((a, b) => a.jIndex - b.jIndex),
    courses: [...byCourse.entries()]
      .filter(([id, d]) => d > 0 && known.has(id))
      .map(([id, drift]) => ({ course: known.get(id) as Course, drift }))
      .sort((a, b) => b.drift - a.drift),
  };
}

export interface ExamProjection {
  daysLeft: number;
  remaining: number;
  /** Cours à commencer par semaine pour tout voir avant l'examen. */
  neededPerWeek: number;
  /** Rythme actuel (cours commencés par semaine sur 4 semaines). */
  perWeek: number;
  /** Date où tous les cours seront commencés au rythme actuel ; null sans rythme. */
  projectedDate: string | null;
  /** Vrai si, au rythme actuel, tout est commencé avant l'examen. */
  onTrack: boolean;
  /** Longueur du cycle des cours restants (plus grand J). */
  cycleDays: number;
  /** Dernier jour pour commencer un cours et avoir tout son cycle avant l'examen. */
  lastFullCycleStart: string;
}

/**
 * Projection vers la date d'examen : extrapolation linéaire du rythme des 4 dernières semaines, sans tenir compte des
 * vacances ni des cours qui seront ajoutés. Null sans date d'examen ou une fois passée.
 */
export function computeExamProjection(
  courses: Course[],
  revisions: RevisionItem[],
  examDate: string | undefined,
  todayIso: string
): ExamProjection | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const daysLeft = diffInDays(examDate, todayIso);
  if (daysLeft < 0) return null;
  const { started, total, perWeek } = computeCoverage(courses, revisions, todayIso);
  const begun = startedCourseIds(revisions);
  const left = courses.filter((c) => !begun.has(c.id));
  const remaining = Math.max(0, total - started);
  const cycleDays = Math.max(0, ...left.flatMap((c) => c.activeJList));
  const projectedDays = remaining === 0 ? 0 : perWeek > 0 ? Math.ceil((remaining / perWeek) * 7) : null;
  const projectedDate = projectedDays === null ? null : addDays(todayIso, projectedDays);
  return {
    daysLeft,
    remaining,
    neededPerWeek: daysLeft > 0 ? Math.round(((remaining * 7) / daysLeft) * 10) / 10 : remaining,
    perWeek,
    projectedDate,
    onTrack: remaining === 0 || (projectedDate !== null && projectedDate <= examDate),
    cycleDays,
    lastFullCycleStart: addDays(examDate, -cycleDays),
  };
}
