import { describe, expect, it } from 'vitest';
import { Course } from '../../types';
import { INBOX_COURSE_ID, INBOX_SUBJECT_ID, isInboxCourse, makeInboxCourse, withoutInbox } from '../inbox';
import { countAlerts } from '../dashboard';
import { findFreeCourseAlerts } from '../freeAlerts';
import { computeCoverage } from '../stats';

const course = (id: string): Course => ({
  id,
  title: id,
  itemCode: id,
  subjectId: 's',
  j0Date: '2026-09-01',
  activeJList: [0],
  mastery: 0,
  createdAt: '2026-09-01',
});

describe('boîte « Cartes à trier »', () => {
  it('a un identifiant fixe et une discipline à part (deux appareils partagent la même boîte)', () => {
    const box = makeInboxCourse('2026-10-20');
    expect(box).toMatchObject({ id: INBOX_COURSE_ID, subjectId: INBOX_SUBJECT_ID, mode: 'free', inbox: true, activeJList: [] });
    expect(makeInboxCourse('2026-11-01').id).toBe(box.id);
    expect(isInboxCourse(box)).toBe(true);
    expect(isInboxCourse(course('a'))).toBe(false);
  });

  it('withoutInbox la retire des cours étudiés : ni dans la couverture ni dans les alertes de cours libres', () => {
    const box = makeInboxCourse('2026-09-01');
    const courses = [course('a'), box];
    expect(withoutInbox(courses).map((c) => c.id)).toEqual(['a']);
    expect(computeCoverage(withoutInbox(courses), [], '2026-10-20').total).toBe(1);
    expect(findFreeCourseAlerts(courses, [], {}, '2026-12-31')).toEqual([]);
  });
});

describe('countAlerts', () => {
  it('compte chaque cours libre à réviser, et une seule alerte pour des cartes à trier', () => {
    expect(countAlerts({ overdue: 2, syncConflict: false, freeCourses: 3, inboxCards: 12 })).toBe(6);
    expect(countAlerts({ overdue: 0, syncConflict: false, inboxCards: 0 })).toBe(0);
  });
});
