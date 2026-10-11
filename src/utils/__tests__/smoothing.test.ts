import { describe, expect, it } from 'vitest';
import { AppSettings, RevisionItem } from '../../types';
import { DEFAULT_SETTINGS } from '../seedData';
import { addDays } from '../dateUtils';
import { analyzeDays } from '../dayLoad';
import { applyCascadeShift } from '../jMethod';
import { isMoveSafe, maxDelayDays, movesOf, planCatchUp, planSmoothing, selectMoves } from '../smoothing';

const today = '2026-10-12';
let n = 0;
const rev = (courseId: string, jIndex: number, date: string, over: Partial<RevisionItem> = {}): RevisionItem => ({
  id: `r${++n}`, courseId, jIndex, scheduledDate: date, durationMinutes: 60, completed: false, slotOrder: n, ...over,
});
// Plage 08:00-12:00 tous les jours (4 h), objectif 3 h par jour
const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  dailyTargetHours: 3,
  dayStartTime: '08:00',
  timelineStartHour: 7,
  timelineEndHour: 23,
  dayWindows: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { start: '08:00', end: '12:00' }])),
  breaks: {},
  forcedDates: [],
};

/** Exécute un plan sur une copie, comme le fait l'application. */
function execute(revs: RevisionItem[], moves: { revisionId: string; toDate: string }[], cascade = true) {
  return moves.reduce((acc, m) => applyCascadeShift(acc, m.revisionId, m.toDate, cascade).updatedRevisions, revs);
}
const alertDates = (revs: RevisionItem[]) => analyzeDays(revs, settings, today).filter((d) => d.alert).map((d) => d.date);

describe('maxDelayDays', () => {
  it('tolerates a longer delay for a higher J', () => {
    expect([0, 1, 3, 7, 30].map(maxDelayDays)).toEqual([1, 1, 2, 3, 3]);
  });
});

describe('planSmoothing', () => {
  it('moves high-J slots off an overloaded day without creating a new problem', () => {
    const revs = [
      rev('a', 0, today), rev('b', 1, today), rev('c', 3, today), rev('d', 7, today), rev('e', 15, today), // 5 h > 3 h
    ];
    const plan = planSmoothing(revs, settings, today);
    expect(plan.unresolved).toEqual([]);
    expect(plan.proposals.length).toBeGreaterThan(0);
    // les J élevés partent d'abord
    expect(plan.proposals[0].jIndex).toBe(15);
    const after = execute(revs, movesOf(plan));
    expect(alertDates(after)).toEqual([]);
  });

  it('never moves a completed slot', () => {
    const revs = [
      rev('a', 15, today, { completed: true }), rev('b', 7, today, { completed: true }), rev('c', 3, today),
      rev('d', 1, today), rev('e', 0, today),
    ];
    const plan = planSmoothing(revs, settings, today);
    const done = new Set(revs.filter((r) => r.completed).map((r) => r.id));
    expect(plan.proposals.some((p) => done.has(p.revisionId))).toBe(false);
  });

  it('resolves slots stacked outside the working window', () => {
    // 4 créneaux d'1 h = pile la plage, + 1 : un créneau déborde
    const revs = [0, 1, 2, 3, 4].map((i) => rev(`c${i}`, 7, today, { slotOrder: i }));
    expect(alertDates(revs)).toEqual([today]);
    const plan = planSmoothing(revs, settings, today);
    expect(alertDates(execute(revs, movesOf(plan)))).toEqual([]);
  });

  it('says so when nothing simple works (next days are full) and proposes nothing harmful', () => {
    const revs = [
      ...[0, 1, 2, 3].map((i) => rev(`m${i}`, 7, today, { slotOrder: i })), // jour chargé
      ...[1, 2, 3].flatMap((d) => [0, 1, 2].map((i) => rev(`f${d}${i}`, 0, addDays(today, d), { slotOrder: i }))), // jours suivants pleins (3 h)
    ];
    const plan = planSmoothing(revs, settings, today);
    expect(plan.proposals).toEqual([]);
    expect(plan.unresolved).toEqual([{ kind: 'smooth', date: today }]);
  });

  it('respects the tolerance: a J1 is never pushed more than one day', () => {
    const revs = [
      ...[0, 1, 2, 3].map((i) => rev(`m${i}`, 1, today, { slotOrder: i })),
      ...[0, 1, 2].map((i) => rev(`n${i}`, 0, addDays(today, 1), { slotOrder: i })), // le lendemain est plein
    ];
    const plan = planSmoothing(revs, settings, today);
    expect(plan.proposals).toEqual([]); // J+2 serait libre mais dépasse la tolérance d'un J1
    expect(plan.unresolved).toHaveLength(1);
  });

  it('counts the cascade and refuses a move whose cascade overloads another day', () => {
    const c = 'course';
    const revs = [
      rev(c, 3, today), rev('x1', 7, today), rev('x2', 7, today), rev('x3', 7, today),
      rev(c, 7, addDays(today, 2)),
    ];
    const plan = planSmoothing(revs, settings, today);
    plan.proposals.forEach((p) => expect(p.cascade.every((s) => s.fromDate < s.toDate)).toBe(true));
    expect(alertDates(execute(revs, movesOf(plan)))).toEqual([]);
  });

  it('is empty when nothing needs attention', () => {
    expect(planSmoothing([rev('a', 7, today)], settings, today)).toEqual({ proposals: [], unresolved: [] });
  });
});

describe('planCatchUp', () => {
  it('puts an overdue slot on the first day with room', () => {
    const revs = [
      rev('a', 3, addDays(today, -5)),
      ...[0, 1, 2].map((i) => rev(`t${i}`, 0, today, { slotOrder: i })), // aujourd'hui est plein (3 h)
    ];
    const plan = planCatchUp(revs, settings, today);
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0]).toMatchObject({ kind: 'catchup', fromDate: addDays(today, -5), toDate: addDays(today, 1) });
  });

  it('does not propose a second time a slot already moved by the cascade', () => {
    const c = 'course';
    const revs = [rev(c, 3, addDays(today, -7)), rev(c, 7, addDays(today, -3))];
    const plan = planCatchUp(revs, settings, today);
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0].cascade).toHaveLength(1);
    expect(plan.unresolved).toEqual([]);
  });

  it('handles each overdue slot on its own when the cascade is off', () => {
    const c = 'course';
    const revs = [rev(c, 3, addDays(today, -7)), rev(c, 7, addDays(today, -3))];
    const plan = planCatchUp(revs, { ...settings, autoCascadeShift: false }, today);
    expect(plan.proposals).toHaveLength(2);
  });

  it('says so when no day is free within the horizon', () => {
    const full = Array.from({ length: 16 }, (_, d) => [0, 1, 2].map((i) => rev(`f${d}${i}`, 0, addDays(today, d), { slotOrder: i }))).flat();
    const plan = planCatchUp([rev('a', 3, addDays(today, -2)), ...full], settings, today);
    expect(plan.proposals).toEqual([]);
    expect(plan.unresolved).toHaveLength(1);
    expect(plan.unresolved[0]).toMatchObject({ kind: 'catchup', jIndex: 3 });
  });

  it('accepts a move whose cascade leaves an already overloaded day, as long as nothing gets worse', () => {
    const c = 'course';
    // Le J3 du cours est un jour déjà chargé (5 h > 3 h) ; le J1 en retard le fait partir en cascade
    const revs = [
      rev(c, 1, addDays(today, -2)),
      rev(c, 3, addDays(today, 2)),
      ...[0, 1, 2, 3].map((i) => rev(`o${i}`, 0, addDays(today, 2), { slotOrder: i })),
    ];
    const plan = planCatchUp(revs, settings, today);
    expect(plan.unresolved).toEqual([]);
    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0].cascade).toHaveLength(1);
  });

  it('is empty when nothing is overdue', () => {
    expect(planCatchUp([rev('a', 3, today)], settings, today)).toEqual({ proposals: [], unresolved: [] });
  });
});

describe('partial acceptance', () => {
  const busy = () => [rev('a', 0, today), rev('b', 1, today), rev('c', 3, today), rev('d', 7, today), rev('e', 15, today)];

  it('applies every move when everything is checked', () => {
    const revs = busy();
    const plan = planSmoothing(revs, settings, today);
    const { moves, blocked } = selectMoves('smooth', plan.proposals, () => true, revs, settings, today);
    expect(moves).toEqual(movesOf(plan));
    expect(blocked.size).toBe(0);
    expect(alertDates(execute(revs, moves))).toEqual([]);
  });

  it('applies only the checked moves, and the count follows', () => {
    const revs = busy();
    const plan = planSmoothing(revs, settings, today);
    const skipped = plan.proposals[0].revisionId;
    const { moves } = selectMoves('smooth', plan.proposals, (id) => id !== skipped, revs, settings, today);
    expect(moves.length).toBeLessThan(plan.proposals.length);
    expect(moves.some((m) => m.revisionId === skipped)).toBe(false);
    expect(selectMoves('smooth', plan.proposals, () => false, revs, settings, today).moves).toEqual([]);
  });

  it('blocks a checked move that relied on an unchecked one (a cascade freeing room)', () => {
    // Aujourd'hui : 5 h. Le J3 du cours C part d'un jour et fait partir en cascade son J7, qui libère de la place le jour B
    const cj3 = rev('C', 3, today, { slotOrder: 0 });
    const z = rev('Z', 7, today, { slotOrder: 1 });
    const cj7 = rev('C', 7, addDays(today, 2), { slotOrder: 0 });
    const revs = [
      cj3, z, ...[0, 1, 2].map((i) => rev(`a${i}`, 7, today, { slotOrder: i + 2 })),
      cj7, ...[0, 1].map((i) => rev(`b${i}`, 7, addDays(today, 2), { slotOrder: i + 1 })), // jour B : 3 h, pile l'objectif
    ];
    const proposals = [
      { kind: 'smooth' as const, revisionId: cj3.id, courseId: 'C', jIndex: 3, fromDate: today, toDate: addDays(today, 1), cascade: [] },
      { kind: 'smooth' as const, revisionId: z.id, courseId: 'Z', jIndex: 7, fromDate: today, toDate: addDays(today, 2), cascade: [] },
    ];
    // z seul ferait passer le jour B à 4 h : refusé ; avec le déplacement de cj3, la cascade libère cj7 et il passe
    expect(isMoveSafe('smooth', revs, settings, today, z.id, addDays(today, 2))).toBe(false);
    const without = selectMoves('smooth', proposals, (id) => id !== cj3.id, revs, settings, today);
    expect(without.moves).toEqual([]);
    expect(without.blocked.has(z.id)).toBe(true);
    const both = selectMoves('smooth', proposals, () => true, revs, settings, today);
    expect(both.moves.map((m) => m.revisionId)).toEqual([cj3.id, z.id]);
    expect(both.blocked.size).toBe(0);
  });

  it('keeps every move of a plan safe when applied one by one in order', () => {
    const revs = busy();
    const plan = planSmoothing(revs, settings, today);
    let state = revs;
    plan.proposals.forEach((p) => {
      expect(isMoveSafe('smooth', state, settings, today, p.revisionId, p.toDate)).toBe(true);
      state = execute(state, [{ revisionId: p.revisionId, toDate: p.toDate }]);
    });
    expect(alertDates(state)).toEqual([]);
  });

  it('refuses a move that is not safe or no longer applicable', () => {
    const revs = busy();
    const done = revs.map((r) => (r.jIndex === 15 ? { ...r, completed: true } : r));
    expect(isMoveSafe('smooth', done, settings, today, revs[4].id, addDays(today, 1))).toBe(false);
    expect(isMoveSafe('smooth', revs, settings, today, 'inconnu', addDays(today, 1))).toBe(false);
    expect(isMoveSafe('smooth', revs, settings, today, revs[0].id, today)).toBe(false);
    const fullDay = [...revs, ...[0, 1, 2].map((i) => rev(`f${i}`, 0, addDays(today, 1), { slotOrder: i }))];
    expect(isMoveSafe('smooth', fullDay, settings, today, revs[4].id, addDays(today, 1))).toBe(false);
  });
});
