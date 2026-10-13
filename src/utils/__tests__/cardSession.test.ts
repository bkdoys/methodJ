import { describe, expect, it } from 'vitest';
import { CardReview, Deck } from '../../types';
import { addCard, emptyDeck } from '../flashcards';
import { answer, courseCardCounts, currentItem, dueToday, getNewCardsPerDay, newCardsRoom, shuffle, startSession, subCardItems, summarize } from '../cardSession';
import { gradeCard, intervalParts, isShortTerm, previewIntervals } from '../srs';

const NOW = new Date('2026-10-13T08:00:00.000Z');
const T0 = '2026-10-01T10:00:00.000Z';

function deck(): Deck {
  let d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r' }, T0, 'k1');
  d = addCard(d, { kind: 'cloze', front: '{{c1::a}} {{c2::b}}' }, T0, 'k2');
  return d;
}

describe('srs', () => {
  it('keeps a failed new card in the session and spaces a good one more', () => {
    const again = gradeCard(undefined, 1, NOW);
    expect(isShortTerm(again, NOW)).toBe(true);
    expect(again.firstReview).toBe('2026-10-13');
    expect(again.reps).toBe(1);

    const p = previewIntervals(undefined, NOW);
    expect(p[1]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThanOrEqual(p[4]);
  });

  it('grows the interval with repeated good answers', () => {
    let r: CardReview | undefined;
    let t = NOW;
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      r = gradeCard(r, 3, t);
      const next = new Date(r.due);
      gaps.push(next.getTime() - t.getTime());
      t = next;
    }
    expect(r!.state).toBe(2);
    expect(gaps[4]).toBeGreaterThan(gaps[2]);
    expect(gaps[4]).toBeGreaterThan(3 * 86_400_000);
    // un oubli renvoie la carte à court terme
    const lapse = gradeCard(r, 1, t);
    expect(lapse.lapses).toBe(1);
    expect(isShortTerm(lapse, t)).toBe(true);
  });

  it('formats intervals', () => {
    expect(intervalParts(60_000)).toEqual({ n: '1', unit: 'min' });
    expect(intervalParts(10 * 60_000)).toEqual({ n: '10', unit: 'min' });
    expect(intervalParts(3 * 3_600_000)).toEqual({ n: '3', unit: 'h' });
    expect(intervalParts(8 * 86_400_000)).toEqual({ n: '8', unit: 'd' });
    expect(intervalParts(60 * 86_400_000)).toEqual({ n: '2', unit: 'mo' });
    expect(intervalParts(548 * 86_400_000)).toEqual({ n: '1.5', unit: 'y' });
  });
});

describe('cardSession', () => {
  it('lists one item per gap', () => {
    expect(subCardItems({ c1: deck() }, ['c1', 'missing']).map((i) => i.key)).toEqual(['k1', 'k2:c1', 'k2:c2']);
  });

  it('lists one item per mask group of an occlusion card', () => {
    const now = '2026-10-01T10:00:00.000Z';
    const masks = [
      { id: 'a', x: 0, y: 0, w: 0.1, h: 0.1, group: 3 },
      { id: 'b', x: 0.2, y: 0, w: 0.1, h: 0.1, group: 1 },
      { id: 'c', x: 0.4, y: 0, w: 0.1, h: 0.1, group: 3 },
    ];
    const d: Deck = {
      id: 'c1',
      cards: [{ id: 'k9', kind: 'occlusion', front: '', frontImage: 'f'.repeat(64), masks, createdAt: now, updatedAt: now }],
      review: {},
    };
    expect(subCardItems({ c1: d }, ['c1']).map((i) => [i.key, i.mask])).toEqual([['k9:m1', 1], ['k9:m3', 3]]);
  });

  it('shuffles reproducibly', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(list, 7)).toEqual(shuffle(list, 7));
    expect(shuffle(list, 7)).not.toEqual(list);
    expect([...shuffle(list, 7)].sort((a, b) => a - b)).toEqual(list);
  });

  it('takes due cards first, then new ones within the daily limit', () => {
    const d = deck();
    d.review = {
      k1: { ...gradeCard(undefined, 3, new Date('2026-10-01T08:00:00Z')), due: '2026-10-10T00:00:00.000Z' },
      'k2:c1': { ...gradeCard(undefined, 3, NOW), due: '2026-10-20T00:00:00.000Z' },
    };
    const s = dueToday({ c1: d }, ['c1'], NOW, '2026-10-13', 2);
    expect(s.due.map((i) => i.key)).toEqual(['k1']);
    // k2:c1 a été commencée aujourd'hui : elle compte dans la limite de 2
    expect(s.fresh.map((i) => i.key)).toEqual(['k2:c2']);
    expect(dueToday({ c1: d }, ['c1'], NOW, '2026-10-13', 1).fresh).toEqual([]);
    expect(s.freshTotal).toBe(1);
  });

  it('counts cards per course and the room left for new ones', () => {
    const d = deck();
    d.review = { k1: { ...gradeCard(undefined, 3, NOW), due: '2026-10-10T00:00:00.000Z' } };
    expect(courseCardCounts({ c1: d, c2: emptyDeck('c2') }, NOW)).toEqual({ c1: { total: 3, due: 1, fresh: 2 } });
    expect(newCardsRoom({ c1: d }, '2026-10-13', 20)).toBe(19);
    expect(newCardsRoom({ c1: d }, '2026-10-14', 20)).toBe(20);
    expect(getNewCardsPerDay({})).toBe(20);
    expect(getNewCardsPerDay({ cardsNewPerDay: 0 })).toBe(0);
  });

  it('brings a failed card back a few cards later and sums up first answers', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ courseId: 'c', cardId: `k${i}`, key: `k${i}` }));
    let s = startSession(items);
    s = answer(s, 1, true); // k0 ratée : revient après 4 cartes
    expect(s.queue.map((i) => i.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k0', 'k5']);
    for (let i = 0; i < 4; i++) s = answer(s, 3, false);
    expect(currentItem(s)?.key).toBe('k0');
    s = answer(s, 3, false);
    s = answer(s, 4, false);
    expect(currentItem(s)).toBeUndefined();
    expect(summarize(s)).toEqual({ cards: 6, byGrade: { 1: 1, 2: 0, 3: 4, 4: 1 }, success: 83 });
  });

  it('puts a failed card at the end when few remain', () => {
    let s = startSession([{ courseId: 'c', cardId: 'a', key: 'a' }]);
    s = answer(s, 1, true);
    expect(currentItem(s)?.key).toBe('a');
  });
});
