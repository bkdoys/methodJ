import { Course, RevisionItem } from '../types';
import { computeStudyStats, StudyStats } from './stats';

export interface DashboardData {
  stats: StudyStats;
  /** Tous les créneaux du jour (faits ou non), dans l'ordre du planning. */
  today: RevisionItem[];
  todayPending: RevisionItem[];
  todayMinutes: number;
  todayDoneMinutes: number;
  /** Premier créneau non validé à partir d'aujourd'hui (aujourd'hui compris). */
  next?: RevisionItem;
  /** Cours qui n'ont plus aucun créneau à faire (cycle terminé, ou rien de prévu), le plus récemment terminé d'abord. */
  idleCourses: Course[];
}

/**
 * Cours sans aucun créneau non validé, retard compris (un retard a sa propre carte). Triés par date de leur dernier créneau,
 * le plus récent d'abord ; un cours sans créneau du tout passe en dernier.
 */
export function findIdleCourses(courses: Course[], revisions: RevisionItem[]): Course[] {
  const last = new Map<string, string>();
  const open = new Set<string>();
  revisions.forEach((r) => {
    if (!r.completed) open.add(r.courseId);
    const cur = last.get(r.courseId);
    if (!cur || r.scheduledDate > cur) last.set(r.courseId, r.scheduledDate);
  });
  return courses
    .filter((c) => !open.has(c.id))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? ''));
}

/** Données du tableau de bord : les statistiques existantes, plus la vue « aujourd'hui ». */
export function computeDashboard(courses: Course[], revisions: RevisionItem[], todayIso: string): DashboardData {
  const stats = computeStudyStats(courses, revisions, todayIso);
  const today = revisions.filter((r) => r.scheduledDate === todayIso).sort((a, b) => a.slotOrder - b.slotOrder);
  const todayPending = today.filter((r) => !r.completed);
  const next = revisions
    .filter((r) => !r.completed && r.scheduledDate >= todayIso)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.slotOrder - b.slotOrder)[0];
  return {
    stats,
    idleCourses: findIdleCourses(courses, revisions),
    today,
    todayPending,
    todayMinutes: today.reduce((n, r) => n + r.durationMinutes, 0),
    todayDoneMinutes: today.filter((r) => r.completed).reduce((n, r) => n + r.durationMinutes, 0),
    next,
  };
}

/**
 * Nombre d'éléments qui demandent une action (pastille de l'onglet) :
 * créneaux en retard, conflit de synchro et, plus tard, jours surchargés.
 */
export function countAlerts(parts: { overdue: number; syncConflict: boolean; overloadedDays?: number }): number {
  return parts.overdue + (parts.syncConflict ? 1 : 0) + (parts.overloadedDays ?? 0);
}
