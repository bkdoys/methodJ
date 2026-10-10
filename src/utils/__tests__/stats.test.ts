import { describe, expect, it } from 'vitest';
import { Course, MasteryLevel, RevisionItem } from '../../types';
import { computeStudyStats } from '../stats';

const TODAY = '2026-10-10';

const course = (id: string, mastery: MasteryLevel = 2): Course => ({
  id,
  title: `Cours ${id}`,
  itemCode: id,
  subjectId: 's',
  j0Date: '2026-10-01',
  activeJList: [0],
  mastery,
  createdAt: '2026-10-01',
});

let n = 0;
const rev = (courseId: string, jIndex: number, scheduledDate: string, extra: Partial<RevisionItem> = {}): RevisionItem => ({
  id: `r${++n}`,
  courseId,
  jIndex,
  scheduledDate,
  durationMinutes: 60,
  completed: false,
  slotOrder: 0,
  ...extra,
});

const done = (courseId: string, jIndex: number, scheduledDate: string, completedDate: string, rating?: MasteryLevel) =>
  rev(courseId, jIndex, scheduledDate, { completed: true, completedDate, rating });

describe('computeStudyStats: overdue and upcoming', () => {
  it('separates overdue, today and the next 7 days (completed slots excluded)', () => {
    const stats = computeStudyStats(
      [course('a')],
      [
        rev('a', 1, '2026-10-08'), // overdue
        rev('a', 3, '2026-10-10'), // today
        rev('a', 7, '2026-10-12'), // upcoming
        rev('a', 15, '2026-10-17'), // upcoming (last day)
        rev('a', 30, '2026-10-18'), // beyond 7 days
        done('a', 0, '2026-10-05', '2026-10-05'),
      ],
      TODAY
    );
    expect(stats.overdue).toHaveLength(1);
    expect(stats.dueToday).toHaveLength(1);
    expect(stats.upcoming7Days).toBe(2);
  });

  it('counts overdue slots in today\'s load of the 14-day forecast', () => {
    const stats = computeStudyStats(
      [course('a')],
      [rev('a', 1, '2026-10-08'), rev('a', 3, '2026-10-10'), rev('a', 7, '2026-10-11')],
      TODAY
    );
    expect(stats.next14).toHaveLength(14);
    expect(stats.next14[0]).toMatchObject({ date: TODAY, count: 2, minutes: 120 });
    expect(stats.next14[1]).toMatchObject({ date: '2026-10-11', count: 1, minutes: 60 });
  });
});

describe('computeStudyStats: streak', () => {
  it('counts consecutive days ending today', () => {
    const revs = ['2026-10-08', '2026-10-09', '2026-10-10'].map((d) => done('a', 1, d, d));
    expect(computeStudyStats([course('a')], revs, TODAY).streak).toBe(3);
  });

  it('keeps the streak alive when today is not done yet', () => {
    const revs = ['2026-10-08', '2026-10-09'].map((d) => done('a', 1, d, d));
    expect(computeStudyStats([course('a')], revs, TODAY).streak).toBe(2);
  });

  it('resets after a missed day, and tracks the best streak', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-07'];
    const stats = computeStudyStats([course('a')], days.map((d) => done('a', 1, d, d)), TODAY);
    expect(stats.streak).toBe(0);
    expect(stats.bestStreak).toBe(4);
  });

  it('is zero with no activity', () => {
    const stats = computeStudyStats([course('a')], [], TODAY);
    expect(stats).toMatchObject({ streak: 0, bestStreak: 0, onTimeRate: null, avgRating: null });
  });
});

describe('computeStudyStats: punctuality and activity', () => {
  it('computes the on-time rate (done on or before the scheduled date)', () => {
    const stats = computeStudyStats(
      [course('a')],
      [
        done('a', 0, '2026-10-05', '2026-10-05'),
        done('a', 1, '2026-10-06', '2026-10-04'),
        done('a', 3, '2026-10-07', '2026-10-09'),
        done('a', 7, '2026-10-08', '2026-10-08'),
      ],
      TODAY
    );
    expect(stats.onTimeRate).toBe(75);
  });

  it('aggregates minutes per day over the last 30 days', () => {
    const stats = computeStudyStats(
      [course('a')],
      [done('a', 0, '2026-10-09', '2026-10-09'), done('a', 1, '2026-10-09', '2026-10-09')],
      TODAY
    );
    expect(stats.last30).toHaveLength(30);
    expect(stats.last30[29].date).toBe(TODAY);
    expect(stats.last30[28]).toMatchObject({ date: '2026-10-09', minutes: 120, count: 2 });
    expect(stats.activeDaysLast30).toBe(1);
    expect(stats.last7Minutes).toBe(120);
    expect(stats.avgMinutesPerActiveDay).toBe(120);
  });
});

describe('computeStudyStats: ratings and mastery', () => {
  it('averages the self-rating per J step', () => {
    const stats = computeStudyStats(
      [course('a'), course('b')],
      [
        done('a', 1, '2026-10-02', '2026-10-02', 4),
        done('b', 1, '2026-10-02', '2026-10-02', 2),
        done('a', 7, '2026-10-08', '2026-10-08', 1),
      ],
      TODAY
    );
    expect(stats.retentionByJ).toEqual([
      { jIndex: 1, avgRating: 3, count: 2 },
      { jIndex: 7, avgRating: 1, count: 1 },
    ]);
    expect(stats.avgRating).toBeCloseTo(7 / 3);
  });

  it('counts courses by mastery level', () => {
    const stats = computeStudyStats([course('a', 0), course('b', 4), course('c', 4)], [], TODAY);
    expect(stats.masteryCounts).toEqual({ 0: 1, 1: 0, 2: 0, 3: 0, 4: 2 });
    expect(stats.coursesWithoutRevisionDone).toBe(3);
  });
});

describe('computeStudyStats: courses to watch', () => {
  it('flags overdue courses first, oldest delay on top', () => {
    const stats = computeStudyStats(
      [course('a'), course('b'), course('c')],
      [rev('a', 1, '2026-10-08'), rev('b', 1, '2026-10-02'), rev('c', 1, '2026-10-20')],
      TODAY
    );
    expect(stats.watched.map((w) => w.course.id)).toEqual(['b', 'a']);
    expect(stats.watched[0]).toMatchObject({ overdueCount: 1, oldestOverdueDays: 8 });
  });

  it('flags a low last rating or a low mastery once the course was started', () => {
    const stats = computeStudyStats(
      [course('low', 3), course('weak', 1), course('fresh', 0)],
      [
        done('low', 1, '2026-10-02', '2026-10-02', 1),
        done('weak', 1, '2026-10-02', '2026-10-02', 3),
        rev('fresh', 1, '2026-10-20'),
      ],
      TODAY
    );
    const ids = stats.watched.map((w) => w.course.id).sort();
    expect(ids).toEqual(['low', 'weak']); // 'fresh' was never studied: not "fragile" yet
  });

  it('uses the most recent rating, not the highest J', () => {
    const stats = computeStudyStats(
      [course('a', 3)],
      [done('a', 1, '2026-10-02', '2026-10-09', 1), done('a', 7, '2026-10-08', '2026-10-03', 4)],
      TODAY
    );
    expect(stats.watched[0].lastRating).toBe(1);
  });
});
