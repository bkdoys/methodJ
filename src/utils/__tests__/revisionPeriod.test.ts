import { describe, expect, it } from 'vitest';
import { AppSettings, Course, MasteryLevel, RevisionItem, RevisionPeriod, Subject } from '../../types';
import { DEFAULT_SETTINGS } from '../seedData';
import { addDays } from '../dateUtils';
import { getDailyTargetHours, getDayBreaks, getDayWindow } from '../dayLayout';
import { analyzeDay } from '../dayLoad';
import { generateRevisionsForCourse } from '../jMethod';
import {
  daysToExam,
  defaultPasses,
  estimateNeed,
  getPeriodPrompt,
  interleaveCourses,
  MAX_PERIOD_HOURS,
  overlappingPeriods,
  PeriodInput,
  planRevisionPeriod,
  shouldOfferPeriod,
} from '../revisionPeriod';

const TODAY = '2026-11-02'; // un lundi
const settings: AppSettings = { ...DEFAULT_SETTINGS, dailyTargetHours: 6, breaks: { all: [{ start: '12:00', end: '13:00' }] } };

const subject = (id: string): Subject => ({ id, name: id, code: id, color: '#000', bgColor: '', textColor: '', borderColor: '', accentBg: '' });
const course = (id: string, subjectId: string, mastery: MasteryLevel = 2, mode?: 'free'): Course => ({
  id,
  title: id,
  itemCode: id,
  subjectId,
  j0Date: '2026-10-01',
  activeJList: mode ? [] : [0, 1, 3, 7, 15, 30, 60],
  mastery,
  createdAt: '2026-10-01',
  ...(mode ? { mode } : {}),
});

const subjects = ['cardio', 'pneumo', 'neuro', 'gastro'].map(subject);
const courses = subjects.flatMap((s) => [1, 2, 3, 4].map((i) => course(`${s.id}${i}`, s.id, ((i % 4) + 1) as MasteryLevel)));

function jRevisions(list: Course[]): RevisionItem[] {
  // Cycle commencé le 1er octobre : J0…J30 faits, J60 à venir (fin novembre)
  return list.flatMap((c) =>
    generateRevisionsForCourse(c.id, c.j0Date, c.activeJList, settings).map((r) => ({ ...r, completed: r.scheduledDate < TODAY }))
  );
}

const period = (over: Partial<RevisionPeriod> = {}): RevisionPeriod => ({
  id: 'p1',
  name: 'Partiels',
  start: TODAY,
  end: addDays(TODAY, 20),
  courseIds: courses.map((c) => c.id),
  createdAt: TODAY,
  ...over,
});

const input = (over: Partial<PeriodInput> = {}): PeriodInput => ({
  courses,
  subjects,
  revisions: jRevisions(courses),
  settings,
  period: period(),
  passes: {},
  durationMinutes: 60,
  seed: 1,
  todayIso: TODAY,
  ...over,
});

describe('revision period constraints', () => {
  it('applies the period window, breaks and target only within its dates', () => {
    const p = period({ dayWindows: { '0': { start: '07:00', end: '19:00' } }, breaks: [], targetHours: 9 });
    const s = { ...settings, revisionPeriods: [p] };
    expect(getDayWindow(s, TODAY)).toEqual({ start: 7 * 60, end: 19 * 60 });
    expect(getDayBreaks(s, TODAY)).toEqual([]);
    expect(getDailyTargetHours(s, TODAY)).toBe(9);
    const after = addDays(p.end, 1);
    expect(getDayWindow(s, after)).toEqual(getDayWindow(settings, after));
    expect(getDayBreaks(s, after)).toEqual([{ start: 720, end: 780 }]);
    expect(getDailyTargetHours(s, after)).toBe(6);
    // Un jour de semaine sans plage propre à la période garde la plage habituelle
    expect(getDayWindow(s, addDays(TODAY, 1))).toEqual(getDayWindow(settings, addDays(TODAY, 1)));
    expect(analyzeDay(TODAY, [], s).targetMinutes).toBe(9 * 60);
  });

  it('detects overlapping periods', () => {
    const s = { ...settings, revisionPeriods: [period()] };
    expect(overlappingPeriods(s, { id: 'p2', start: addDays(TODAY, 20), end: addDays(TODAY, 30) })).toHaveLength(1);
    expect(overlappingPeriods(s, { id: 'p2', start: addDays(TODAY, 21), end: addDays(TODAY, 30) })).toHaveLength(0);
    expect(overlappingPeriods(s, { id: 'p1', start: TODAY, end: TODAY })).toHaveLength(0);
  });
});

describe('planRevisionPeriod', () => {
  it('proposes more passes for weaker courses', () => {
    expect(defaultPasses(1)).toBeGreaterThan(defaultPasses(4));
    expect(defaultPasses(0)).toBe(2);
  });

  it('converts J courses to free mode, keeps done slots and adds numbered R', () => {
    const inp = input();
    const plan = planRevisionPeriod(inp);
    expect(plan.conversions).toHaveLength(courses.length);
    expect(plan.conversions.every((c) => c.course.mode === 'free' && c.course.activeJList.length === 0)).toBe(true);
    expect(plan.revisions.some((r) => !r.completed && r.kind !== 'R')).toBe(false);
    expect(plan.revisions.filter((r) => r.completed)).toHaveLength(inp.revisions.filter((r) => r.completed).length);
    const expected = courses.reduce((s, c) => s + defaultPasses(c.mastery), 0);
    expect(plan.added).toHaveLength(expected);
    expect(plan.unresolved).toEqual([]);
    for (const c of courses) {
      const own = plan.added.filter((r) => r.courseId === c.id).sort((a, b) => a.jIndex - b.jIndex);
      expect(own.map((r) => r.jIndex)).toEqual(own.map((_, i) => i + 1));
      expect(own.every((r) => r.kind === 'R' && r.durationMinutes === 60 && r.startTime)).toBe(true);
    }
  });

  it('never modifies its inputs', () => {
    const inp = input();
    const frozen = JSON.stringify(inp);
    planRevisionPeriod(inp);
    estimateNeed(inp);
    expect(JSON.stringify(inp)).toBe(frozen);
  });

  it('keeps every slot inside the period, spaced, and within the daily target', () => {
    const plan = planRevisionPeriod(input());
    const p = period();
    for (const r of plan.added) {
      expect(r.scheduledDate >= p.start && r.scheduledDate <= p.end).toBe(true);
    }
    for (const c of courses) {
      const days = plan.added.filter((r) => r.courseId === c.id).map((r) => r.scheduledDate).sort();
      for (let i = 1; i < days.length; i++) expect(days[i] > days[i - 1]).toBe(true);
      // Le dernier passage tombe dans la seconde moitié de la période (proche de l'examen)
      if (days.length > 1) expect(days[days.length - 1] >= addDays(p.start, 10)).toBe(true);
    }
    expect(plan.days.every((d) => !d.load.overloaded && d.load.overflowIds.length === 0)).toBe(true);
  });

  it('spreads each discipline over the days instead of stacking it', () => {
    const plan = planRevisionPeriod(input());
    const maxSameSubject = Math.max(...plan.days.flatMap((d) => d.added.map((a) => a.count)));
    expect(maxSameSubject).toBeLessThanOrEqual(2);
    // Plusieurs disciplines se partagent les jours chargés
    const busy = plan.days.filter((d) => d.added.reduce((s, a) => s + a.count, 0) >= 2);
    expect(busy.every((d) => d.added.length >= 2)).toBe(true);
  });

  it('is reproducible with the same seed and changes with another one', () => {
    const a = planRevisionPeriod(input({ seed: 3 })).added.map((r) => `${r.courseId}@${r.scheduledDate}`);
    const b = planRevisionPeriod(input({ seed: 3 })).added.map((r) => `${r.courseId}@${r.scheduledDate}`);
    const c = planRevisionPeriod(input({ seed: 4 })).added.map((r) => `${r.courseId}@${r.scheduledDate}`);
    expect(a.sort()).toEqual(b.sort());
    expect(c.sort()).not.toEqual(a.sort());
  });

  it('counts the pending R of a free course as passes already planned', () => {
    const free = course('free1', 'cardio', 2, 'free');
    const existing: RevisionItem = {
      id: 'r_free', courseId: 'free1', kind: 'R', jIndex: 4, scheduledDate: addDays(TODAY, 2), durationMinutes: 60, completed: false, slotOrder: 0,
    };
    const plan = planRevisionPeriod(input({
      courses: [free], revisions: [existing], period: period({ courseIds: ['free1'] }), passes: { free1: 3 },
    }));
    expect(plan.conversions).toEqual([]);
    expect(plan.added.map((r) => r.jIndex)).toEqual([5, 6]);
    expect(plan.added.every((r) => r.scheduledDate !== existing.scheduledDate)).toBe(true);
  });

  it('reports passes that find no room', () => {
    const plan = planRevisionPeriod(input({ period: period({ end: TODAY }), passes: Object.fromEntries(courses.map((c) => [c.id, 3])) }));
    const placed = plan.added.length;
    const missing = plan.unresolved.reduce((s, u) => s + u.count, 0);
    expect(placed + missing).toBe(courses.length * 3);
    expect(missing).toBeGreaterThan(0);
  });
});

describe('estimateNeed', () => {
  it('makes no suggestion when the usual settings are enough', () => {
    const need = estimateNeed(input());
    expect(need.fits).toBe(true);
    expect(need.suggestion).toBeUndefined();
  });

  it('suggests the smallest longer day, up to 11 h', () => {
    // 16 cours × 3 h sur 5 jours = 48 h, 6 h/jour ne suffisent pas, 10 h oui
    const need = estimateNeed(input({ period: period({ end: addDays(TODAY, 4) }), passes: Object.fromEntries(courses.map((c) => [c.id, 3])), revisions: [] }));
    expect(need.fits).toBe(false);
    expect(need.suggestion?.kind).toBe('hours');
    if (need.suggestion?.kind !== 'hours') return;
    expect(need.suggestion.hours).toBe(10);
    // La pause de midi rallonge la plage : 8 h + 10 h + 1 h = 19 h
    expect(need.suggestion.dayWindows['0']).toEqual({ start: '08:00', end: '19:00' });
  });

  it('suggests a longer period when 11 h a day is not enough', () => {
    const need = estimateNeed(input({ period: period({ end: addDays(TODAY, 2) }), passes: Object.fromEntries(courses.map((c) => [c.id, 3])), revisions: [] }));
    expect(need.suggestion?.kind).toBe('extend');
    if (need.suggestion?.kind !== 'extend') return;
    expect(need.suggestion.hours).toBe(MAX_PERIOD_HOURS);
    // 48 h à 11 h/jour : 5 jours, la période commence aujourd'hui, donc elle finit plus tard
    expect(need.suggestion.start).toBe(TODAY);
    expect(need.suggestion.end).toBe(addDays(TODAY, 4));
  });
});

describe('interleaveCourses', () => {
  it('alternates disciplines', () => {
    const order = interleaveCourses(courses, 0).map((c) => c.subjectId);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});

describe('when to offer the period', () => {
  const at = (days: number) => addDays(TODAY, days);

  it('counts the days to the exam, null without a valid future date', () => {
    expect(daysToExam({ examDate: at(20) }, TODAY)).toBe(20);
    expect(daysToExam({ examDate: undefined }, TODAY)).toBeNull();
    expect(daysToExam({ examDate: '20/05/2027' }, TODAY)).toBeNull();
    expect(daysToExam({ examDate: TODAY }, TODAY)).toBeNull();
    expect(daysToExam({ examDate: at(-3) }, TODAY)).toBeNull();
  });

  it('normalises the prompt settings', () => {
    expect(getPeriodPrompt({})).toEqual({ mode: 'auto', weeks: 8 });
    expect(getPeriodPrompt({ periodPrompt: 'always', periodPromptWeeks: 12 })).toEqual({ mode: 'always', weeks: 12 });
    expect(getPeriodPrompt({ periodPrompt: 'nope' as never, periodPromptWeeks: 0 })).toEqual({ mode: 'auto', weeks: 1 });
    expect(getPeriodPrompt({ periodPromptWeeks: 99 }).weeks).toBe(26);
    expect(getPeriodPrompt({ periodPromptWeeks: NaN }).weeks).toBe(8);
  });

  it('auto: offers it only within the lead time before the exam', () => {
    expect(shouldOfferPeriod({ examDate: undefined }, TODAY)).toBe(false);
    expect(shouldOfferPeriod({ examDate: at(20) }, TODAY)).toBe(true);
    expect(shouldOfferPeriod({ examDate: at(56) }, TODAY)).toBe(true);
    expect(shouldOfferPeriod({ examDate: at(57) }, TODAY)).toBe(false);
    expect(shouldOfferPeriod({ examDate: at(100) }, TODAY)).toBe(false);
    expect(shouldOfferPeriod({ examDate: TODAY }, TODAY)).toBe(false);
    expect(shouldOfferPeriod({ examDate: at(-5) }, TODAY)).toBe(false);
    expect(shouldOfferPeriod({ examDate: at(80), periodPromptWeeks: 12 }, TODAY)).toBe(true);
    expect(shouldOfferPeriod({ examDate: at(85), periodPromptWeeks: 12 }, TODAY)).toBe(false);
  });

  it('always / never ignore the exam date', () => {
    expect(shouldOfferPeriod({ examDate: undefined, periodPrompt: 'always' }, TODAY)).toBe(true);
    expect(shouldOfferPeriod({ examDate: at(300), periodPrompt: 'always' }, TODAY)).toBe(true);
    expect(shouldOfferPeriod({ examDate: at(5), periodPrompt: 'never' }, TODAY)).toBe(false);
  });
});
