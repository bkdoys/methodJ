import { describe, expect, it } from 'vitest';
import { CardReview, Deck } from '../../types';
import { addCard, emptyDeck } from '../flashcards';
import { computeCardStats, LEECH_LAPSES } from '../cardStats';
import { retrievability } from '../srs';

const NOW = new Date('2026-10-13T08:00:00.000Z');
const T0 = '2026-10-01T10:00:00.000Z';

const review = (extra: Partial<CardReview>): CardReview => ({
  due: '2026-10-20T08:00:00.000Z',
  stability: 10,
  difficulty: 5,
  reps: 3,
  lapses: 0,
  state: 2,
  scheduledDays: 7,
  step: 0,
  lastReview: '2026-10-13T08:00:00.000Z',
  ...extra,
});

function deck(): Deck {
  let d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q1', back: 'r' }, T0, 'k1');
  d = addCard(d, { kind: 'basic', front: 'q2', back: 'r' }, T0, 'k2');
  d = addCard(d, { kind: 'cloze', front: '{{c1::a}} {{c2::b}}' }, T0, 'k3');
  d = addCard(d, { kind: 'basic', front: 'q4', back: 'r' }, T0, 'k4');
  return {
    ...d,
    review: {
      k1: review({ scheduledDays: 30, due: '2026-12-01T08:00:00.000Z' }), // mûre, hors horizon
      k2: review({ state: 3, lapses: LEECH_LAPSES + 1, due: '2026-10-10T08:00:00.000Z' }), // en retard
      'k3:c1': review({ lapses: 2 }),
      'k3:c2': review({ lapses: LEECH_LAPSES }),
      // k4 : nouvelle
    },
  };
}

describe('retrievability', () => {
  it('is 1 right after a review and decreases with time; null for a new card', () => {
    expect(retrievability(undefined, NOW)).toBeNull();
    const r = review({ lastReview: NOW.toISOString() });
    expect(retrievability(r, NOW)).toBeCloseTo(1);
    const later = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(retrievability(r, later)!).toBeLessThan(0.9);
  });
});

describe('computeCardStats', () => {
  it('counts sub-cards by state, forecasts due cards and lists leeches', () => {
    const s = computeCardStats({ c1: deck() }, ['c1'], NOW);
    expect(s.total).toBe(5);
    expect(s.states).toEqual({ fresh: 1, learning: 1, young: 2, mature: 1 });
    expect(s.rated).toBe(4);
    expect(s.retention).toBeCloseTo(1);
    expect(s.forecast).toHaveLength(30);
    expect(s.forecast[0]).toEqual({ date: '2026-10-13', count: 1 }); // la carte en retard
    expect(s.forecast[7].count).toBe(2); // les deux trous du 20
    expect(s.forecast.reduce((a, d) => a + d.count, 0)).toBe(3);
    expect(s.leeches.map((l) => [l.card.id, l.lapses])).toEqual([
      ['k2', LEECH_LAPSES + 1],
      ['k3', LEECH_LAPSES],
    ]);
  });

  it('ignores courses outside the list', () => {
    expect(computeCardStats({ c1: deck() }, [], NOW).total).toBe(0);
  });
});
