import { AppSettings, Course, RevisionItem } from '../types';
import { addDays, diffInDays } from './dateUtils';
import { isFreeCourse } from './jMethod';
import { isInboxCourse } from './inbox';

// Cours en révision libre laissés de côté : aucune R planifiée et rien de fait depuis un moment.
// Le report divise le délai par deux à chaque fois (8, 4, 2, 1 jours pour 15) ; après 1 jour, on ne peut plus
// reporter : il faut planifier une R. Faire ou planifier une R remet tout à zéro.

export const DEFAULT_FREE_ALERT_DAYS = 15;

/** Délai d'alerte réglé (0 = jamais), borné à un an. */
export function getFreeAlertDays(settings: Pick<AppSettings, 'freeAlertDays'>): number {
  const n = settings.freeAlertDays;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 365 ? n : DEFAULT_FREE_ALERT_DAYS;
}

export interface FreeCourseAlert {
  course: Course;
  /** Dernière révision faite (n'importe laquelle), sinon la création du cours. */
  since: string;
  /** Jours écoulés depuis `since`. */
  idleDays: number;
  /** Durée du prochain report, ou null : plus de report possible. */
  nextSnooze: number | null;
}

type Snoozes = AppSettings['freeAlertSnooze'];

/** Dernière activité du cours : sa dernière révision faite, sinon sa date de création. */
export function lastFreeActivity(course: Course, revisions: RevisionItem[]): string {
  return revisions.reduce((last, r) => {
    if (r.courseId !== course.id || !r.completed) return last;
    const d = r.completedDate ?? r.scheduledDate;
    return d > last ? d : last;
  }, course.createdAt);
}

/** Report en cours pour ce cours, seulement s'il date de la même activité (une révision faite depuis l'annule). */
function activeSnooze(snoozes: Snoozes, courseId: string, since: string) {
  const s = snoozes?.[courseId];
  return s && s.since === since ? s : undefined;
}

/** Cours libres en alerte aujourd'hui, le plus ancien d'abord. */
export function findFreeCourseAlerts(
  courses: Course[],
  revisions: RevisionItem[],
  settings: Pick<AppSettings, 'freeAlertDays' | 'freeAlertSnooze'>,
  todayIso: string
): FreeCourseAlert[] {
  const days = getFreeAlertDays(settings);
  if (days === 0) return [];
  const planned = new Set(revisions.filter((r) => !r.completed).map((r) => r.courseId));
  return courses
    .filter((c) => isFreeCourse(c) && !isInboxCourse(c) && !planned.has(c.id))
    .flatMap((course) => {
      const since = lastFreeActivity(course, revisions);
      const snooze = activeSnooze(settings.freeAlertSnooze, course.id, since);
      const due = snooze ? snooze.until : addDays(since, days);
      if (todayIso < due) return [];
      const prev = snooze ? snooze.delay : days;
      return [{ course, since, idleDays: diffInDays(todayIso, since), nextSnooze: prev > 1 ? Math.ceil(prev / 2) : null }];
    })
    .sort((a, b) => a.since.localeCompare(b.since));
}

/** Reports après « Reporter » sur ce cours (inchangés si plus de report possible). */
export function snoozeFreeAlert(
  alert: FreeCourseAlert,
  settings: Pick<AppSettings, 'freeAlertSnooze'>,
  todayIso: string
): NonNullable<Snoozes> {
  const all = { ...(settings.freeAlertSnooze ?? {}) };
  if (alert.nextSnooze === null) return all;
  all[alert.course.id] = { since: alert.since, until: addDays(todayIso, alert.nextSnooze), delay: alert.nextSnooze };
  return all;
}

/** Reports sans ceux des cours donnés (R planifiée) ni ceux des cours disparus. */
export function clearFreeSnoozes(snoozes: Snoozes, courseIds: string[], courses: Course[]): Snoozes {
  if (!snoozes) return snoozes;
  const known = new Set(courses.map((c) => c.id));
  const drop = new Set(courseIds);
  const next = Object.fromEntries(Object.entries(snoozes).filter(([id]) => known.has(id) && !drop.has(id)));
  return Object.keys(next).length > 0 ? next : undefined;
}
