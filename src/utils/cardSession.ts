import { Deck } from '../types';
import { clozeNumbers, liveCards } from './flashcards';
import { maskGroups } from './occlusion';
// Types seulement : `ts-fsrs` reste dans le morceau du lecteur, hors du démarrage
import type { CardGrade } from './srs';

/** Une sous-carte à jouer : la carte, et le numéro du trou (texte à trous) ou du groupe de masques. */
export interface SessionItem {
  courseId: string;
  cardId: string;
  /** Clé de programmation dans `deck.review` (`cardId`, `cardId:c2` ou `cardId:m3`). */
  key: string;
  cloze?: number;
  mask?: number;
}

/** Toutes les sous-cartes des cours demandés, dans l'ordre des cours puis des cartes. */
export function subCardItems(decks: Record<string, Deck>, courseIds: Iterable<string>): SessionItem[] {
  const items: SessionItem[] = [];
  for (const courseId of courseIds) {
    liveCards(decks[courseId]).forEach((card) => {
      if (card.kind === 'basic') items.push({ courseId, cardId: card.id, key: card.id });
      else if (card.kind === 'occlusion')
        maskGroups(card.masks ?? []).forEach((g) => items.push({ courseId, cardId: card.id, key: `${card.id}:m${g}`, mask: g }));
      else clozeNumbers(card.front).forEach((n) => items.push({ courseId, cardId: card.id, key: `${card.id}:c${n}`, cloze: n }));
    });
  }
  return items;
}

/** Mélange reproductible (même graine = même ordre). */
export function shuffle<T>(list: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface DueSummary {
  /** Sous-cartes déjà vues et à revoir maintenant (les plus en retard d'abord). */
  due: SessionItem[];
  /** Nouvelles sous-cartes proposées aujourd'hui (dans la limite du jour). */
  fresh: SessionItem[];
  /** Nouvelles sous-cartes restantes au total (au-delà de la limite comprise). */
  freshTotal: number;
}

/**
 * Cartes du jour : celles à revoir, puis des nouvelles jusqu'à `newPerDay` par jour (celles déjà commencées
 * aujourd'hui, d'après `firstReview`, sont décomptées). `today` = YYYY-MM-DD local.
 */
export function dueToday(
  decks: Record<string, Deck>,
  courseIds: Iterable<string>,
  now: Date,
  today: string,
  newPerDay: number
): DueSummary {
  const items = subCardItems(decks, courseIds);
  const due: { item: SessionItem; at: string }[] = [];
  const fresh: SessionItem[] = [];
  items.forEach((item) => {
    const r = decks[item.courseId]?.review[item.key];
    if (!r) fresh.push(item);
    else if (new Date(r.due).getTime() <= now.getTime()) due.push({ item, at: r.due });
  });
  due.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const room = newCardsRoom(decks, today, newPerDay);
  return { due: due.map((d) => d.item), fresh: fresh.slice(0, room), freshTotal: fresh.length };
}

/** Limite par défaut des nouvelles cartes par jour (`settings.cardsNewPerDay`). */
export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const NEW_CARDS_PER_DAY_CHOICES = [0, 5, 10, 15, 20, 30, 50, 100];

export function getNewCardsPerDay(settings: { cardsNewPerDay?: number }): number {
  const n = settings.cardsNewPerDay;
  return typeof n === 'number' && n >= 0 ? Math.floor(n) : DEFAULT_NEW_CARDS_PER_DAY;
}

export interface CardCounts {
  /** Sous-cartes jouables. */
  total: number;
  /** Déjà vues et à revoir maintenant. */
  due: number;
  /** Jamais vues (sans la limite du jour). */
  fresh: number;
}

/** Compteurs par cours, à additionner pour un dossier ou une discipline. */
export function courseCardCounts(decks: Record<string, Deck>, now: Date): Record<string, CardCounts> {
  const out: Record<string, CardCounts> = {};
  Object.keys(decks).forEach((courseId) => {
    const c: CardCounts = { total: 0, due: 0, fresh: 0 };
    subCardItems(decks, [courseId]).forEach((item) => {
      c.total++;
      const r = decks[courseId].review[item.key];
      if (!r) c.fresh++;
      else if (new Date(r.due).getTime() <= now.getTime()) c.due++;
    });
    if (c.total > 0) out[courseId] = c;
  });
  return out;
}

/** Nouvelles cartes encore permises aujourd'hui (la limite moins celles commencées aujourd'hui). */
export function newCardsRoom(decks: Record<string, Deck>, today: string, newPerDay: number): number {
  let started = 0;
  Object.values(decks).forEach((d) =>
    Object.values(d.review).forEach((r) => {
      if (r.firstReview === today) started++;
    })
  );
  return Math.max(0, newPerDay - started);
}

// ---------------------------------------------------------------------------
// Déroulé d'une séance

/** Une carte ratée revient après ce nombre de cartes (ou à la fin s'il en reste moins). */
export const REQUEUE_GAP = 4;

export interface SessionState {
  queue: SessionItem[];
  pos: number;
  /** Première note de chaque sous-carte dans la séance : sert au bilan. */
  first: Record<string, CardGrade>;
}

export function startSession(items: SessionItem[]): SessionState {
  return { queue: items, pos: 0, first: {} };
}

export function currentItem(s: SessionState): SessionItem | undefined {
  return s.queue[s.pos];
}

/** Note la carte en cours ; `again` = elle revient un peu plus loin dans la séance. */
export function answer(s: SessionState, grade: CardGrade, again: boolean): SessionState {
  const item = s.queue[s.pos];
  if (!item) return s;
  const first = item.key in s.first ? s.first : { ...s.first, [item.key]: grade };
  let queue = s.queue;
  if (again) {
    const at = Math.min(s.queue.length, s.pos + 1 + REQUEUE_GAP);
    queue = [...s.queue.slice(0, at), item, ...s.queue.slice(at)];
  }
  return { queue, pos: s.pos + 1, first };
}

export interface SessionSummary {
  cards: number;
  byGrade: Record<CardGrade, number>;
  /** Part des cartes réussies du premier coup (note autre que « Encore »), en %. */
  success: number;
}

export function summarize(s: SessionState): SessionSummary {
  const byGrade: Record<CardGrade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const grades = Object.values(s.first);
  grades.forEach((g) => byGrade[g]++);
  const cards = grades.length;
  return { cards, byGrade, success: cards ? Math.round(((cards - byGrade[1]) / cards) * 100) : 0 };
}
