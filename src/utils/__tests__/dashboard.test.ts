import { describe, expect, it } from 'vitest';
import { Course, RevisionItem } from '../../types';
import { computeDashboard, countAlerts, findIdleCourses } from '../dashboard';

const course: Course = {
  id: 'c1', title: 'Cours', itemCode: 'X', subjectId: 's1', j0Date: '2026-10-01',
  activeJList: [0, 1], mastery: 0, createdAt: '2026-10-01',
};
const rev = (id: string, date: string, over: Partial<RevisionItem> = {}): RevisionItem => ({
  id, courseId: 'c1', jIndex: 0, scheduledDate: date, durationMinutes: 60, completed: false, slotOrder: 0, ...over,
});
const today = '2026-10-12';

describe('computeDashboard', () => {
  it('builds the day view and picks the next pending slot', () => {
    const revs = [
      rev('late', '2026-10-10'),
      rev('a', today, { slotOrder: 1, durationMinutes: 90 }),
      rev('b', today, { slotOrder: 0, completed: true, durationMinutes: 30 }),
      rev('later', '2026-10-14'),
    ];
    const d = computeDashboard([course], revs, today);
    expect(d.stats.overdue.map((r) => r.id)).toEqual(['late']);
    expect(d.today.map((r) => r.id)).toEqual(['b', 'a']);
    expect(d.todayPending.map((r) => r.id)).toEqual(['a']);
    expect(d.todayMinutes).toBe(120);
    expect(d.todayDoneMinutes).toBe(30);
    expect(d.next?.id).toBe('a');
  });

  it('skips today when everything is done and looks ahead; none when nothing is left', () => {
    const doneToday = [rev('a', today, { completed: true }), rev('later', '2026-10-14')];
    expect(computeDashboard([course], doneToday, today).next?.id).toBe('later');
    expect(computeDashboard([course], [rev('a', today, { completed: true })], today).next).toBeUndefined();
  });
});

describe('countAlerts', () => {
  it('counts only what needs an action', () => {
    expect(countAlerts({ overdue: 3, syncConflict: false })).toBe(3);
    expect(countAlerts({ overdue: 0, syncConflict: true, overloadedDays: 2 })).toBe(3);
    expect(countAlerts({ overdue: 0, syncConflict: false })).toBe(0);
  });
});

describe('findIdleCourses', () => {
  const c = (id: string): Course => ({ ...course, id, title: id });

  it('lists courses with nothing left to do, most recently finished first', () => {
    const courses = [c('old'), c('recent'), c('open'), c('late'), c('empty')];
    const revs = [
      rev('o1', '2026-09-01', { courseId: 'old', completed: true }),
      rev('r1', '2026-10-05', { courseId: 'recent', completed: true }),
      rev('p1', '2026-10-20', { courseId: 'open' }), // reste un créneau à venir
      rev('l1', '2026-10-01', { courseId: 'late' }), // un retard compte comme « à faire » : pas de carte ici
    ];
    expect(findIdleCourses(courses, revs).map((x) => x.id)).toEqual(['recent', 'old', 'empty']);
  });

  it('is exposed by computeDashboard', () => {
    const d = computeDashboard([c('a')], [rev('x', '2026-10-01', { courseId: 'a', completed: true })], today);
    expect(d.idleCourses.map((x) => x.id)).toEqual(['a']);
  });
});
