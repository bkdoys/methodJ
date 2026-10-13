import { CardReview } from '../types';
import { formatIsoDate } from './dateUtils';
import type { CardGrade } from './srs';

/**
 * Journal des notes données aux cartes (une entrée par note, en séance de programmation). Le paquet ne garde que le
 * dernier état de chaque carte ; le journal garde l'historique, sans lequel on ne peut ni compter les révisions par
 * jour ni mesurer la vraie rétention. Un document par jour (`users/{uid}/cardLogs/{AAAA-MM-JJ}`, jour local de
 * l'appareil), fusionné par union : jamais d'écrasement entre appareils. Pur, testé.
 */

export interface ReviewEntry {
  /** Instant de la note (ISO) : c'est aussi le `lastReview` que cette note a posé sur la carte. */
  t: string;
  /** Cours et clé de la sous-carte (`cardId`, `cardId:c2`, `cardId:m3`). */
  c: string;
  k: string;
  /** Note : 1 Encore, 2 Difficile, 3 Bien, 4 Facile. */
  g: CardGrade;
  /** État de la carte avant la note : 0 nouvelle, 1 apprentissage, 2 révision, 3 réapprentissage. */
  s: 0 | 1 | 2 | 3;
}

export interface ReviewLogDay {
  /** Jour local, `AAAA-MM-JJ`. */
  id: string;
  entries: ReviewEntry[];
}

export type ReviewLog = Record<string, ReviewLogDay>;

/** Ce que le lecteur de cartes annonce avec un nouvel état : une note, ou l'annulation de la dernière. */
export type ReviewEvent = { grade: CardGrade; before?: CardReview } | { undone: CardReview };

/** Au-delà, les plus anciennes entrées du jour sont écartées (garde-fou : Firestore borne le document). */
export const MAX_ENTRIES_PER_DAY = 3000;

export const entryId = (e: Pick<ReviewEntry, 't' | 'c' | 'k'>) => `${e.t}|${e.c}|${e.k}`;
export const logDayOf = (t: string) => formatIsoDate(new Date(t));

/** Entrée d'une note : `review` est l'état posé par la note (son `lastReview` date l'entrée). */
export function entryFromReview(courseId: string, key: string, review: CardReview, grade: CardGrade, before?: CardReview): ReviewEntry | null {
  if (!review.lastReview) return null;
  return { t: review.lastReview, c: courseId, k: key, g: grade, s: before?.state ?? 0 };
}

function sortEntries(list: ReviewEntry[]): ReviewEntry[] {
  return [...list].sort((a, b) => a.t.localeCompare(b.t) || a.c.localeCompare(b.c) || a.k.localeCompare(b.k)).slice(-MAX_ENTRIES_PER_DAY);
}

export function addEntry(log: ReviewLog, entry: ReviewEntry): ReviewLog {
  const id = logDayOf(entry.t);
  const day = log[id];
  if (day?.entries.some((e) => entryId(e) === entryId(entry))) return log;
  return { ...log, [id]: { id, entries: sortEntries([...(day?.entries ?? []), entry]) } };
}

/** Retire une entrée (note annulée avant l'envoi). Un jour vidé disparaît. */
export function removeEntry(log: ReviewLog, ref: Pick<ReviewEntry, 't' | 'c' | 'k'>): ReviewLog {
  const id = logDayOf(ref.t);
  const day = log[id];
  if (!day) return log;
  const entries = day.entries.filter((e) => entryId(e) !== entryId(ref));
  if (entries.length === day.entries.length) return log;
  const next = { ...log };
  if (entries.length === 0) delete next[id];
  else next[id] = { id, entries };
  return next;
}

/** Union de deux versions d'un même jour ; l'ordre est canonique, donc le résultat ne dépend pas de l'ordre des arguments. */
export function mergeLogDays(a: ReviewLogDay, b: ReviewLogDay): ReviewLogDay {
  const byId = new Map<string, ReviewEntry>();
  [...a.entries, ...b.entries].forEach((e) => byId.set(entryId(e), e));
  return { id: a.id, entries: sortEntries([...byId.values()]) };
}

export function sameLogDay(a: ReviewLogDay | undefined, b: ReviewLogDay | undefined): boolean {
  if (!a || !b) return a === b;
  return a.entries.length === b.entries.length && a.entries.every((e, i) => entryId(e) === entryId(b.entries[i]));
}

/** Entrées valides d'un document venu du cloud ou d'une sauvegarde (le reste est ignoré). */
export function parseEntries(raw: unknown): ReviewEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ReviewEntry =>
      !!e &&
      typeof e.t === 'string' &&
      typeof e.c === 'string' &&
      typeof e.k === 'string' &&
      [1, 2, 3, 4].includes(e.g) &&
      [0, 1, 2, 3].includes(e.s)
  );
}
