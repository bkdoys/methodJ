import { describe, expect, it } from 'vitest';
import { Course, RevisionItem } from '../../types';
import {
  applyCascadeShift,
  clearOriginalDates,
  COMMON_J_POOL,
  freezeOriginalDates,
  generateRevisionsForCourse,
  getJPool,
  getSlotDurationMinutes,
  syncCourseRevisions,
} from '../jMethod';

const rev = (courseId: string, jIndex: number, scheduledDate: string, completed = false): RevisionItem => ({
  id: `${courseId}_j${jIndex}`,
  courseId,
  jIndex,
  scheduledDate,
  durationMinutes: 60,
  completed,
  slotOrder: 0,
});

describe('getSlotDurationMinutes', () => {
  it('uses the long slot for J0 and J1 only', () => {
    expect(getSlotDurationMinutes(0)).toBe(90);
    expect(getSlotDurationMinutes(1)).toBe(90);
    expect(getSlotDurationMinutes(2)).toBe(60);
    expect(getSlotDurationMinutes(30)).toBe(60);
  });

  it('honours custom settings', () => {
    const s = { slotDurationJ0J1: 120, slotDurationOthers: 45 };
    expect(getSlotDurationMinutes(1, s)).toBe(120);
    expect(getSlotDurationMinutes(7, s)).toBe(45);
  });
});

describe('generateRevisionsForCourse', () => {
  it('creates one slot per J, sorted, dated from J0', () => {
    const revs = generateRevisionsForCourse('c1', '2026-10-01', [7, 0, 3, 1]);
    expect(revs.map((r) => r.jIndex)).toEqual([0, 1, 3, 7]);
    expect(revs.map((r) => r.scheduledDate)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
      '2026-10-08',
    ]);
    expect(revs.map((r) => r.durationMinutes)).toEqual([90, 90, 60, 60]);
    expect(revs.every((r) => !r.completed && r.courseId === 'c1')).toBe(true);
    expect(revs.map((r) => r.slotOrder)).toEqual([0, 1, 2, 3]);
  });

  it('generates unique ids', () => {
    const revs = generateRevisionsForCourse('c1', '2026-10-01', [0, 1, 3, 7, 15, 30, 60]);
    expect(new Set(revs.map((r) => r.id)).size).toBe(revs.length);
  });
});

describe('applyCascadeShift', () => {
  const base = [
    rev('a', 0, '2026-10-01', true),
    rev('a', 1, '2026-10-02'),
    rev('a', 3, '2026-10-04'),
    rev('a', 7, '2026-10-08'),
    rev('b', 3, '2026-10-04'),
  ];
  const dateOf = (list: RevisionItem[], id: string) => list.find((r) => r.id === id)?.scheduledDate;

  it('shifts the target and all later pending slots of the same course by the same delta', () => {
    const out = applyCascadeShift(base, 'a_j1', '2026-10-05');
    expect(out.deltaDays).toBe(3);
    expect(dateOf(out.updatedRevisions, 'a_j1')).toBe('2026-10-05');
    expect(dateOf(out.updatedRevisions, 'a_j3')).toBe('2026-10-07');
    expect(dateOf(out.updatedRevisions, 'a_j7')).toBe('2026-10-11');
    expect(out.shiftedCount).toBe(2);
    expect(out.shiftedJLabels).toEqual(['J1', 'J3', 'J7']);
  });

  it('leaves earlier slots, completed slots and other courses untouched', () => {
    const out = applyCascadeShift(base, 'a_j1', '2026-10-05');
    expect(dateOf(out.updatedRevisions, 'a_j0')).toBe('2026-10-01');
    expect(dateOf(out.updatedRevisions, 'b_j3')).toBe('2026-10-04');
  });

  it('does not shift completed later slots', () => {
    const list = [rev('a', 1, '2026-10-02'), rev('a', 3, '2026-10-04', true), rev('a', 7, '2026-10-08')];
    const out = applyCascadeShift(list, 'a_j1', '2026-10-03');
    expect(dateOf(out.updatedRevisions, 'a_j3')).toBe('2026-10-04');
    expect(dateOf(out.updatedRevisions, 'a_j7')).toBe('2026-10-09');
  });

  it('moves only the target when cascade is off', () => {
    const out = applyCascadeShift(base, 'a_j1', '2026-10-05', false);
    expect(dateOf(out.updatedRevisions, 'a_j1')).toBe('2026-10-05');
    expect(dateOf(out.updatedRevisions, 'a_j3')).toBe('2026-10-04');
    expect(out.shiftedCount).toBe(0);
  });

  it('supports moving backwards', () => {
    const out = applyCascadeShift(base, 'a_j3', '2026-10-03');
    expect(out.deltaDays).toBe(-1);
    expect(dateOf(out.updatedRevisions, 'a_j7')).toBe('2026-10-07');
  });

  it('is a no-op for an unknown id or an unchanged date', () => {
    expect(applyCascadeShift(base, 'nope', '2026-10-05').updatedRevisions).toBe(base);
    const same = applyCascadeShift(base, 'a_j1', '2026-10-02');
    expect(same.updatedRevisions).toBe(base);
    expect(same.deltaDays).toBe(0);
  });

  it('does not mutate its input', () => {
    const snapshot = JSON.stringify(base);
    applyCascadeShift(base, 'a_j1', '2026-10-09');
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('syncCourseRevisions', () => {
  const course = { id: 'a', j0Date: '2026-10-01' } as Course;
  const existing = [rev('a', 0, '2026-10-01', true), rev('a', 3, '2026-10-06'), rev('b', 1, '2026-10-02')];

  it('keeps existing slots (and their state), adds missing J, drops removed J', () => {
    const out = syncCourseRevisions(course, existing, [0, 7]);
    const mine = out.filter((r) => r.courseId === 'a');
    expect(mine.map((r) => r.jIndex).sort((x, y) => x - y)).toEqual([0, 7]);
    expect(mine.find((r) => r.jIndex === 0)?.completed).toBe(true);
    // J3 removed, J7 created from the course J0 (not from a shifted slot)
    expect(mine.find((r) => r.jIndex === 7)?.scheduledDate).toBe('2026-10-08');
  });

  it('never touches other courses', () => {
    const out = syncCourseRevisions(course, existing, [0]);
    expect(out.filter((r) => r.courseId === 'b')).toEqual([existing[2]]);
  });
});

describe('getJPool', () => {
  it('falls back to the built-in list when settings have none', () => {
    expect(getJPool({})).toEqual(COMMON_J_POOL);
  });

  it('uses the custom list, sorted, deduplicated, always with J0 and without invalid values', () => {
    expect(getJPool({ jPool: [30, 7, 120, 7, -2, 1.5, 999] })).toEqual([0, 7, 30, 120]);
  });
});

describe('getSlotDurationMinutes with per-J settings', () => {
  it('keeps the historical 90/60 minutes without any setting', () => {
    expect(getSlotDurationMinutes(0)).toBe(90);
    expect(getSlotDurationMinutes(1)).toBe(90);
    expect(getSlotDurationMinutes(30)).toBe(60);
  });

  it('uses the default duration, overridden per J', () => {
    const settings = { slotDurationDefault: 60, slotDurationByJ: { '0': 90, '15': 45 } };
    expect(getSlotDurationMinutes(0, settings)).toBe(90);
    expect(getSlotDurationMinutes(15, settings)).toBe(45);
    expect(getSlotDurationMinutes(1, settings)).toBe(60); // plus d'exception implicite pour J1
    expect(getSlotDurationMinutes(7, settings)).toBe(60);
  });

  it('ignores invalid overrides', () => {
    expect(getSlotDurationMinutes(7, { slotDurationDefault: 50, slotDurationByJ: { '7': 0 } })).toBe(50);
  });
});

describe('original dates', () => {
  const course = { id: 'a', j0Date: '2026-10-01' } as Course;

  it('freezes the planned date of every J but J0, once, for that course only', () => {
    const all = [rev('a', 0, '2026-10-01', true), rev('a', 1, '2026-10-03'), { ...rev('a', 3, '2026-10-04'), originalDate: '2026-10-02' }, rev('b', 1, '2026-10-05')];
    const frozen = freezeOriginalDates(all, 'a');
    expect(frozen.map((r) => [r.jIndex, r.originalDate])).toEqual([[1, '2026-10-03']]); // J0, déjà figé et autre cours : intacts
    expect(frozen[0].scheduledDate).toBe('2026-10-03');
  });

  it('clears them when the J0 is undone', () => {
    const all = [{ ...rev('a', 1, '2026-10-03'), originalDate: '2026-10-02' }, rev('a', 3, '2026-10-04'), { ...rev('b', 1, '2026-10-05'), originalDate: '2026-10-05' }];
    const cleared = clearOriginalDates(all, 'a');
    expect(cleared).toHaveLength(1);
    expect('originalDate' in cleared[0]).toBe(false);
  });

  it('a J added after the J0 is done is tracked from its creation, otherwise not', () => {
    const withJ0Done = syncCourseRevisions(course, [rev('a', 0, '2026-10-01', true)], [0, 7]);
    expect(withJ0Done.find((r) => r.jIndex === 7)?.originalDate).toBe('2026-10-08');
    expect(withJ0Done.find((r) => r.jIndex === 0)?.originalDate).toBeUndefined();
    const before = syncCourseRevisions(course, [rev('a', 0, '2026-10-01')], [0, 7]);
    expect(before.find((r) => r.jIndex === 7)?.originalDate).toBeUndefined();
  });
});
