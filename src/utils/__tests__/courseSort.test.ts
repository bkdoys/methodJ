import { describe, expect, it } from 'vitest';
import { Course, MasteryLevel, RevisionItem, Subject } from '../../types';
import { COURSE_SORT_OPTIONS, isCourseSortMode, sortCourses } from '../courseSort';

const subjects = [
  { id: 's1', name: 'Pneumologie' },
  { id: 's2', name: 'Cardiologie' },
] as Subject[];

const course = (id: string, title: string, o: Partial<Course> = {}): Course => ({
  id,
  title,
  itemCode: id,
  subjectId: 's1',
  j0Date: '2026-10-01',
  activeJList: [0],
  mastery: 0 as MasteryLevel,
  createdAt: '2026-10-01',
  ...o,
});
const rev = (courseId: string, scheduledDate: string, completed = false): RevisionItem => ({
  id: `${courseId}-${scheduledDate}`,
  courseId,
  jIndex: 1,
  scheduledDate,
  durationMinutes: 60,
  completed,
  slotOrder: 0,
});
const ids = (list: Course[]) => list.map((c) => c.id);

describe('sortCourses', () => {
  const a = course('a', 'Asthme', { createdAt: '2026-10-03', j0Date: '2026-09-01', mastery: 3 });
  const b = course('b', 'BPCO', { createdAt: '2026-10-05', j0Date: '2026-10-05', mastery: 1, subjectId: 's2' });
  const c = course('c', 'Cancer du poumon', { createdAt: '2026-10-05', j0Date: '2026-10-02', mastery: 1 });
  const all = [a, b, c];

  it('recent: newest creation first, ties by title', () => {
    expect(ids(sortCourses(all, [], subjects, 'recent'))).toEqual(['b', 'c', 'a']);
  });

  it('title: A → Z, accent- and case-insensitive, numbers in natural order', () => {
    const list = [course('x', 'Item 10'), course('y', 'item 2'), course('z', 'Écho')];
    expect(ids(sortCourses(list, [], subjects, 'title'))).toEqual(['z', 'y', 'x']);
  });

  it('subject: by subject name then title', () => {
    expect(ids(sortCourses(all, [], subjects, 'subject'))).toEqual(['b', 'a', 'c']);
  });

  it('j0: newest or oldest first', () => {
    expect(ids(sortCourses(all, [], subjects, 'j0-new'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortCourses(all, [], subjects, 'j0-old'))).toEqual(['a', 'c', 'b']);
  });

  it('mastery: weak first or strong first, ties by title', () => {
    expect(ids(sortCourses(all, [], subjects, 'mastery-low'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortCourses(all, [], subjects, 'mastery-high'))).toEqual(['a', 'b', 'c']);
  });

  it('next: earliest pending revision first, completed-only or empty courses last', () => {
    const revs = [
      rev('a', '2026-10-20'),
      rev('b', '2026-10-12'),
      rev('b', '2026-10-01', true), // already done: must be ignored
    ];
    expect(ids(sortCourses(all, revs, subjects, 'next'))).toEqual(['b', 'a', 'c']);
  });

  it('progress: least advanced first', () => {
    const revs = [rev('a', '2026-10-01', true), rev('a', '2026-10-02', true), rev('b', '2026-10-01', true), rev('b', '2026-10-09')];
    // a = 100 %, b = 50 %, c = 0 % (no revisions)
    expect(ids(sortCourses(all, revs, subjects, 'progress'))).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate its input and gives the same result whatever the input order', () => {
    const input = [c, a, b];
    const snapshot = ids(input);
    const first = ids(sortCourses(input, [], subjects, 'mastery-low'));
    expect(ids(input)).toEqual(snapshot);
    expect(ids(sortCourses([b, c, a], [], subjects, 'mastery-low'))).toEqual(first);
  });

  it('breaks complete ties by id', () => {
    const t1 = course('id2', 'Même titre');
    const t2 = course('id1', 'Même titre');
    expect(ids(sortCourses([t1, t2], [], subjects, 'mastery-low'))).toEqual(['id1', 'id2']);
  });
});

describe('isCourseSortMode', () => {
  it('accepts every option and rejects anything else (e.g. stale localStorage)', () => {
    COURSE_SORT_OPTIONS.forEach((o) => expect(isCourseSortMode(o.value)).toBe(true));
    expect(isCourseSortMode('nope')).toBe(false);
    expect(isCourseSortMode(null)).toBe(false);
  });
});
