/**
 * Utility functions for date manipulation and formatting in ISO YYYY-MM-DD
 * Clean and timezone-safe.
 */

import { getLocale } from '../i18n';

export function getTodayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Millisecondes jusqu'au prochain minuit local, plus une seconde de marge (changement d'heure compris). */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime() + 1000;
}

export function parseIsoDate(isoString: string): Date {
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoString: string, days: number): string {
  const date = parseIsoDate(isoString);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

export function diffInDays(targetIso: string, sourceIso: string): number {
  const d1 = parseIsoDate(targetIso);
  const d2 = parseIsoDate(sourceIso);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function formatFrenchDate(isoString: string): string {
  const d = parseIsoDate(isoString);
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

export function formatFrenchDateFull(isoString: string): string {
  const d = parseIsoDate(isoString);
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

export function formatFrenchDayShort(isoString: string): string {
  const d = parseIsoDate(isoString);
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(d);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Returns Monday to Sunday dates (7 ISO strings) for the week containing baseIso
 */
export function getWeekDays(baseIso: string): string[] {
  const d = parseIsoDate(baseIso);
  // Day of week: Sunday = 0, Monday = 1, ..., Saturday = 6
  const dayOfWeek = d.getDay();
  // Monday offset: 0 for Mon, 1 for Tue, ..., 6 for Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  
  const week: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    week.push(formatIsoDate(cur));
  }
  return week;
}

/**
 * Returns complete calendar grid (6 weeks = 42 days) for a given year & month (1-12)
 */
export function getMonthCalendarDays(year: number, month: number): {
  iso: string;
  isCurrentMonth: boolean;
  dayNumber: number;
}[] {
  // First day of target month
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 is Sun
  const mondayOffset = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;

  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() + mondayOffset);

  const days: { iso: string; isCurrentMonth: boolean; dayNumber: number }[] = [];
  for (let i = 0; i < 35; i++) {
    const cur = new Date(startDate);
    cur.setDate(startDate.getDate() + i);
    const iso = formatIsoDate(cur);
    days.push({
      iso,
      isCurrentMonth: cur.getMonth() === month - 1,
      dayNumber: cur.getDate()
    });
  }

  // If the 35 days don't cover the full month, extend to 42
  const lastTargetMonthDay = new Date(year, month, 0).getDate();
  const coveredTargetMonthDays = days.filter(d => d.isCurrentMonth).length;
  if (coveredTargetMonthDays < lastTargetMonthDay) {
    for (let i = 35; i < 42; i++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + i);
      days.push({
        iso: formatIsoDate(cur),
        isCurrentMonth: cur.getMonth() === month - 1,
        dayNumber: cur.getDate()
      });
    }
  }

  return days;
}

/**
 * Returns the ISO 8601 week number (1-52 or 53)
 */
export function getIsoWeekNumber(isoString: string): number {
  const date = parseIsoDate(isoString);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

export function addMonths(isoString: string, months: number): string {
  const d = parseIsoDate(isoString);
  d.setDate(1); // Set to 1st to avoid overflow issue (e.g. 31 to month with 30 days)
  d.setMonth(d.getMonth() + months);
  return formatIsoDate(d);
}

export function formatMonthYear(isoString: string): string {
  const d = parseIsoDate(isoString);
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

