import { describe, expect, it } from 'vitest';
import { AppSettings, RevisionItem } from '../../types';
import {
  DEFAULT_TIMELINE,
  assignStartTimes,
  computeDisplayRange,
  consecutiveDays,
  DEFAULT_BLOCK_DETAILS,
  getBlockDetails,
  getDayBreaks,
  resizeSlotInLayout,
  getDayBounds,
  dayHasLimits,
  getMultiDayCount,
  nextMultiDayCount,
  defaultDayWindowStrings,
  findFreeStart,
  getDayWindow,
  weekdayIndex,
  DEFAULT_HOUR_HEIGHT,
  HOUR_HEIGHT_STEPS,
  normalizeHourHeight,
  placeRevisionAtTime,
  stepHourHeight,
  formatTime,
  getTimelineConfig,
  moveSlotInLayout,
  parseTime,
  placementsToUpdates,
  resolveDayLayout,
  snapToStep,
} from '../dayLayout';

const rev = (id: string, durationMinutes: number, o: Partial<RevisionItem> = {}): RevisionItem => ({
  id,
  courseId: 'c',
  jIndex: 1,
  scheduledDate: '2026-10-10',
  durationMinutes,
  completed: false,
  slotOrder: 0,
  ...o,
});
const h = (hh: number, mm = 0) => hh * 60 + mm;
const pos = (ps: { id: string; start: number }[] | null) => Object.fromEntries((ps ?? []).map((p) => [p.id, p.start]));
const noOverlap = (ps: { start: number; end: number }[]) =>
  [...ps].sort((a, b) => a.start - b.start).every((p, i, a) => i === 0 || a[i - 1].end <= p.start);

describe('time helpers', () => {
  it('parses and formats HH:MM', () => {
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('8:30')).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(formatTime(510)).toBe('08:30');
    expect(formatTime(24 * 60)).toBe('00:00');
  });

  it('snaps to the step', () => {
    expect(snapToStep(h(9, 14), 30)).toBe(h(9, 0));
    expect(snapToStep(h(9, 16), 30)).toBe(h(9, 30));
    expect(snapToStep(h(9, 7), 15)).toBe(h(9, 0));
  });
});

describe('getTimelineConfig', () => {
  it('uses defaults when settings are missing (old cloud settings)', () => {
    expect(getTimelineConfig({})).toEqual(DEFAULT_TIMELINE);
    expect(getTimelineConfig(undefined)).toEqual(DEFAULT_TIMELINE);
  });

  it('keeps valid values', () => {
    expect(getTimelineConfig({ timelineStartHour: 6, timelineEndHour: 20, timelineStepMinutes: 15 })).toEqual({
      startHour: 6,
      endHour: 20,
      stepMinutes: 15,
    });
  });

  it('repairs an end hour that is not after the start hour, and an unknown step', () => {
    const c = getTimelineConfig({ timelineStartHour: 22, timelineEndHour: 10, timelineStepMinutes: 7 });
    expect(c.endHour).toBeGreaterThan(c.startHour);
    expect(c.endHour).toBeLessThanOrEqual(24);
    expect(c.stepMinutes).toBe(30);
  });
});

describe('resolveDayLayout', () => {
  it('stacks slots without startTime from the day start, contiguously, in slotOrder', () => {
    const ps = resolveDayLayout([rev('b', 60, { slotOrder: 1 }), rev('a', 90, { slotOrder: 0 })], h(8));
    expect(pos(ps)).toEqual({ a: h(8), b: h(9, 30) });
  });

  it('keeps explicit start times', () => {
    const ps = resolveDayLayout([rev('a', 60, { startTime: '14:00' })], h(8));
    expect(pos(ps)).toEqual({ a: h(14) });
  });

  it('never overlaps: a colliding slot is pushed after the previous one', () => {
    const ps = resolveDayLayout(
      [rev('a', 90, { startTime: '09:00', slotOrder: 0 }), rev('b', 60, { startTime: '10:00', slotOrder: 1 })],
      h(8)
    );
    expect(pos(ps)).toEqual({ a: h(9), b: h(10, 30) });
    expect(noOverlap(ps)).toBe(true);
  });

  it('ignores an invalid startTime', () => {
    expect(pos(resolveDayLayout([rev('a', 60, { startTime: 'nope' })], h(8)))).toEqual({ a: h(8) });
  });

  it('is deterministic whatever the input order', () => {
    const list = [rev('a', 60, { slotOrder: 0 }), rev('b', 60, { slotOrder: 1 }), rev('c', 60, { slotOrder: 2 })];
    expect(resolveDayLayout([...list].reverse(), h(8))).toEqual(resolveDayLayout(list, h(8)));
  });
});

describe('moveSlotInLayout', () => {
  const day = [
    rev('a', 60, { startTime: '08:00', slotOrder: 0 }),
    rev('b', 60, { startTime: '09:00', slotOrder: 1 }),
    rev('c', 60, { startTime: '10:00', slotOrder: 2 }),
  ];

  it('puts the dragged slot exactly at the target', () => {
    const ps = moveSlotInLayout(day, h(8), 'a', h(14));
    expect(pos(ps).a).toBe(h(14));
  });

  it('leaves slots that are fully before the drop point untouched', () => {
    const ps = moveSlotInLayout(day, h(8), 'c', h(12));
    expect(pos(ps)).toEqual({ a: h(8), b: h(9), c: h(12) });
  });

  it('pushes the slots it collides with later, in cascade', () => {
    // drop 'a' on top of 'b' (09:00): b and c are bumped after it
    const ps = moveSlotInLayout(day, h(8), 'a', h(9));
    expect(pos(ps)).toEqual({ a: h(9), b: h(10), c: h(11) });
    expect(noOverlap(ps!)).toBe(true);
  });

  it('bumps a slot that straddles the drop point below the dropped one', () => {
    // c dropped at 08:30 overlaps a (08:00-09:00): the dropped slot keeps its place, a and b go after it
    const ps = moveSlotInLayout(day, h(8), 'c', h(8, 30));
    expect(pos(ps)).toEqual({ c: h(8, 30), a: h(9, 30), b: h(10, 30) });
    expect(noOverlap(ps!)).toBe(true);
  });

  it('keeps gaps after the pushed zone', () => {
    const withGap = [
      rev('a', 60, { startTime: '08:00', slotOrder: 0 }),
      rev('b', 60, { startTime: '09:00', slotOrder: 1 }),
      rev('z', 60, { startTime: '16:00', slotOrder: 2 }),
    ];
    const ps = moveSlotInLayout(withGap, h(8), 'a', h(9));
    expect(pos(ps).z).toBe(h(16));
  });

  it('moving a slot to its own position changes nothing', () => {
    const ps = moveSlotInLayout(day, h(8), 'b', h(9));
    expect(pos(ps)).toEqual({ a: h(8), b: h(9), c: h(10) });
  });

  it('returns null when the cascade would run past midnight', () => {
    const late = [rev('a', 60, { startTime: '22:00', slotOrder: 0 }), rev('b', 120, { startTime: '23:00', slotOrder: 1 })];
    expect(moveSlotInLayout(late, h(8), 'a', h(23))).toBeNull();
  });

  it('is idempotent: re-applying the same move gives the same layout', () => {
    const first = moveSlotInLayout(day, h(8), 'a', h(9))!;
    const asRevs = day.map((r) => {
      const u = placementsToUpdates(first).find((x) => x.id === r.id)!;
      return { ...r, startTime: u.startTime, slotOrder: u.slotOrder };
    });
    expect(moveSlotInLayout(asRevs, h(8), 'a', h(9))).toEqual(first);
  });
});

describe('placementsToUpdates', () => {
  it('writes HH:MM start times and ranks in chronological order', () => {
    const ups = placementsToUpdates([
      { id: 'b', start: h(10, 30), end: h(11, 30) },
      { id: 'a', start: h(9), end: h(10, 30) },
    ]);
    expect(ups).toEqual([
      { id: 'a', startTime: '09:00', slotOrder: 0 },
      { id: 'b', startTime: '10:30', slotOrder: 1 },
    ]);
  });
});

describe('computeDisplayRange', () => {
  const h = (hh: number) => hh * 60;

  it('uses the configured range when everything fits', () => {
    expect(computeDisplayRange([{ start: h(9), end: h(10) }], h(7), h(23))).toEqual({ displayStart: h(7), displayEnd: h(23) });
  });

  it('uses the configured range for an empty day', () => {
    expect(computeDisplayRange([], h(8), h(20))).toEqual({ displayStart: h(8), displayEnd: h(20) });
  });

  it('widens to whole hours so no slot is cut', () => {
    const r = computeDisplayRange([{ start: h(5) + 30, end: h(6) }, { start: h(22), end: h(23) + 45 }], h(7), h(23));
    expect(r).toEqual({ displayStart: h(5), displayEnd: h(24) });
  });

  it('also covers the layout being dragged', () => {
    expect(computeDisplayRange([{ start: h(9), end: h(10) }], h(7), h(23), h(25) + 10)).toEqual({
      displayStart: h(7),
      displayEnd: h(26),
    });
  });
});

describe('hour height steps', () => {
  it('has the default among the steps', () => {
    expect(HOUR_HEIGHT_STEPS).toContain(DEFAULT_HOUR_HEIGHT);
  });

  it('moves to the next or previous step', () => {
    expect(stepHourHeight(108, 1)).toBe(132);
    expect(stepHourHeight(108, -1)).toBe(90);
  });

  it('stops at both ends', () => {
    expect(stepHourHeight(HOUR_HEIGHT_STEPS[0], -1)).toBe(HOUR_HEIGHT_STEPS[0]);
    const last = HOUR_HEIGHT_STEPS[HOUR_HEIGHT_STEPS.length - 1];
    expect(stepHourHeight(last, 1)).toBe(last);
  });

  it('snaps stale or invalid stored values to a valid step', () => {
    expect(normalizeHourHeight(100)).toBe(108);
    expect(normalizeHourHeight('72')).toBe(72);
    expect(normalizeHourHeight(null)).toBe(DEFAULT_HOUR_HEIGHT);
    expect(normalizeHourHeight('abc')).toBe(DEFAULT_HOUR_HEIGHT);
    expect(normalizeHourHeight(9999)).toBe(HOUR_HEIGHT_STEPS[HOUR_HEIGHT_STEPS.length - 1]);
  });
});

describe('weekdayIndex / getDayWindow', () => {
  const base = { dayStartTime: '08:00', timelineStartHour: 7, timelineEndHour: 23, timelineStepMinutes: 30 };

  it('numbers weekdays from Monday = 0', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // lundi
    expect(weekdayIndex('2026-10-10')).toBe(5); // samedi
    expect(weekdayIndex('2026-10-11')).toBe(6); // dimanche
  });

  it('defaults to day start -> end of the scale when a day has no custom window', () => {
    expect(getDayWindow({ ...base, dayWindows: {} }, '2026-10-05')).toEqual({ start: h(8), end: h(23) });
  });

  it('uses the weekday window from the preferences', () => {
    const settings = { ...base, dayWindows: { '0': { start: '09:00', end: '12:30' } } };
    expect(getDayWindow(settings, '2026-10-05')).toEqual({ start: h(9), end: h(12, 30) });
    expect(getDayWindow(settings, '2026-10-06')).toEqual({ start: h(8), end: h(23) }); // mardi : défaut
  });

  it('treats 23:59 as midnight and ignores an invalid window', () => {
    expect(getDayWindow({ ...base, dayWindows: { '1': { start: '14:00', end: '23:59' } } }, '2026-10-06')).toEqual({ start: h(14), end: 24 * 60 });
    expect(getDayWindow({ ...base, dayWindows: { '1': { start: '14:00', end: '10:00' } } }, '2026-10-06')).toEqual({ start: h(8), end: h(23) });
    expect(getDayWindow({ ...base, dayWindows: { '1': { start: 'x', end: '10:00' } } }, '2026-10-06')).toEqual({ start: h(8), end: h(23) });
  });

  it('exposes the default window as HH:MM strings for the preferences', () => {
    expect(defaultDayWindowStrings(base)).toEqual({ start: '08:00', end: '23:00' });
    expect(defaultDayWindowStrings({ ...base, timelineEndHour: 24 })).toEqual({ start: '08:00', end: '23:59' });
  });
});

describe('findFreeStart', () => {
  const win = { start: h(9), end: h(13) };

  it('takes the start of the window when it is free', () => {
    expect(findFreeStart([], 60, win, 30)).toBe(h(9));
  });

  it('finds the first gap that is large enough', () => {
    const occupied = [{ start: h(9), end: h(10) }, { start: h(11), end: h(12) }];
    expect(findFreeStart(occupied, 60, win, 30)).toBe(h(10)); // 10:00-11:00 tient pile
    expect(findFreeStart(occupied, 90, win, 30)).toBe(h(12)); // 90 min ne tient pas entre 10 et 11
  });

  it('never returns a start that overlaps an occupied span', () => {
    const occupied = [{ start: h(9, 30), end: h(10, 30) }];
    const s = findFreeStart(occupied, 60, win, 30);
    expect(s + 60 <= h(9, 30) || s >= h(10, 30)).toBe(true);
    expect(s).toBe(h(10, 30));
  });

  it('overflows right after the last slot when the window is full', () => {
    const occupied = [{ start: h(9), end: h(13) }];
    expect(findFreeStart(occupied, 60, win, 30)).toBe(h(13));
  });

  it('never goes past midnight', () => {
    const occupied = [{ start: h(9), end: h(23, 30) }];
    expect(findFreeStart(occupied, 90, win, 30)).toBe(24 * 60 - 90);
  });
});

describe('assignStartTimes', () => {
  const settings = {
    dayStartTime: '08:00',
    timelineStartHour: 7,
    timelineEndHour: 23,
    timelineStepMinutes: 30,
    dayWindows: { '5': { start: '10:00', end: '12:00' } }, // samedi 10:00-12:00
  } as unknown as AppSettings;
  const monday = '2026-10-05';
  const saturday = '2026-10-10';
  const mk = (id: string, date: string, dur: number, jIndex = 0, o: Partial<RevisionItem> = {}) =>
    rev(id, dur, { scheduledDate: date, jIndex, ...o });

  it('places a new slot at the start of the day window', () => {
    const [a] = assignStartTimes([], [mk('a', monday, 90)], settings);
    expect(a.startTime).toBe('08:00');
  });

  it('keeps a J0 of today from starting before the current time, but not other J', () => {
    const now = { date: monday, minutes: 11 * 60 + 10 };
    const out = assignStartTimes([], [mk('j0', monday, 60, 0), mk('j1', monday, 60, 1)], settings, false, now);
    const t = Object.fromEntries(out.map((r) => [r.id, r.startTime]));
    expect(t.j0).toBe('11:30');
    expect(t.j1).toBe('08:00');
  });

  it('ignores the current time for a J0 on another day', () => {
    const [a] = assignStartTimes([], [mk('a', monday, 60, 0)], settings, false, { date: '2026-10-06', minutes: 700 });
    expect(a.startTime).toBe('08:00');
  });

  it('uses the weekday-specific window', () => {
    const [a] = assignStartTimes([], [mk('a', saturday, 60)], settings);
    expect(a.startTime).toBe('10:00');
  });

  it('puts several new slots of the same day one after another, J order first', () => {
    const out = assignStartTimes([], [mk('j1', monday, 90, 1), mk('j0', monday, 90, 0)], settings);
    const t = Object.fromEntries(out.map((r) => [r.id, r.startTime]));
    expect(t).toEqual({ j0: '08:00', j1: '09:30' });
  });

  it('goes where there is room around slots already there', () => {
    const existing = [mk('x', monday, 60, 3, { startTime: '08:00' }), mk('y', monday, 60, 7, { startTime: '10:00' })];
    const [a] = assignStartTimes(existing, [mk('a', monday, 60)], settings);
    expect(a.startTime).toBe('09:00'); // le trou entre 09:00 et 10:00
  });

  it('counts existing slots without startTime as stacked from the window start', () => {
    const existing = [mk('x', saturday, 60, 3, { slotOrder: 0 })]; // empilé à 10:00 (début de la plage du samedi)
    const [a] = assignStartTimes(existing, [mk('a', saturday, 60)], settings);
    expect(a.startTime).toBe('11:00');
  });

  it('keeps the original time of a shifted slot when it is free and inside the window', () => {
    const [a] = assignStartTimes([], [mk('a', saturday, 60, 1, { startTime: '11:00' })], settings, true);
    expect(a.startTime).toBe('11:00');
  });

  it('moves a shifted slot when its original time is taken or outside the window', () => {
    const existing = [mk('x', saturday, 60, 3, { startTime: '11:00' })];
    const [taken] = assignStartTimes(existing, [mk('a', saturday, 60, 1, { startTime: '11:00' })], settings, true);
    expect(taken.startTime).toBe('10:00');
    const [outside] = assignStartTimes([], [mk('b', saturday, 60, 1, { startTime: '15:00' })], settings, true);
    expect(outside.startTime).toBe('10:00');
  });

  it('does not touch other slots and handles several days at once', () => {
    const out = assignStartTimes([], [mk('m', monday, 60), mk('s', saturday, 60)], settings);
    expect(Object.fromEntries(out.map((r) => [r.id, r.startTime]))).toEqual({ m: '08:00', s: '10:00' });
  });

  it('never double-books a day: all placed slots are disjoint', () => {
    const news = [mk('a', monday, 90, 0), mk('b', monday, 90, 1), mk('c', monday, 60, 3), mk('d', monday, 60, 7)];
    const spans = assignStartTimes([], news, settings)
      .map((r) => ({ s: h(...(r.startTime!.split(':').map(Number) as [number, number])), d: r.durationMinutes }))
      .sort((x, y) => x.s - y.s);
    expect(spans.every((x, i) => i === 0 || spans[i - 1].s + spans[i - 1].d <= x.s)).toBe(true);
  });
});

describe('computeDisplayRange with windows', () => {
  it('also covers the day windows', () => {
    expect(computeDisplayRange([], h(8), h(20), null, [{ start: h(6), end: h(22) + 30 }])).toEqual({
      displayStart: h(6),
      displayEnd: h(23),
    });
  });
});

describe('placeRevisionAtTime', () => {
  const settings = {
    dayStartTime: '08:00',
    timelineStartHour: 7,
    timelineEndHour: 23,
    timelineStepMinutes: 30,
    dayWindows: { '1': { start: '14:00', end: '17:00' } }, // mardi 14:00-17:00
  } as unknown as AppSettings;
  const tuesday = '2026-10-06';
  const mk = (id: string, date: string, dur: number, o: Partial<RevisionItem> = {}) => rev(id, dur, { scheduledDate: date, ...o });
  const startOf = (list: RevisionItem[], id: string) => list.find((r) => r.id === id)?.startTime;

  it('puts the slot exactly at the requested time (snapped to the step)', () => {
    const out = placeRevisionAtTime([mk('a', tuesday, 60)], 'a', h(14, 40), settings);
    expect(startOf(out, 'a')).toBe('14:30');
  });

  it('keeps the slot inside the day window', () => {
    expect(startOf(placeRevisionAtTime([mk('a', tuesday, 60)], 'a', h(9), settings), 'a')).toBe('14:00');
    expect(startOf(placeRevisionAtTime([mk('a', tuesday, 60)], 'a', h(20), settings), 'a')).toBe('16:00'); // 17:00 - 60 min
  });

  it('pushes the slots it lands on, and only on that day', () => {
    const list = [
      mk('x', tuesday, 60, { startTime: '14:00', slotOrder: 0 }),
      mk('y', tuesday, 60, { startTime: '15:00', slotOrder: 1 }),
      mk('a', tuesday, 60, { startTime: '16:00', slotOrder: 2 }),
      mk('other', '2026-10-07', 60, { startTime: '14:00' }),
    ];
    const out = placeRevisionAtTime(list, 'a', h(14), settings);
    expect(startOf(out, 'a')).toBe('14:00');
    expect(startOf(out, 'x')).toBe('15:00');
    expect(startOf(out, 'y')).toBe('16:00');
    expect(startOf(out, 'other')).toBe('14:00'); // un autre jour : intact
  });

  it('returns the list unchanged for an unknown id', () => {
    const list = [mk('a', tuesday, 60)];
    expect(placeRevisionAtTime(list, 'nope', h(14), settings)).toBe(list);
  });
});

describe('multi-day view settings', () => {
  it('reads the number of days, 2 to 6, default 3', () => {
    expect(getMultiDayCount({})).toBe(3);
    expect(getMultiDayCount(undefined)).toBe(3);
    expect(getMultiDayCount({ multiDayCount: 5 })).toBe(5);
    expect(getMultiDayCount({ multiDayCount: 2 })).toBe(2);
    expect(getMultiDayCount({ multiDayCount: 1 })).toBe(3);
    expect(getMultiDayCount({ multiDayCount: 7 })).toBe(3);
    expect(getMultiDayCount({ multiDayCount: 3.5 })).toBe(3);
  });

  it('merges block details with the defaults and ignores invalid values', () => {
    expect(getBlockDetails({})).toEqual(DEFAULT_BLOCK_DETAILS);
    expect(DEFAULT_BLOCK_DETAILS.subject).toBe('code');
    expect(getBlockDetails({ blockDetails: { code: true, notes: false } })).toEqual({
      subject: 'code',
      code: true,
      notes: false,
      rating: true,
    });
    expect(getBlockDetails({ blockDetails: { subject: 'x' as unknown as 'code' } })).toEqual(DEFAULT_BLOCK_DETAILS);
  });

  it('reads the subject display and upgrades the old boolean setting', () => {
    expect(getBlockDetails({ blockDetails: { subject: 'name' } }).subject).toBe('name');
    expect(getBlockDetails({ blockDetails: { subject: 'none' } }).subject).toBe('none');
    expect(getBlockDetails({ blockDetails: { subject: true } }).subject).toBe('code');
    expect(getBlockDetails({ blockDetails: { subject: false } }).subject).toBe('none');
  });

  it('builds consecutive days across month and year boundaries', () => {
    expect(consecutiveDays('2026-10-30', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(consecutiveDays('2026-12-31', 2)).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('nextMultiDayCount', () => {
  it('adds one day and wraps from 6 back to 2', () => {
    expect(nextMultiDayCount(2)).toBe(3);
    expect(nextMultiDayCount(5)).toBe(6);
    expect(nextMultiDayCount(6)).toBe(2);
  });

  it('starts from the default when the value is invalid', () => {
    expect(nextMultiDayCount(99)).toBe(4); // 99 -> défaut 3 -> 4
    expect(nextMultiDayCount(NaN)).toBe(4);
  });
});

describe('pauses (breaks)', () => {
  const lunch = [{ start: 12 * 60, end: 13 * 60 }];
  const rev = (id: string, order: number, duration: number, startTime?: string) =>
    ({ id, slotOrder: order, durationMinutes: duration, startTime } as RevisionItem);

  it('getDayBreaks : le jour remplace le commun, liste vide = aucune pause', () => {
    const settings = { breaks: { all: [{ start: '12:00', end: '13:00' }], '2': [] } };
    expect(getDayBreaks(settings, '2026-01-05')).toEqual(lunch); // lundi
    expect(getDayBreaks(settings, '2026-01-07')).toEqual([]); // mercredi
    expect(getDayBreaks({}, '2026-01-05')).toEqual([]);
    expect(getDayBreaks({ breaks: { '0': [{ start: '12:00', end: '13:00' }] } }, '2026-01-06')).toEqual([]); // mardi, pas de commun
  });

  it('resolveDayLayout repousse un créneau qui tomberait sur la pause', () => {
    const p = resolveDayLayout([rev('a', 0, 120), rev('b', 1, 60)], 10 * 60, lunch);
    expect(p).toEqual([
      { id: 'a', start: 10 * 60, end: 12 * 60 },
      { id: 'b', start: 13 * 60, end: 14 * 60 },
    ]);
  });

  it('findFreeStart saute la pause', () => {
    expect(findFreeStart([], 60, { start: 11 * 60 + 30, end: 18 * 60 }, 30, lunch)).toBe(13 * 60);
  });

  it('moveSlotInLayout : un dépôt dans la pause glisse à sa fin', () => {
    const res = moveSlotInLayout([rev('a', 0, 60)], 8 * 60, 'a', 12 * 60 + 30, lunch)!;
    expect(res[0].start).toBe(13 * 60);
  });
});

describe('jour forcé', () => {
  const base = { dayStartTime: '08:00', breaks: { all: [{ start: '12:00', end: '13:00' }] }, forcedDates: ['2026-01-05'] };

  it('ignore les pauses et élargit les limites à l\'échelle', () => {
    expect(getDayBreaks(base, '2026-01-05')).toEqual([]);
    expect(getDayBreaks(base, '2026-01-06')).toHaveLength(1);
    expect(getDayBounds(base, '2026-01-06')).toEqual({ start: 8 * 60, end: 23 * 60 });
    expect(getDayBounds(base, '2026-01-05')).toEqual({ start: 7 * 60, end: 23 * 60 });
  });

  it('dayHasLimits reste vrai quand le jour est forcé', () => {
    expect(dayHasLimits(base, '2026-01-05')).toBe(true);
    expect(dayHasLimits({ dayStartTime: '07:00' }, '2026-01-05')).toBe(false);
  });
});

describe('resizeSlotInLayout', () => {
  const r = (id: string, order: number, duration: number, startTime: string) =>
    ({ id, slotOrder: order, durationMinutes: duration, startTime } as RevisionItem);

  it('garde l\'heure de début et repousse le suivant', () => {
    const res = resizeSlotInLayout([r('a', 0, 60, '09:00'), r('b', 1, 60, '10:00')], 8 * 60, 'a', 90)!;
    expect(res).toEqual([
      { id: 'a', start: 9 * 60, end: 10 * 60 + 30 },
      { id: 'b', start: 10 * 60 + 30, end: 11 * 60 + 30 },
    ]);
  });

  it('un créneau plus court ne fait pas remonter le suivant', () => {
    const res = resizeSlotInLayout([r('a', 0, 60, '09:00'), r('b', 1, 60, '10:00')], 8 * 60, 'a', 30)!;
    expect(res[1].start).toBe(10 * 60);
  });

  it('refuse un débordement après minuit', () => {
    expect(resizeSlotInLayout([r('a', 0, 60, '23:00')], 8 * 60, 'a', 120)).toBeNull();
  });

  it('saute une pause', () => {
    const res = resizeSlotInLayout([r('a', 0, 60, '11:00')], 8 * 60, 'a', 120, [{ start: 12 * 60, end: 13 * 60 }])!;
    expect(res[0].start).toBe(13 * 60);
  });
});
