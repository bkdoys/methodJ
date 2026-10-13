import { describe, expect, it } from 'vitest';
import { CardReview } from '../../types';
import { addEntry, entryFromReview, entryId, mergeLogDays, parseEntries, removeEntry, ReviewEntry, ReviewLog, sameLogDay } from '../reviewLog';
import { computeReviewLogStats } from '../reviewLogStats';
import { gradeCard } from '../srs';

const e = (t: string, k: string, g: 1 | 2 | 3 | 4 = 3, s: 0 | 1 | 2 | 3 = 2, c = 'c1'): ReviewEntry => ({ t, c, k, g, s });
// Heure de midi locale : le jour local est le même quel que soit le fuseau du poste
const at = (day: string, hh = '12:00:00') => new Date(`${day}T${hh}`).toISOString();

describe('review log', () => {
  it('derives an entry from the review a grade produced', () => {
    const now = new Date(at('2026-10-13'));
    const before = gradeCard(undefined, 3, new Date(at('2026-10-10')));
    const after = gradeCard(before, 4, now);
    expect(entryFromReview('c1', 'k1', after, 4, before)).toEqual({ t: now.toISOString(), c: 'c1', k: 'k1', g: 4, s: before.state });
    expect(entryFromReview('c1', 'k1', after, 4)!.s).toBe(0); // carte jamais vue
    expect(entryFromReview('c1', 'k1', { ...after, lastReview: undefined } as CardReview, 4)).toBeNull();
  });

  it('adds by local day, ignores a duplicate, and removes an undone entry', () => {
    const a = e(at('2026-10-13', '09:00:00'), 'k1');
    const b = e(at('2026-10-13', '09:05:00'), 'k2');
    let log: ReviewLog = addEntry({}, b);
    log = addEntry(log, a);
    expect(Object.keys(log)).toEqual(['2026-10-13']);
    expect(log['2026-10-13'].entries.map((x) => x.k)).toEqual(['k1', 'k2']); // ordre chronologique
    expect(addEntry(log, a)).toBe(log);
    const without = removeEntry(log, a);
    expect(without['2026-10-13'].entries.map((x) => x.k)).toEqual(['k2']);
    expect(removeEntry(without, b)).toEqual({}); // jour vidé
    expect(removeEntry(log, e(at('2026-10-14'), 'k9'))).toBe(log);
  });

  it('merges two devices by union, independent of the order', () => {
    const d1 = { id: '2026-10-13', entries: [e(at('2026-10-13', '08:00:00'), 'k1'), e(at('2026-10-13', '08:01:00'), 'k2')] };
    const d2 = { id: '2026-10-13', entries: [e(at('2026-10-13', '08:01:00'), 'k2'), e(at('2026-10-13', '20:00:00'), 'k3')] };
    const m = mergeLogDays(d1, d2);
    expect(m.entries.map((x) => x.k)).toEqual(['k1', 'k2', 'k3']);
    expect(sameLogDay(m, mergeLogDays(d2, d1))).toBe(true);
    expect(entryId(m.entries[0])).toContain('k1');
  });

  it('keeps only well-formed entries from the cloud', () => {
    expect(parseEntries('nope')).toEqual([]);
    expect(parseEntries([e('2026-10-13T08:00:00.000Z', 'k1'), { t: 1 }, null, { ...e('x', 'k'), g: 9 }])).toHaveLength(1);
  });
});

describe('computeReviewLogStats', () => {
  const TODAY = '2026-10-13';
  const log = (): ReviewLog => {
    let l: ReviewLog = {};
    // Aujourd'hui : 3 notes ; hier : 2 ; il y a 40 jours : 1 (hors fenêtre de 30 jours mais dans le total)
    [
      e(at('2026-10-13', '08:00:00'), 'a', 3, 2),
      e(at('2026-10-13', '08:01:00'), 'b', 1, 2),
      e(at('2026-10-13', '08:02:00'), 'c', 3, 0),
      e(at('2026-10-12', '08:00:00'), 'a', 4, 2),
      e(at('2026-10-12', '08:01:00'), 'd', 2, 1),
      e(at('2026-09-03', '08:00:00'), 'a', 3, 2),
    ].forEach((x) => (l = addEntry(l, x)));
    return l;
  };

  it('counts per day, streak, grades and the real retention on review cards only', () => {
    const s = computeReviewLogStats(log(), TODAY);
    expect(s.total).toBe(6);
    expect(s.perDay).toHaveLength(30);
    expect(s.perDay[29]).toEqual({ date: TODAY, count: 3 });
    expect(s.perDay[28].count).toBe(2);
    expect(s.activeDays).toBe(2);
    expect(s.avgPerActiveDay).toBe(3); // 5 notes sur 2 jours = 2,5 -> 3
    expect(s.streak).toBe(2);
    expect(s.grades).toEqual({ 1: 1, 2: 1, 3: 2, 4: 1 });
    // État 2 dans la fenêtre : a(3), b(1), a(4) -> 2 sur 3
    expect(s.retentionBase).toBe(3);
    expect(s.trueRetention).toBeCloseTo(2 / 3);
  });

  it('a streak survives a day not yet done, and is empty without data', () => {
    let l: ReviewLog = {};
    l = addEntry(l, e(at('2026-10-12'), 'a'));
    l = addEntry(l, e(at('2026-10-11'), 'a'));
    expect(computeReviewLogStats(l, TODAY).streak).toBe(2);
    const empty = computeReviewLogStats({}, TODAY);
    expect(empty).toMatchObject({ total: 0, streak: 0, trueRetention: null, retentionBase: 0 });
  });
});
