import { addDays, diffInDays } from './dateUtils';
import { ReviewLog } from './reviewLog';

/** Statistiques tirées du journal des notes de cartes. Pur, testé. */

export interface ReviewLogStats {
  /** Notes données, tous jours confondus. */
  total: number;
  /** Notes par jour sur `days` jours (le dernier est aujourd'hui). */
  perDay: { date: string; count: number }[];
  activeDays: number;
  avgPerActiveDay: number;
  /** Jours de suite avec au moins une note (aujourd'hui peut ne pas être encore fait). */
  streak: number;
  /** Part des notes autres que « Encore » pour les cartes déjà en révision (état 2) ; null sans donnée. */
  trueRetention: number | null;
  /** Réponses prises en compte dans `trueRetention`. */
  retentionBase: number;
  /** Répartition des notes 1 à 4 sur les `days` derniers jours. */
  grades: Record<1 | 2 | 3 | 4, number>;
}

export function computeReviewLogStats(log: ReviewLog, todayIso: string, days = 30): ReviewLogStats {
  const from = addDays(todayIso, -(days - 1));
  const perDay = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, count: log[date]?.entries.length ?? 0 };
  });
  const grades = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let total = 0;
  let kept = 0;
  let base = 0;
  Object.values(log).forEach((day) => {
    total += day.entries.length;
    if (day.id < from || day.id > todayIso) return;
    day.entries.forEach((e) => {
      grades[e.g]++;
      if (e.s === 2) {
        base++;
        if (e.g > 1) kept++;
      }
    });
  });
  const activeDays = perDay.filter((d) => d.count > 0).length;
  const inWindow = perDay.reduce((a, d) => a + d.count, 0);

  let streak = 0;
  let cursor = (log[todayIso]?.entries.length ?? 0) > 0 ? todayIso : addDays(todayIso, -1);
  while ((log[cursor]?.entries.length ?? 0) > 0 && diffInDays(todayIso, cursor) < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return {
    total,
    perDay,
    activeDays,
    avgPerActiveDay: activeDays > 0 ? Math.round(inWindow / activeDays) : 0,
    streak,
    trueRetention: base > 0 ? kept / base : null,
    retentionBase: base,
    grades,
  };
}
