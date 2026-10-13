import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import { CardReview } from '../types';
import { formatIsoDate } from './dateUtils';

/**
 * Programmation des cartes avec FSRS (l'algorithme par défaut d'Anki), via `ts-fsrs`. Les états sont stockés en
 * texte simple (`CardReview`) dans le paquet ; ce module fait la conversion. Notes : 1 Encore, 2 Difficile, 3 Bien,
 * 4 Facile.
 */
export type CardGrade = 1 | 2 | 3 | 4;
export const GRADES: CardGrade[] = [1, 2, 3, 4];

const GRADE_TO_RATING: Record<CardGrade, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

// Intervalles un peu dispersés (fuzz) pour que les cartes créées ensemble ne reviennent pas toutes le même jour
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, maximum_interval: 3650 }));

function toCard(review: CardReview | undefined, now: Date): Card {
  if (!review) return createEmptyCard(now);
  const last = review.lastReview ? new Date(review.lastReview) : undefined;
  return {
    due: new Date(review.due),
    stability: review.stability,
    difficulty: review.difficulty,
    elapsed_days: last ? Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000)) : 0,
    scheduled_days: review.scheduledDays,
    learning_steps: review.step,
    reps: review.reps,
    lapses: review.lapses,
    state: review.state,
    ...(last ? { last_review: last } : {}),
  };
}

function fromCard(card: Card, firstReview: string | undefined): CardReview {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as CardReview['state'],
    scheduledDays: card.scheduled_days,
    step: card.learning_steps,
    ...(card.last_review ? { lastReview: card.last_review.toISOString() } : {}),
    ...(firstReview ? { firstReview } : {}),
  };
}

/** Nouvel état d'une sous-carte après une note (`review` absent = carte jamais vue). */
export function gradeCard(review: CardReview | undefined, grade: CardGrade, now: Date): CardReview {
  const next = scheduler.next(toCard(review, now), now, GRADE_TO_RATING[grade]);
  return fromCard(next.card, review?.firstReview ?? formatIsoDate(now));
}

/** Délai (ms) avant le prochain passage pour chaque note : affiché sur les boutons. */
export function previewIntervals(review: CardReview | undefined, now: Date): Record<CardGrade, number> {
  const preview = scheduler.repeat(toCard(review, now), now);
  const out = {} as Record<CardGrade, number>;
  GRADES.forEach((g) => {
    out[g] = Math.max(0, preview[GRADE_TO_RATING[g]].card.due.getTime() - now.getTime());
  });
  return out;
}

/** Encore en apprentissage et à revoir dans l'heure : la carte revient dans la même séance. */
export function isShortTerm(review: CardReview, now: Date): boolean {
  return (review.state === 1 || review.state === 3) && new Date(review.due).getTime() - now.getTime() < 3_600_000;
}

/**
 * Probabilité (0 à 1) de se souvenir de la sous-carte à `now`, d'après la courbe d'oubli FSRS ; null pour une carte
 * jamais notée.
 */
export function retrievability(review: CardReview | undefined, now: Date): number | null {
  if (!review?.lastReview || !(review.stability > 0)) return null;
  const elapsed = Math.max(0, (now.getTime() - new Date(review.lastReview).getTime()) / 86_400_000);
  return scheduler.forgetting_curve(elapsed, review.stability);
}

/** Intervalle lisible et court : « 10 min », « 3 h », « 8 j », « 2 mois », « 1,5 an ». */
export function intervalParts(ms: number): { n: string; unit: 'min' | 'h' | 'd' | 'mo' | 'y' } {
  const min = ms / 60_000;
  if (min < 60) return { n: String(Math.max(1, Math.round(min))), unit: 'min' };
  const h = min / 60;
  if (h < 24) return { n: String(Math.round(h)), unit: 'h' };
  const d = h / 24;
  if (d < 30) return { n: String(Math.round(d)), unit: 'd' };
  if (d < 365) return { n: String(Math.round(d / 30)), unit: 'mo' };
  const y = Math.round((d / 365) * 10) / 10;
  return { n: String(y), unit: 'y' };
}
