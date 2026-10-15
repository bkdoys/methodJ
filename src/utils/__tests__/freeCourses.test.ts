import { describe, expect, it } from 'vitest';
import { Course, RevisionItem } from '../../types';
import {
  applyCascadeShift,
  compareCourseRevisions,
  convertCourseToFree,
  convertCourseToJ,
  createRReview,
  freezeOriginalDates,
  getDefaultSlotDurationMinutes,
  revLabel,
  syncCourseRevisions,
} from '../jMethod';
import { computeCoverage, computeStudyStats, startedCourseIds } from '../stats';
import { findIdleCourses } from '../dashboard';

// Cours sans J (mode libre) et révisions R : elles ne doivent jamais se confondre avec un J de même numéro.

const TODAY = '2026-10-10';

const course = (id: string, over: Partial<Course> = {}): Course => ({
  id,
  title: `Cours ${id}`,
  itemCode: id,
  subjectId: 's',
  j0Date: '2026-10-01',
  activeJList: [0, 1, 3],
  mastery: 0,
  createdAt: '2026-10-01',
  ...over,
});

const j = (courseId: string, jIndex: number, date: string, over: Partial<RevisionItem> = {}): RevisionItem => ({
  id: `${courseId}_j${jIndex}`,
  courseId,
  jIndex,
  scheduledDate: date,
  durationMinutes: 60,
  completed: false,
  slotOrder: 0,
  ...over,
});

const r = (courseId: string, n: number, date: string, over: Partial<RevisionItem> = {}): RevisionItem =>
  j(courseId, n, date, { id: `${courseId}_r${n}`, kind: 'R', ...over });

describe('revLabel', () => {
  it('écrit J pour un J et R pour une révision libre', () => {
    expect(revLabel(j('a', 3, TODAY))).toBe('J3');
    expect(revLabel(r('a', 2, TODAY))).toBe('R2');
  });
});

describe('createRReview', () => {
  it('numérote à la suite des R du cours, sans compter les J ni les autres cours', () => {
    const existing = [r('a', 1, '2026-10-01'), r('a', 4, '2026-10-05'), j('a', 7, '2026-10-08'), r('b', 9, TODAY)];
    const next = createRReview('a', TODAY, existing, { slotDurationDefault: 45 });
    expect(next).toMatchObject({ courseId: 'a', kind: 'R', jIndex: 5, scheduledDate: TODAY, durationMinutes: 45, completed: false });
    expect(createRReview('c', TODAY, existing).jIndex).toBe(1);
  });

  it('prend la durée par défaut, jamais celle propre à un J', () => {
    const settings = { slotDurationByJ: { '1': 120 }, slotDurationDefault: 50 };
    expect(createRReview('a', TODAY, [], settings).durationMinutes).toBe(50);
    expect(getDefaultSlotDurationMinutes()).toBe(60);
  });
});

describe('cascade et révisions R', () => {
  const revs = [j('a', 1, '2026-10-02'), j('a', 3, '2026-10-04'), r('a', 2, '2026-10-06'), r('a', 5, '2026-10-09')];

  it("un J décalé n'entraîne pas les R du cours", () => {
    const res = applyCascadeShift(revs, 'a_j1', '2026-10-03', true);
    const byId = new Map(res.updatedRevisions.map((x) => [x.id, x.scheduledDate]));
    expect(byId.get('a_j3')).toBe('2026-10-05');
    expect(byId.get('a_r2')).toBe('2026-10-06');
    expect(byId.get('a_r5')).toBe('2026-10-09');
    expect(res.shiftedJLabels).toEqual(['J1', 'J3']);
  });

  it("une R décalée bouge seule", () => {
    const res = applyCascadeShift(revs, 'a_r2', '2026-10-07', true);
    expect(res.shiftedCount).toBe(0);
    expect(res.shiftedJLabels).toEqual(['R2']);
    expect(res.updatedRevisions.find((x) => x.id === 'a_r5')!.scheduledDate).toBe('2026-10-09');
  });
});

describe('syncCourseRevisions et freezeOriginalDates', () => {
  it("une R1 n'est pas prise pour le J1 et reste en place", () => {
    const c = course('a', { activeJList: [0, 1] });
    const out = syncCourseRevisions(c, [j('a', 0, '2026-10-01'), r('a', 1, '2026-10-05', { completed: true })], [0, 1]);
    const own = out.filter((x) => x.courseId === 'a');
    expect(own.filter((x) => x.kind !== 'R').map((x) => x.jIndex).sort()).toEqual([0, 1]);
    expect(own.filter((x) => x.kind === 'R').map((x) => x.id)).toEqual(['a_r1']);
  });

  it("ne fige pas de date d'origine sur une R", () => {
    const frozen = freezeOriginalDates([j('a', 3, '2026-10-04'), r('a', 2, '2026-10-06')], 'a');
    expect(frozen.map((x) => x.id)).toEqual(['a_j3']);
  });
});

describe('convertCourseToFree', () => {
  it('garde les créneaux faits, retire les J à faire, et passe le cours en libre', () => {
    const c = course('a');
    const revs = [j('a', 0, '2026-10-01', { completed: true }), j('a', 1, '2026-10-02'), j('a', 3, '2026-10-04'), j('b', 1, TODAY)];
    const conv = convertCourseToFree(c, revs);
    expect(conv.course).toMatchObject({ mode: 'free', activeJList: [] });
    expect(conv.removed.map((x) => x.id)).toEqual(['a_j1', 'a_j3']);
    expect(conv.added).toEqual([]);
  });
});

describe('convertCourseToJ', () => {
  it('garde les R faites, retire celles à faire et programme le cycle depuis le J0 choisi', () => {
    const c = course('a', { mode: 'free', activeJList: [] });
    const revs = [r('a', 1, '2026-10-02', { completed: true, completedDate: '2026-10-02' }), r('a', 2, '2026-10-12')];
    const conv = convertCourseToJ(c, revs, TODAY, [1, 3]);
    expect(conv.course.mode).toBeUndefined();
    expect(conv.course).toMatchObject({ j0Date: TODAY, activeJList: [0, 1, 3] });
    expect(conv.removed.map((x) => x.id)).toEqual(['a_r2']);
    expect(conv.added.map((x) => [x.jIndex, x.scheduledDate])).toEqual([
      [0, TODAY],
      [1, '2026-10-11'],
      [3, '2026-10-13'],
    ]);
    expect(conv.changed).toEqual([]);
  });

  it("les J faits d'un ancien cycle deviennent des R à la suite (jamais deux J0)", () => {
    const c = course('a', { mode: 'free', activeJList: [] });
    const revs = [
      j('a', 0, '2026-09-01', { completed: true, completedDate: '2026-09-01', originalDate: '2026-09-01' }),
      j('a', 1, '2026-09-02', { completed: true, completedDate: '2026-09-03' }),
      r('a', 1, '2026-09-20', { completed: true, completedDate: '2026-09-20' }),
    ];
    const conv = convertCourseToJ(c, revs, TODAY, [1]);
    expect(conv.changed.map((x) => [x.id, x.kind, x.jIndex])).toEqual([
      ['a_j0', 'R', 2],
      ['a_j1', 'R', 3],
    ]);
    expect(conv.changed[0].originalDate).toBeUndefined();
    expect(conv.added.filter((x) => x.jIndex === 0)).toHaveLength(1);
  });
});

describe('compareCourseRevisions', () => {
  it('suit la chronologie, quelle que soit la suite de passages libre ↔ J', () => {
    // R1 le 15/10, puis passage en J (J0 le 16/10), retour en libre, R2 le 20/10
    const mixed = [r('a', 2, '2026-10-20'), j('a', 0, '2026-10-16', { completed: true }), r('a', 1, '2026-10-15', { completed: true })];
    expect([...mixed].sort(compareCourseRevisions).map(revLabel)).toEqual(['R1', 'J0', 'R2']);
  });

  it('le même jour : J avant R, puis par numéro', () => {
    const same = [r('a', 2, TODAY), r('a', 1, TODAY), j('a', 3, TODAY)];
    expect([...same].sort(compareCourseRevisions).map(revLabel)).toEqual(['J3', 'R1', 'R2']);
  });
});

describe('stats et Dashboard avec des cours libres', () => {
  const revs = [
    j('a', 0, '2026-10-01', { completed: true, completedDate: '2026-10-01', rating: 2 }),
    r('b', 1, '2026-10-03', { completed: true, completedDate: '2026-10-03', rating: 4 }),
    r('b', 2, '2026-10-06', { completed: true, completedDate: '2026-10-06', rating: 4 }),
    r('c', 1, '2026-10-20'),
  ];

  it('un cours libre est commencé dès sa première R faite', () => {
    expect([...startedCourseIds(revs)].sort()).toEqual(['a', 'b']);
    const cov = computeCoverage([course('a'), course('b', { mode: 'free' }), course('c', { mode: 'free' })], revs, TODAY);
    expect(cov).toMatchObject({ started: 2, total: 3, perWeek: 0.5 });
  });

  it("les notes des R ne comptent pas dans la moyenne par J", () => {
    const stats = computeStudyStats([course('a'), course('b', { mode: 'free' })], revs, TODAY);
    expect(stats.retentionByJ.map((x) => [x.jIndex, x.count])).toEqual([[0, 1]]);
  });

  it("un cours libre sans révision prévue n'est pas signalé comme sans créneau", () => {
    const idle = findIdleCourses([course('a'), course('b', { mode: 'free' })], [j('a', 0, '2026-10-01', { completed: true }), ...revs.slice(1, 3)]);
    expect(idle.map((c) => c.id)).toEqual(['a']);
  });
});
