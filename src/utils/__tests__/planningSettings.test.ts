import { describe, expect, it } from 'vitest';
import { AppSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../seedData';
import { getBlockDetails, getDayWindow } from '../dayLayout';
import {
  PlanningValues,
  clampSlot,
  cleanBreaks,
  customWindowsFromSettings,
  planningSettingsFromValues,
  referenceDay,
  slotDurationsFromSettings,
} from '../planningSettings';

const values = (over: Partial<PlanningValues> = {}): PlanningValues => ({
  defaultPattern: [0, 1, 3, 7],
  jPool: [0, 1, 3, 7, 15],
  slotDefault: 60,
  slotByJ: { '0': 90 },
  autoCascade: true,
  dailyTargetHours: 6,
  freeAlertDays: 15,
  dayStartTime: '08:00',
  timelineStartHour: 7,
  timelineEndHour: 22,
  timelineStepMinutes: 15,
  customWindows: {},
  breaks: {},
  multiDayCount: 3,
  blockDetails: getBlockDetails(DEFAULT_SETTINGS),
  ...over,
});

describe('referenceDay', () => {
  it('gives a Monday for index 0 and a Sunday for index 6', () => {
    expect(new Date(referenceDay(0) + 'T12:00:00').getDay()).toBe(1);
    expect(new Date(referenceDay(6) + 'T12:00:00').getDay()).toBe(0);
  });
});

describe('cleanBreaks', () => {
  it('drops invalid breaks and an empty common list, keeps an empty weekday list', () => {
    expect(
      cleanBreaks({
        all: [{ start: '13:00', end: '12:00' }],
        '2': [],
        '3': [
          { start: '12:00', end: '13:00' },
          { start: '22:00', end: '23:59' },
        ],
      })
    ).toEqual({
      '2': [],
      '3': [
        { start: '12:00', end: '13:00' },
        { start: '22:00', end: '23:59' },
      ],
    });
  });
});

describe('clampSlot', () => {
  it('rounds to 5 minutes between 5 minutes and 10 hours', () => {
    expect([0, 3, 62, 63, 900, Number.NaN].map(clampSlot)).toEqual([60, 5, 60, 65, 600, 60]);
  });
});

describe('planningSettingsFromValues', () => {
  it('always keeps J0 and merges the default pattern into the pool', () => {
    const out = planningSettingsFromValues(values({ defaultPattern: [3, 1], jPool: [30] }));
    expect(out.defaultJPattern).toEqual([0, 3, 1]);
    expect(out.jPool).toEqual([0, 1, 3, 30]);
  });

  it('clamps durations and keeps the legacy fields in step', () => {
    const out = planningSettingsFromValues(values({ slotDefault: 62, slotByJ: { '0': 93, '7': 3 } }));
    expect(out.slotDurationDefault).toBe(60);
    expect(out.slotDurationByJ).toEqual({ '0': 95, '7': 5 });
    expect(out.slotDurationOthers).toBe(60);
    expect(out.slotDurationJ0J1).toBe(95);
  });

  it('stores only valid day windows that differ from the default', () => {
    const out = planningSettingsFromValues(
      values({
        customWindows: {
          '0': { start: '08:00', end: '22:00' }, // the default window: not stored
          '1': { start: '09:00', end: '18:00' },
          '2': { start: '18:00', end: '09:00' }, // invalid: ignored
        },
      })
    );
    expect(out.dayWindows).toEqual({ '1': { start: '09:00', end: '18:00' } });
  });

  it('falls back to a valid timeline when the range is inverted', () => {
    const out = planningSettingsFromValues(values({ timelineStartHour: 20, timelineEndHour: 8, timelineStepMinutes: 7 }));
    expect(out.timelineStartHour).toBe(20);
    expect(out.timelineEndHour!).toBeGreaterThan(20);
    expect(out.timelineStepMinutes).not.toBe(7);
  });

  it('round-trips through the settings it produces', () => {
    const v = values({ customWindows: { '4': { start: '10:00', end: '16:00' } }, slotByJ: { '0': 90, '15': 45 } });
    const settings = { ...DEFAULT_SETTINGS, ...planningSettingsFromValues(v) } as AppSettings;
    expect(customWindowsFromSettings(settings)).toEqual({ '4': { start: '10:00', end: '16:00' } });
    expect(getDayWindow(settings, referenceDay(4))).toEqual({ start: 600, end: 960 });
    expect(slotDurationsFromSettings(settings)).toEqual({ def: 60, byJ: { '0': 90, '15': 45 } });
  });
});

describe('free-review alert delay', () => {
  it("borne le délai d'alerte des cours libres entre 0 (jamais) et 365 jours", () => {
    expect(planningSettingsFromValues(values({ freeAlertDays: 10 })).freeAlertDays).toBe(10);
    expect(planningSettingsFromValues(values({ freeAlertDays: 0 })).freeAlertDays).toBe(0);
    expect(planningSettingsFromValues(values({ freeAlertDays: -4 })).freeAlertDays).toBe(0);
    expect(planningSettingsFromValues(values({ freeAlertDays: 900 })).freeAlertDays).toBe(365);
  });
});
