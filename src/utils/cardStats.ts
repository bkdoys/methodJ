import { Deck, Flashcard } from '../types';
import { subCardItems } from './cardSession';
import { addDays, diffInDays, formatIsoDate } from './dateUtils';
import { liveCards } from './flashcards';
import { retrievability } from './srs';

/**
 * Statistiques des flashcards à partir de l'état FSRS de chaque sous-carte (le paquet ne garde pas l'historique des
 * révisions : seulement le dernier état). Pur, testé.
 */

/** Intervalle (jours) à partir duquel une carte est dite « mûre », comme dans Anki. */
export const MATURE_DAYS = 21;
/** Oublis à partir desquels une carte est une « sangsue » : elle coûte du temps sans rester. */
export const LEECH_LAPSES = 6;

export interface CardStateCounts {
  fresh: number;
  learning: number;
  young: number;
  mature: number;
}

export interface Leech {
  courseId: string;
  card: Flashcard;
  lapses: number;
}

export interface CardStats {
  /** Sous-cartes (une par trou, par groupe de masques…). */
  total: number;
  states: CardStateCounts;
  /** Probabilité moyenne de se souvenir aujourd'hui, sur les sous-cartes déjà notées ; null s'il n'y en a pas. */
  retention: number | null;
  /** Sous-cartes déjà notées qui entrent dans la moyenne `retention`. */
  rated: number;
  /** Sous-cartes dues par jour ; le premier jour compte aussi celles en retard. */
  forecast: { date: string; count: number }[];
  /** Cartes oubliées au moins `LEECH_LAPSES` fois, les plus oubliées d'abord. */
  leeches: Leech[];
}

export function computeCardStats(decks: Record<string, Deck>, courseIds: Iterable<string>, now: Date, days = 30): CardStats {
  const today = formatIsoDate(now);
  const states: CardStateCounts = { fresh: 0, learning: 0, young: 0, mature: 0 };
  const byDay = new Array<number>(days).fill(0);
  const lapsesByCard = new Map<string, Leech>();
  let total = 0;
  let rated = 0;
  let sum = 0;
  const ids = [...courseIds];
  const cardsOf = new Map(ids.map((id) => [id, new Map(liveCards(decks[id]).map((c) => [c.id, c]))]));

  subCardItems(decks, ids).forEach((item) => {
    total++;
    const r = decks[item.courseId].review[item.key];
    if (!r || r.state === 0) {
      states.fresh++;
      return;
    }
    if (r.state === 1 || r.state === 3) states.learning++;
    else if (r.scheduledDays >= MATURE_DAYS) states.mature++;
    else states.young++;

    const p = retrievability(r, now);
    if (p !== null) {
      rated++;
      sum += p;
    }

    const index = Math.max(0, diffInDays(formatIsoDate(new Date(r.due)), today));
    if (index < days) byDay[index]++;

    if (r.lapses > 0) {
      const id = `${item.courseId}/${item.cardId}`;
      const prev = lapsesByCard.get(id);
      // Une carte à trous compte son trou le plus oublié
      if (!prev || r.lapses > prev.lapses) {
        const card = cardsOf.get(item.courseId)?.get(item.cardId);
        if (card) lapsesByCard.set(id, { courseId: item.courseId, card, lapses: r.lapses });
      }
    }
  });

  return {
    total,
    states,
    retention: rated > 0 ? sum / rated : null,
    rated,
    forecast: byDay.map((count, i) => ({ date: addDays(today, i), count })),
    leeches: [...lapsesByCard.values()].filter((l) => l.lapses >= LEECH_LAPSES).sort((a, b) => b.lapses - a.lapses),
  };
}
