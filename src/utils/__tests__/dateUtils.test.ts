import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffInDays,
  formatMinutes,
  getIsoWeekNumber,
  getMonthCalendarDays,
  getWeekDays,
  msUntilNextDay,
} from '../dateUtils';

describe('addDays / diffInDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is stable across daylight-saving changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(diffInDays('2026-03-30', '2026-03-28')).toBe(2);
    expect(diffInDays('2026-10-26', '2026-10-24')).toBe(2);
  });

  it('diffInDays is signed and consistent with addDays', () => {
    expect(diffInDays('2026-05-10', '2026-05-01')).toBe(9);
    expect(diffInDays('2026-05-01', '2026-05-10')).toBe(-9);
    expect(diffInDays(addDays('2026-02-10', 60), '2026-02-10')).toBe(60);
  });
});

describe('formatMinutes', () => {
  it('formats hours and padded minutes', () => {
    expect(formatMinutes(0)).toBe('0h');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(90)).toBe('1h30');
    expect(formatMinutes(65)).toBe('1h05');
  });
});

describe('getWeekDays', () => {
  it('returns Monday to Sunday', () => {
    expect(getWeekDays('2026-10-09')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('puts Sunday at the end of its week, not the start of the next', () => {
    const week = getWeekDays('2026-10-11');
    expect(week[0]).toBe('2026-10-05');
    expect(week[6]).toBe('2026-10-11');
  });
});

describe('getMonthCalendarDays', () => {
  it('starts on a Monday and covers the whole month', () => {
    const days = getMonthCalendarDays(2026, 10);
    expect(days[0].iso).toBe('2026-09-28');
    expect(days.filter((d) => d.isCurrentMonth)).toHaveLength(31);
    expect(days.length === 35 || days.length === 42).toBe(true);
  });

  it('extends to 6 weeks when 5 are not enough', () => {
    // August 2026 starts on a Saturday and has 31 days: 35 cells stop on the 30th
    const days = getMonthCalendarDays(2026, 8);
    expect(days).toHaveLength(42);
    expect(days.filter((d) => d.isCurrentMonth)).toHaveLength(31);
  });

  it('keeps 5 weeks when they are enough', () => {
    // May 2026 starts on a Friday and ends on a Sunday: exactly 5 rows
    expect(getMonthCalendarDays(2026, 5)).toHaveLength(35);
  });
});

describe('getIsoWeekNumber', () => {
  it('follows ISO 8601', () => {
    expect(getIsoWeekNumber('2026-01-01')).toBe(1);
    expect(getIsoWeekNumber('2026-10-09')).toBe(41);
    expect(getIsoWeekNumber('2020-12-31')).toBe(53);
  });
});

describe('addMonths', () => {
  it('returns the first of the target month, without overflow', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01');
  });
});

describe('msUntilNextDay', () => {
  it('counts to the next local midnight plus one second', () => {
    expect(msUntilNextDay(new Date(2026, 9, 12, 23, 59, 0))).toBe(61_000);
    expect(msUntilNextDay(new Date(2026, 9, 12, 0, 0, 0))).toBe(24 * 3600_000 + 1000);
  });

  it('lands on the next day across month and year ends', () => {
    const at = (d: Date) => new Date(d.getTime() + msUntilNextDay(d));
    expect(at(new Date(2026, 9, 31, 18, 0)).getDate()).toBe(1);
    expect(at(new Date(2026, 11, 31, 18, 0)).getFullYear()).toBe(2027);
  });
});
