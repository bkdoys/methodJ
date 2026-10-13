import { describe, expect, it } from 'vitest';
import { Course, MasteryLevel, RevisionItem, Subject } from '../../types';
import { averageDelay, computeExamProjection, computeDrift, compareWeeks, computeCoverage, computeStudyStats, computeSubjectProgress, forecastLoad } from '../stats';

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

describe('progress metrics', () => {
  it('counts the load per day over the horizon, overdue slots on today', () => {
    const load = forecastLoad(
      [rev('a', 1, '2026-10-05'), rev('a', 3, '2026-10-10'), rev('a', 7, '2026-10-15'), rev('a', 15, '2026-12-30'), done('a', 0, '2026-10-01', '2026-10-01')],
      TODAY,
      30
    );
    expect(load).toHaveLength(30);
    expect(load[0]).toEqual({ date: TODAY, minutes: 120, count: 2 });
    expect(load[5].count).toBe(1);
    expect(load.reduce((a, d) => a + d.count, 0)).toBe(3); // le J15 est hors horizon, le J0 est fait
  });

  it('measures coverage from validated J0 and the pace over 4 weeks', () => {
    const cov = computeCoverage(
      [course('a'), course('b'), course('c'), course('d')],
      [
        done('a', 0, '2026-09-01', '2026-09-01'), // commencé il y a longtemps
        done('b', 0, '2026-10-01', '2026-10-01'),
        done('c', 0, '2026-10-09', '2026-10-09'),
        done('c', 1, '2026-10-10', '2026-10-10'),
        rev('d', 0, '2026-10-11'),
        done('gone', 0, '2026-10-09', '2026-10-09'), // cours supprimé
      ],
      TODAY
    );
    expect(cov).toEqual({ started: 3, total: 4, perWeek: 0.5 });
  });

  it('compares the last 7 days with the 7 before', () => {
    const w = compareWeeks(
      [done('a', 1, '2026-10-01', '2026-10-01', 4), done('a', 3, '2026-10-06', '2026-10-06', 2), done('a', 7, '2026-10-10', '2026-10-10', 3), done('a', 0, '2026-09-20', '2026-09-20')],
      TODAY
    );
    expect(w.current).toMatchObject({ count: 2, minutes: 120, avgRating: 2.5 });
    expect(w.previous).toMatchObject({ count: 1, avgRating: 4 });
  });

  it('averages the delay of late completions only', () => {
    expect(averageDelay([done('a', 1, '2026-10-01', '2026-10-01')])).toBeNull();
    expect(averageDelay([done('a', 1, '2026-10-01', '2026-10-02'), done('a', 3, '2026-10-01', '2026-10-05'), done('a', 7, '2026-10-05', '2026-10-04')])).toEqual({
      days: 2.5,
      count: 2,
    });
  });

  it('summarizes each discipline: started courses, mastery of started ones, last review', () => {
    const subject: Subject = { id: 's', name: 'S', color: '#000' } as Subject;
    const [p] = computeSubjectProgress(
      [subject],
      [course('a', 4), course('b', 0)],
      [done('a', 0, '2026-10-01', '2026-10-01'), done('a', 1, '2026-10-02', '2026-10-03'), rev('a', 3, '2026-10-05'), rev('b', 0, '2026-10-20')],
      TODAY
    );
    expect(p).toMatchObject({ courseCount: 2, started: 1, revisionCount: 4, completedCount: 2, overdueCount: 1, minutes: 120, lastDone: '2026-10-03' });
    expect(p.mastery).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 }); // b, jamais commencé, ne compte pas pour 0★
  });
});

describe('computeDrift', () => {
  it('measures the gap to the frozen original date, for done and still-pending slots', () => {
    const d = computeDrift(
      [course('a'), course('b')],
      [
        rev('a', 0, '2026-10-01', { completed: true, completedDate: '2026-10-01' }), // pas de date d'origine
        rev('a', 1, '2026-10-06', { originalDate: '2026-10-02', completed: true, completedDate: '2026-10-06' }), // +4
        rev('a', 3, '2026-10-04', { originalDate: '2026-10-04', completed: true, completedDate: '2026-10-03' }), // -1
        rev('a', 7, '2026-10-12', { originalDate: '2026-10-08' }), // repoussé de 4, pas encore fait
        rev('b', 1, '2026-10-09', { originalDate: '2026-10-09' }), // en retard d'1 jour (aujourd'hui = 10)
        rev('b', 3, '2026-10-14', { originalDate: '2026-10-14' }), // dans les temps : non compté
        rev('a', 15, '2026-10-20'), // jamais suivi
      ],
      TODAY
    );
    expect(d.tracked).toBe(4);
    expect(d.done).toBe(2);
    expect(d.onOriginal).toBe(1);
    expect(d.avgDrift).toBe(1.5);
    expect(d.byJ).toEqual([{ jIndex: 1, avg: 4, count: 1 }, { jIndex: 3, avg: -1, count: 1 }]);
    expect(d.courses.map((c) => [c.course.id, c.drift])).toEqual([['a', 4], ['b', 1]]);
  });

  it('returns nothing when no slot is tracked', () => {
    const d = computeDrift([course('a')], [rev('a', 1, '2026-10-05')], TODAY);
    expect(d).toMatchObject({ tracked: 0, done: 0, avgDrift: null, byJ: [], courses: [] });
  });
});

describe('computeExamProjection', () => {
  const longCourse = (id: string): Course => ({ ...course(id), activeJList: [0, 1, 3, 60] });
  const started = (id: string, day: string) => done(id, 0, day, day);

  it('shows nothing without a date, with a malformed one, or once the exam is past', () => {
    const cs = [course('a')];
    expect(computeExamProjection(cs, [], undefined, TODAY)).toBeNull();
    expect(computeExamProjection(cs, [], 'bientôt', TODAY)).toBeNull();
    expect(computeExamProjection(cs, [], '2026-10-09', TODAY)).toBeNull();
    expect(computeExamProjection(cs, [], TODAY, TODAY)).not.toBeNull(); // le jour même compte encore
  });

  it('extrapolates the 4-week pace to the date everything will be started', () => {
    // 8 cours, 4 commencés sur les 4 dernières semaines = 1 par semaine, 4 restants -> 28 jours
    const cs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(longCourse);
    const revs = ['a', 'b', 'c', 'd'].map((id, i) => started(id, `2026-09-${15 + i}`));
    const p = computeExamProjection(cs, revs, '2026-12-31', TODAY)!;
    expect(p).toMatchObject({ remaining: 4, perWeek: 1, projectedDate: '2026-11-07', onTrack: true, cycleDays: 60, lastFullCycleStart: '2026-11-01' });
    expect(p.neededPerWeek).toBe(0.3); // 4 cours en 82 jours = 0,34 par semaine
    const late = computeExamProjection(cs, revs, '2026-10-31', TODAY)!;
    expect(late.onTrack).toBe(false); // 7 novembre > 31 octobre
    expect(late.neededPerWeek).toBe(1.3); // 4 cours en 21 jours = 1,33 par semaine
  });

  it('has no projected date without any recent pace, and is on track when nothing remains', () => {
    const p = computeExamProjection([longCourse('a')], [], '2026-12-31', TODAY)!;
    expect(p).toMatchObject({ remaining: 1, perWeek: 0, projectedDate: null, onTrack: false });
    const all = computeExamProjection([longCourse('a')], [started('a', '2026-10-01')], '2026-12-31', TODAY)!;
    expect(all).toMatchObject({ remaining: 0, onTrack: true, projectedDate: TODAY });
  });
});
