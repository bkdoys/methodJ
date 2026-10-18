import { CardReview } from '../../types';
import { formatIsoDate } from '../dateUtils';
import type { AnkiCard } from './reader';

// Avancement d'une carte Anki → état FSRS (`CardReview`).
//   - si Anki a l'état mémoire FSRS (réglage activé, JSON `{"s":…,"d":…}` dans la carte), on le reprend tel quel ;
//   - sinon (algorithme SM-2) on l'approche : la stabilité FSRS est l'intervalle où la probabilité de rappel tombe à
//     90 %, donc stabilité ≈ intervalle ; la difficulté vient de la facilité (250 % = difficulté moyenne, 130 % = la
//     plus difficile, 350 % = la plus facile).
// C'est une approximation : après l'import, les prochaines notes recalent l'état.

const DAY_S = 86400;

export interface FsrsData {
  /** Stabilité, en jours. */
  s: number;
  /** Difficulté, de 1 à 10. */
  d: number;
  /** Dernière révision (secondes), si Anki la note. */
  lrt?: number;
}

export function parseFsrsData(data: string): FsrsData | null {
  if (!data || data === '{}') return null;
  try {
    const j = JSON.parse(data) as { s?: unknown; d?: unknown; lrt?: unknown };
    if (typeof j.s !== 'number' || typeof j.d !== 'number' || !(j.s > 0) || !(j.d > 0)) return null;
    return { s: j.s, d: Math.min(10, Math.max(1, j.d)), ...(typeof j.lrt === 'number' && j.lrt > 0 ? { lrt: j.lrt } : {}) };
  } catch {
    return null;
  }
}

/** Difficulté FSRS (1 à 10) déduite de la facilité Anki (en millièmes) ; 5 quand elle est inconnue. */
export function difficultyFromEase(factor: number): number {
  if (!(factor > 0)) return 5;
  const d = 10 - ((Math.min(3500, Math.max(1300, factor)) - 1300) / (3500 - 1300)) * 9;
  return Math.round(d * 100) / 100;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/**
 * État FSRS d'une carte Anki, ou null si elle est nouvelle (rien à reprendre).
 * `crt` : création de la collection (secondes), car l'échéance d'une carte de révision est un nombre de jours depuis ce jour.
 */
export function ankiCardToReview(card: AnkiCard, crt: number, now: Date): CardReview | null {
  if (card.type === 0 || card.type > 3) return null;
  const fsrs = parseFsrsData(card.data);

  // Une carte enterrée (queue < 0) garde l'échéance de son type ; sinon la file dit si c'est une date ou un nombre de jours
  const inDays = card.queue === 2 || card.queue === 3 || (card.queue < 0 && card.type !== 1);
  const dueSeconds = inDays ? crt + card.due * DAY_S : card.due;
  if (!Number.isFinite(dueSeconds) || dueSeconds <= 0) return null;

  const review = card.type === 2 || card.type === 3;
  const interval = review ? Math.max(0, card.ivl) : 0;
  const stability = fsrs?.s ?? (review ? Math.max(1, interval) : 0.5);
  const difficulty = fsrs?.d ?? difficultyFromEase(card.factor);

  // Dernière révision : celle qu'Anki note, sinon l'échéance moins l'intervalle (jamais dans le futur)
  const lastSeconds = fsrs?.lrt ?? (review && interval > 0 ? dueSeconds - interval * DAY_S : undefined);
  const last = lastSeconds !== undefined && lastSeconds * 1000 <= now.getTime() ? lastSeconds : undefined;

  return {
    due: iso(dueSeconds),
    stability,
    difficulty,
    reps: Math.max(0, card.reps),
    lapses: Math.max(0, card.lapses),
    state: card.type as 1 | 2 | 3,
    scheduledDays: interval,
    step: 0,
    ...(last !== undefined ? { lastReview: iso(last) } : {}),
    // Date de la première note : sert à compter les nouvelles cartes du jour ; sans elle, la première note après l'import
    // compterait comme une nouvelle carte d'aujourd'hui
    firstReview: formatIsoDate(new Date(last !== undefined ? last * 1000 : now.getTime())),
  };
}
