import { describe, expect, it } from 'vitest';
import { Course, RevisionItem } from '../../types';
import { clearFreeSnoozes, findFreeCourseAlerts, getFreeAlertDays, snoozeFreeAlert } from '../freeAlerts';
import { addDays } from '../dateUtils';

const TODAY = '2026-10-20';

const course = (id: string, over: Partial<Course> = {}): Course => ({
  id,
  title: id,
  itemCode: id,
  subjectId: 's',
  j0Date: '2026-09-01',
  activeJList: [],
  mode: 'free',
  mastery: 0,
  createdAt: '2026-09-01',
  ...over,
});

const rev = (courseId: string, date: string, over: Partial<RevisionItem> = {}): RevisionItem => ({
  id: `${courseId}_${date}`,
  courseId,
  kind: 'R',
  jIndex: 1,
  scheduledDate: date,
  durationMinutes: 60,
  completed: true,
  completedDate: date,
  slotOrder: 0,
  ...over,
});

describe('getFreeAlertDays', () => {
  it('15 par défaut, 0 = jamais, valeur invalide ignorée', () => {
    expect(getFreeAlertDays({})).toBe(15);
    expect(getFreeAlertDays({ freeAlertDays: 0 })).toBe(0);
    expect(getFreeAlertDays({ freeAlertDays: 7 })).toBe(7);
    expect(getFreeAlertDays({ freeAlertDays: -3 })).toBe(15);
  });
});

describe('findFreeCourseAlerts', () => {
  it('alerte 15 jours après la dernière révision faite, pas avant', () => {
    const revs = [rev('a', addDays(TODAY, -15)), rev('b', addDays(TODAY, -14))];
    const alerts = findFreeCourseAlerts([course('a'), course('b')], revs, {}, TODAY);
    expect(alerts.map((x) => [x.course.id, x.idleDays, x.nextSnooze])).toEqual([['a', 15, 8]]);
  });

  it('sans révision, compte depuis la création du cours', () => {
    const alerts = findFreeCourseAlerts([course('a', { createdAt: addDays(TODAY, -20) })], [], {}, TODAY);
    expect(alerts[0].since).toBe(addDays(TODAY, -20));
  });

  it("ignore un cours avec une R planifiée, un cours en J, la boîte « à trier », et tout quand le délai vaut 0", () => {
    const old = addDays(TODAY, -40);
    const courses = [course('a'), course('j', { mode: undefined }), course('box', { inbox: true })];
    const revs = [rev('a', old), rev('a', addDays(TODAY, 3), { completed: false, completedDate: undefined }), rev('j', old), rev('box', old)];
    expect(findFreeCourseAlerts(courses, revs, {}, TODAY)).toEqual([]);
    expect(findFreeCourseAlerts([course('z')], [rev('z', old)], { freeAlertDays: 0 }, TODAY)).toEqual([]);
  });
});

describe('reports', () => {
  it('chaque report prend la moitié du précédent, jusqu\'à 1 jour, puis plus de report', () => {
    const c = course('a');
    const revs = [rev('a', addDays(TODAY, -30))];
    let settings: { freeAlertSnooze?: Record<string, { since: string; until: string; delay: number }> } = {};
    let day = TODAY;
    const delays: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const [alert] = findFreeCourseAlerts([c], revs, settings, day);
      expect(alert).toBeDefined();
      delays.push(alert.nextSnooze);
      if (alert.nextSnooze === null) break;
      // Pendant le report, pas d'alerte
      settings = { freeAlertSnooze: snoozeFreeAlert(alert, settings, day) };
      expect(findFreeCourseAlerts([c], revs, settings, addDays(day, alert.nextSnooze - 1))).toEqual([]);
      day = addDays(day, alert.nextSnooze);
    }
    expect(delays).toEqual([8, 4, 2, 1, null]);
  });

  it('une révision faite après le report repart de zéro', () => {
    const c = course('a');
    const first = [rev('a', addDays(TODAY, -30))];
    const [alert] = findFreeCourseAlerts([c], first, {}, TODAY);
    const snoozes = snoozeFreeAlert(alert, {}, TODAY);
    const later = [...first, rev('a', addDays(TODAY, 2))];
    // Nouveau point de départ : 15 jours après la nouvelle révision, avec un premier report de 8 jours
    expect(findFreeCourseAlerts([c], later, { freeAlertSnooze: snoozes }, addDays(TODAY, 16))).toEqual([]);
    expect(findFreeCourseAlerts([c], later, { freeAlertSnooze: snoozes }, addDays(TODAY, 17))[0].nextSnooze).toBe(8);
  });

  it('clearFreeSnoozes retire les cours donnés et ceux qui n\'existent plus', () => {
    const s = { a: { since: 'x', until: 'y', delay: 8 }, b: { since: 'x', until: 'y', delay: 4 }, gone: { since: 'x', until: 'y', delay: 2 } };
    expect(clearFreeSnoozes(s, ['a'], [course('a'), course('b')])).toEqual({ b: s.b });
    expect(clearFreeSnoozes({ a: s.a }, ['a'], [course('a')])).toBeUndefined();
  });
});
