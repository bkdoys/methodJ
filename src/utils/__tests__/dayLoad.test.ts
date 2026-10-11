import { describe, expect, it } from 'vitest';
import { AppSettings, RevisionItem } from '../../types';
import { DEFAULT_SETTINGS } from '../seedData';
import { analyzeDay, analyzeDays, findAlertDays } from '../dayLoad';

const monday = '2026-10-12';
const rev = (id: string, over: Partial<RevisionItem> = {}): RevisionItem => ({
  id, courseId: 'c1', jIndex: 1, scheduledDate: monday, durationMinutes: 60, completed: false, slotOrder: 0, ...over,
});
// Lundi : plage 08:00-12:00 (4 h) ; objectif quotidien 3 h
const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  dailyTargetHours: 3,
  dayStartTime: '08:00',
  dayWindows: { '0': { start: '08:00', end: '12:00' } },
  breaks: {},
  forcedDates: [],
};

describe('analyzeDay', () => {
  it('is calm when the slots fit the window and the target', () => {
    const d = analyzeDay(monday, [rev('a', { slotOrder: 0 }), rev('b', { slotOrder: 1 })], settings);
    expect(d).toMatchObject({ totalMinutes: 120, targetMinutes: 180, capacityMinutes: 240, slotCount: 2, overloaded: false, alert: false });
    expect(d.overflowIds).toEqual([]);
  });

  it('flags a slot stacked past the end of the window', () => {
    const revs = [0, 1, 2, 3, 4].map((i) => rev(`s${i}`, { slotOrder: i })); // 5 h dans une plage de 4 h
    const d = analyzeDay(monday, revs, settings);
    expect(d.overflowIds).toEqual(['s4']);
    expect(d.overloaded).toBe(true); // 5 h > 3 h
    expect(d.alert).toBe(true);
  });

  it('flags overload by target even when everything fits the window', () => {
    const revs = [0, 1, 2, 3].map((i) => rev(`s${i}`, { slotOrder: i })); // 4 h = pile la plage, > objectif 3 h
    const d = analyzeDay(monday, revs, settings);
    expect(d.overflowIds).toEqual([]);
    expect(d.overloaded).toBe(true);
    expect(d.alert).toBe(true);
  });

  it('never counts a completed slot as outside the window', () => {
    const revs = [0, 1, 2, 3].map((i) => rev(`s${i}`, { slotOrder: i })).concat(rev('done', { slotOrder: 4, completed: true }));
    expect(analyzeDay(monday, revs, settings).overflowIds).toEqual([]);
  });

  it('takes breaks out of the capacity and pushes slots past the window', () => {
    const withBreak: AppSettings = { ...settings, breaks: { all: [{ start: '10:00', end: '11:00' }] } };
    const revs = [0, 1, 2, 3].map((i) => rev(`s${i}`, { slotOrder: i }));
    const d = analyzeDay(monday, revs, withBreak);
    expect(d.capacityMinutes).toBe(180);
    expect(d.overflowIds).toEqual(['s3']); // la pause repousse le dernier créneau après 12:00
  });

  it('ignores the window limits on a forced day, but not the target', () => {
    const forced: AppSettings = { ...settings, forcedDates: [monday] };
    const revs = [0, 1, 2, 3, 4].map((i) => rev(`s${i}`, { slotOrder: i }));
    const d = analyzeDay(monday, revs, forced);
    expect(d.overflowIds).toEqual([]);
    expect(d.overloaded).toBe(true);
  });
});

describe('analyzeDays / findAlertDays', () => {
  const revs = [
    rev('past', { scheduledDate: '2026-10-05', durationMinutes: 600 }),
    ...[0, 1, 2, 3, 4].map((i) => rev(`m${i}`, { slotOrder: i })),
    rev('calm', { scheduledDate: '2026-10-14' }),
  ];

  it('starts at the given day, in date order', () => {
    expect(analyzeDays(revs, settings, monday).map((d) => d.date)).toEqual([monday, '2026-10-14']);
  });

  it('keeps only the days that need attention', () => {
    expect(findAlertDays(revs, settings, monday).map((d) => d.date)).toEqual([monday]);
    expect(findAlertDays([], settings, monday)).toEqual([]);
  });
});
