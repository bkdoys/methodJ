import { AppSettings, Course, MasteryLevel, RevisionItem, RevisionPeriod, Subject } from '../types';
import { addDays } from './dateUtils';
import { assignStartTimes, formatTime, getDailyTargetHours, getDayBreaks, getDayWindow, parseTime, weekdayIndex } from './dayLayout';
import { analyzeDay, DayLoad } from './dayLoad';
import { CourseConversion, convertCourseToFree, isFreeCourse, isRReview } from './jMethod';

// ---------------------------------------------------------------------------------------------
// Période de révision : des cours repassent en révision libre et reçoivent des R réparties sur la période.
// Tout est pur : l'assistant simule (rien n'est modifié) et n'applique le plan qu'à la validation.
// ---------------------------------------------------------------------------------------------

/** Au-delà, on ne propose plus d'allonger les journées : il faut allonger la période ou réduire les passages. */
export const MAX_PERIOD_HOURS = 11;
/** Durée par défaut d'une révision de la période. */
export const DEFAULT_PERIOD_SLOT_MINUTES = 60;
const MAX_PASSES = 6;
/** Recherche d'une période plus longue : au plus un an. */
const MAX_EXTRA_DAYS = 365;

/** Passages proposés selon la maîtrise : un cours fragile revient plus souvent. 0 = pas encore évalué. */
export function defaultPasses(mastery: MasteryLevel): number {
  return [2, 3, 3, 2, 1][mastery] ?? 2;
}

export const clampPasses = (n: number) => Math.max(0, Math.min(MAX_PASSES, Math.round(n)));

/** Réglages tels qu'ils seront avec cette période (elle remplace une période de même id). */
export function settingsWithPeriod<S extends Partial<AppSettings>>(settings: S, period: RevisionPeriod): S {
  return { ...settings, revisionPeriods: [...(settings.revisionPeriods ?? []).filter((p) => p.id !== period.id), period] };
}

/** Périodes déjà enregistrées qui chevauchent ces dates (refusé : une seule période par jour). */
export function overlappingPeriods(settings: Partial<AppSettings>, period: Pick<RevisionPeriod, 'id' | 'start' | 'end'>): RevisionPeriod[] {
  return (settings.revisionPeriods ?? []).filter((p) => p.id !== period.id && p.start <= period.end && period.start <= p.end);
}

/** Jours où l'on peut encore planifier : de la date de début (au plus tôt aujourd'hui) à la date de fin, inclus. */
export function periodDates(start: string, end: string, todayIso: string): string[] {
  const from = start < todayIso ? todayIso : start;
  const out: string[] = [];
  for (let d = from; d <= end && out.length <= MAX_EXTRA_DAYS * 3; d = addDays(d, 1)) out.push(d);
  return out;
}

const breakMinutesWithin = (win: { start: number; end: number }, breaks: { start: number; end: number }[]) =>
  breaks.reduce((sum, b) => sum + Math.max(0, Math.min(b.end, win.end) - Math.max(b.start, win.start)), 0);

// ---------------------------------------------------------------------------------------------
// Ce qui change dans les cours choisis
// ---------------------------------------------------------------------------------------------

export interface PeriodInput {
  courses: Course[];
  subjects: Subject[];
  revisions: RevisionItem[];
  /** Réglages habituels (sans la période en préparation). */
  settings: AppSettings;
  period: RevisionPeriod;
  /** Passages voulus par cours (id → nombre). */
  passes: Record<string, number>;
  durationMinutes: number;
  seed: number;
  todayIso: string;
}

/** Cours choisis, conversions vers la révision libre, et créneaux qui restent une fois les J à venir retirés. */
function prepare(input: PeriodInput) {
  const chosen = new Set(input.period.courseIds);
  const courses = input.courses.filter((c) => chosen.has(c.id));
  const conversions: CourseConversion[] = courses.filter((c) => !isFreeCourse(c)).map((c) => convertCourseToFree(c, input.revisions));
  const removedIds = new Set(conversions.flatMap((c) => c.removed.map((r) => r.id)));
  const remaining = input.revisions.filter((r) => !removedIds.has(r.id));
  const sim = settingsWithPeriod(input.settings, input.period);
  const dates = periodDates(input.period.start, input.period.end, input.todayIso);
  // R déjà prévues dans la période pour un cours choisi : elles comptent comme passages
  const plannedR = new Map<string, string[]>();
  remaining.forEach((r) => {
    if (chosen.has(r.courseId) && isRReview(r) && !r.completed && dates.includes(r.scheduledDate)) {
      plannedR.set(r.courseId, [...(plannedR.get(r.courseId) ?? []), r.scheduledDate]);
    }
  });
  const toAdd = (c: Course) => Math.max(0, clampPasses(input.passes[c.id] ?? defaultPasses(c.mastery)) - (plannedR.get(c.id)?.length ?? 0));
  return { courses, conversions, removedIds, remaining, sim, dates, plannedR, toAdd };
}

/** Minutes disponibles d'un jour : objectif (ou plage moins pauses, si plus court) moins ce qui y est déjà prévu. */
function dayRoom(date: string, dayRevs: RevisionItem[], settings: AppSettings) {
  const win = getDayWindow(settings, date);
  const breaks = getDayBreaks(settings, date);
  const windowNet = Math.max(0, win.end - win.start - breakMinutesWithin(win, breaks));
  const used = dayRevs.reduce((s, r) => s + r.durationMinutes, 0);
  const target = getDailyTargetHours(settings, date) * 60;
  return { free: Math.max(0, Math.min(target, windowNet) - used), room: Math.max(0, windowNet - used), used };
}

// ---------------------------------------------------------------------------------------------
// Besoin et propositions quand ça ne rentre pas
// ---------------------------------------------------------------------------------------------

export type PeriodSuggestion =
  | { kind: 'hours'; hours: number; dayWindows: Record<string, { start: string; end: string }> }
  | { kind: 'extend'; start: string; end: string; hours: number; dayWindows: Record<string, { start: string; end: string }> };

export interface PeriodNeed {
  needMinutes: number;
  freeMinutes: number;
  days: number;
  fits: boolean;
  /** Absent quand ça rentre, ou quand même un an de plus ne suffirait pas. */
  suggestion?: PeriodSuggestion;
}

/** Plages de `hours` heures de travail par jour, depuis le début habituel de chaque jour de la semaine, pauses en plus. */
export function windowsForHours(settings: AppSettings, period: RevisionPeriod, hours: number): Record<string, { start: string; end: string }> {
  const out: Record<string, { start: string; end: string }> = {};
  // Un jour de référence par jour de la semaine (le 5 janvier 2026 est un lundi) : plage habituelle, pauses de la période
  for (let w = 0; w < 7; w++) {
    const ref = addDays('2026-01-05', w);
    const probe = { ...settings, forcedDates: [], revisionPeriods: [{ ...period, start: ref, end: ref, dayWindows: undefined }] };
    const win = getDayWindow(probe, ref);
    const breaks = getDayBreaks(probe, ref);
    let end = win.start + hours * 60;
    // Les pauses qui tombent dans la plage la rallongent d'autant
    for (const b of breaks) if (b.start < end && b.end > win.start) end += Math.min(b.end, end) - Math.max(b.start, win.start);
    out[String(w)] = { start: formatTime(win.start), end: end >= 24 * 60 ? '23:59' : formatTime(end) };
  }
  return out;
}

function freeWith(input: PeriodInput, period: RevisionPeriod, remaining: RevisionItem[]): { free: number; days: number } {
  const sim = settingsWithPeriod(input.settings, period);
  const dates = periodDates(period.start, period.end, input.todayIso);
  const byDate = groupByDate(remaining);
  return { free: dates.reduce((s, d) => s + dayRoom(d, byDate.get(d) ?? [], sim).free, 0), days: dates.length };
}

/**
 * Temps nécessaire contre temps disponible. Quand ça ne rentre pas : d'abord des journées plus longues (le minimum
 * nécessaire, par demi-heure, jusqu'à `MAX_PERIOD_HOURS`), puis, à 11 h, une période plus longue (début plus tôt
 * tant que ce n'est pas avant aujourd'hui, puis fin plus tard), calculée au plus juste.
 */
export function estimateNeed(input: PeriodInput): PeriodNeed {
  const { courses, remaining, toAdd } = prepare(input);
  const needMinutes = courses.reduce((s, c) => s + toAdd(c) * input.durationMinutes, 0);
  const current = freeWith(input, input.period, remaining);
  const base: PeriodNeed = { needMinutes, freeMinutes: current.free, days: current.days, fits: needMinutes <= current.free };
  if (base.fits || needMinutes === 0) return base;

  const currentHours = Math.max(1, ...periodDates(input.period.start, input.period.end, input.todayIso).map((d) =>
    getDailyTargetHours(settingsWithPeriod(input.settings, input.period), d)
  ));
  for (let h = Math.ceil(currentHours * 2) / 2; h <= MAX_PERIOD_HOURS; h += 0.5) {
    const dayWindows = windowsForHours(input.settings, input.period, h);
    if (freeWith(input, { ...input.period, dayWindows, targetHours: h }, remaining).free >= needMinutes) {
      return { ...base, suggestion: { kind: 'hours', hours: h, dayWindows } };
    }
  }

  const dayWindows = windowsForHours(input.settings, input.period, MAX_PERIOD_HOURS);
  const long = { ...input.period, dayWindows, targetHours: MAX_PERIOD_HOURS };
  let { start, end } = long;
  for (let i = 0; i < MAX_EXTRA_DAYS; i++) {
    if (start > input.todayIso) start = addDays(start, -1);
    else end = addDays(end, 1);
    if (freeWith(input, { ...long, start, end }, remaining).free >= needMinutes) {
      return { ...base, suggestion: { kind: 'extend', start, end, hours: MAX_PERIOD_HOURS, dayWindows } };
    }
  }
  return base;
}

// ---------------------------------------------------------------------------------------------
// Répartition
// ---------------------------------------------------------------------------------------------

export interface PeriodDaySummary {
  date: string;
  load: DayLoad;
  /** Nouvelles révisions du jour, par discipline. */
  added: { subjectId: string; count: number }[];
}

export interface PeriodPlan {
  /** Cours en méthode des J qui passent en révision libre (leurs J à venir sont retirés). */
  conversions: CourseConversion[];
  /** Nouvelles R, avec date et heure. */
  added: RevisionItem[];
  /** Passages qui n'ont trouvé aucune place (période trop courte ou trop chargée). */
  unresolved: { courseId: string; count: number }[];
  days: PeriodDaySummary[];
  /** Tous les créneaux après application (pour l'aperçu). */
  revisions: RevisionItem[];
  /** Réglages après application (période comprise). */
  settings: AppSettings;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function groupByDate(revs: RevisionItem[]): Map<string, RevisionItem[]> {
  const m = new Map<string, RevisionItem[]>();
  revs.forEach((r) => {
    const l = m.get(r.scheduledDate);
    if (l) l.push(r);
    else m.set(r.scheduledDate, [r]);
  });
  return m;
}

/**
 * Ordre de passage entrelacé : les cours d'une même discipline (puis d'un même dossier) sont regroupés, puis on
 * prend tour à tour un cours de chaque discipline. La graine mélange l'ordre des disciplines et des cours.
 */
export function interleaveCourses(courses: Course[], seed: number): Course[] {
  const rnd = rng(seed);
  const groups = new Map<string, Course[]>();
  courses.forEach((c) => groups.set(c.subjectId, [...(groups.get(c.subjectId) ?? []), c]));
  const lists = [...groups.values()]
    .map((list) =>
      list
        // Un dossier reste groupé ; la graine fait tourner le point de départ dans la discipline
        .map((c) => ({ c, k: `${c.folderId ?? ''}\u0000${c.title}` }))
        .sort((a, b) => a.k.localeCompare(b.k))
        .map((x) => x.c)
    )
    .map((list) => (seed === 0 ? list : rotate(list, Math.floor(rnd() * list.length))))
    .map((list) => ({ list, r: rnd() }))
    .sort((a, b) => b.list.length - a.list.length || a.r - b.r)
    .map((x) => x.list);
  const out: Course[] = [];
  for (let i = 0; out.length < courses.length; i++) lists.forEach((l) => i < l.length && out.push(l[i]));
  return out;
}

const rotate = <T,>(list: T[], n: number) => [...list.slice(n), ...list.slice(0, n)];

/**
 * Répartit les passages de chaque cours sur la période :
 * - cibles régulières (pas = jours / passages), décalées d'un cours à l'autre selon l'ordre entrelacé, si bien que le
 *   dernier passage tombe près de la fin (de l'examen) et que les disciplines alternent ;
 * - pour chaque passage, dans l'ordre des cibles, le jour proche de la cible qui coûte le moins : dépasser l'objectif
 *   (fort), s'éloigner de la cible, un jour déjà chargé (lissage), entasser une même discipline (au-delà de sa part du jour), plus un peu de hasard ;
 * - deux passages d'un même cours sont toujours séparés d'au moins la moitié du pas ;
 * - sans place dans l'objectif, on prend le jour le moins chargé dont la plage a encore la place, sinon le passage
 *   est signalé comme sans place.
 * Même graine, mêmes entrées : même plan. Les entrées ne sont jamais modifiées.
 */
export function planRevisionPeriod(input: PeriodInput): PeriodPlan {
  const { courses, conversions, remaining, sim, dates, plannedR, toAdd } = prepare(input);
  const D = dates.length;
  const dur = input.durationMinutes;
  const byDate = groupByDate(remaining);
  const rooms = dates.map((d) => dayRoom(d, byDate.get(d) ?? [], sim));
  const used = dates.map(() => 0);
  const subjectOnDay = dates.map(() => new Map<string, number>());
  const rnd = rng(input.seed * 7919 + 1);

  const ordered = interleaveCourses(courses, input.seed);
  const totalBySubject = new Map<string, number>();
  ordered.forEach((c) => totalBySubject.set(c.subjectId, (totalBySubject.get(c.subjectId) ?? 0) + toAdd(c)));

  type Pass = { course: Course; target: number; step: number };
  const passes: Pass[] = [];
  ordered.forEach((c, rank) => {
    const n = toAdd(c);
    if (n === 0 || D === 0) return;
    const step = D / n;
    const offset = ((rank + 0.5) / ordered.length) * step;
    for (let k = 0; k < n; k++) passes.push({ course: c, target: Math.min(D - 1, offset + k * step), step });
  });
  passes.sort((a, b) => a.target - b.target);

  // Jours occupés par cours (R déjà prévues comprises, pour l'écart) et jours des nouveaux passages
  const busyDays = new Map<string, number[]>();
  const newDays = new Map<string, number[]>();
  courses.forEach((c) => {
    busyDays.set(c.id, (plannedR.get(c.id) ?? []).map((d) => dates.indexOf(d)));
    newDays.set(c.id, []);
  });
  const unresolved = new Map<string, number>();

  for (const p of passes) {
    const own = busyDays.get(p.course.id)!;
    const minGap = Math.max(1, Math.floor(p.step / 2));
    const cap = Math.ceil((totalBySubject.get(p.course.subjectId) ?? 0) / Math.max(1, D));
    const allowed = (d: number) => own.every((o) => Math.abs(o - d) >= minGap);
    const cost = (d: number) => {
      const over = Math.max(0, used[d] + dur - rooms[d].free);
      const same = subjectOnDay[d].get(p.course.subjectId) ?? 0;
      // Lissage : à écart égal, le jour le moins chargé (créneaux déjà prévus compris)
      const load = (rooms[d].used + used[d]) / 60;
      return (over > 0 ? 1000 + over : 0) + Math.abs(d - p.target) * 6 + load * 8 + (same >= cap ? 60 * (same - cap + 1) : same * 4) + rnd() * 3;
    };
    const near = (d: number) => Math.abs(d - p.target) <= Math.max(1, p.step / 2);
    const all = dates.map((_, d) => d).filter(allowed);
    const inBudget = all.filter((d) => used[d] + dur <= rooms[d].free);
    const pool = inBudget.filter(near).length ? inBudget.filter(near) : inBudget.length ? inBudget : all.filter((d) => used[d] + dur <= rooms[d].room);
    if (pool.length === 0) {
      unresolved.set(p.course.id, (unresolved.get(p.course.id) ?? 0) + 1);
      continue;
    }
    const best = pool.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    used[best] += dur;
    subjectOnDay[best].set(p.course.subjectId, (subjectOnDay[best].get(p.course.subjectId) ?? 0) + 1);
    own.push(best);
    newDays.get(p.course.id)!.push(best);
  }

  // Créneaux R, numérotés à la suite de ceux du cours, puis placés à la première place libre de leur jour
  const rawAdded: RevisionItem[] = [];
  courses.forEach((c) => {
    let n = Math.max(0, ...input.revisions.filter((r) => r.courseId === c.id && isRReview(r)).map((r) => r.jIndex));
    [...newDays.get(c.id)!].sort((a, b) => a - b).forEach((d) => {
      n += 1;
      rawAdded.push({
        id: `rev_${c.id}_r${n}_${Math.floor(rnd() * 36 ** 7).toString(36)}`,
        courseId: c.id,
        kind: 'R',
        jIndex: n,
        scheduledDate: dates[d],
        durationMinutes: dur,
        completed: false,
        slotOrder: 0,
      });
    });
  });
  // Ordre dans la journée : on alterne les disciplines plutôt que de suivre les numéros
  const dayRank = new Map(ordered.map((c, i) => [c.id, i]));
  const withOrder = rawAdded
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || dayRank.get(a.courseId)! - dayRank.get(b.courseId)!)
    .map((r, i, arr) => ({ ...r, slotOrder: (byDate.get(r.scheduledDate)?.length ?? 0) + arr.slice(0, i).filter((x) => x.scheduledDate === r.scheduledDate).length }));
  const added = placeInOrder(remaining, withOrder, sim);

  const finalRevisions = [...remaining, ...added];
  const finalByDate = groupByDate(finalRevisions);
  const subjectOf = new Map(input.courses.map((c) => [c.id, c.subjectId]));
  const days = dates.map((date) => {
    const counts = new Map<string, number>();
    added.filter((r) => r.scheduledDate === date).forEach((r) => {
      const s = subjectOf.get(r.courseId) ?? '';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    });
    return {
      date,
      load: analyzeDay(date, finalByDate.get(date) ?? [], sim),
      added: [...counts].map(([subjectId, count]) => ({ subjectId, count })),
    };
  });

  return {
    conversions,
    added,
    unresolved: [...unresolved].map(([courseId, count]) => ({ courseId, count })),
    days,
    revisions: finalRevisions,
    settings: sim,
  };
}

/** `assignStartTimes` place par numéro de J : ici on garde l'ordre voulu en plaçant les créneaux un par un. */
function placeInOrder(existing: RevisionItem[], incoming: RevisionItem[], settings: AppSettings): RevisionItem[] {
  const out: RevisionItem[] = [];
  for (const r of incoming) {
    const [placed] = assignStartTimes([...existing, ...out], [r], settings);
    out.push(placed);
  }
  return out;
}

/** Plage habituelle d'un jour de la semaine, en texte (pré-remplissage de l'assistant). */
export function usualDayWindows(settings: AppSettings): Record<string, { start: string; end: string }> {
  const out: Record<string, { start: string; end: string }> = {};
  const usual = { ...settings, revisionPeriods: [] };
  for (let w = 0; w < 7; w++) {
    const ref = addDays('2026-01-05', w);
    const win = getDayWindow(usual, ref);
    out[String(weekdayIndex(ref))] = { start: formatTime(win.start), end: win.end >= 24 * 60 ? '23:59' : formatTime(win.end) };
  }
  return out;
}

/** Heures de travail d'une plage, pauses déduites (affichage). */
export function netWindowMinutes(win: { start: string; end: string }, breaks: { start: string; end: string }[]): number {
  const s = parseTime(win.start) ?? 0;
  const e = win.end === '23:59' ? 24 * 60 : parseTime(win.end) ?? 0;
  const bs = breaks.map((b) => ({ start: parseTime(b.start) ?? 0, end: b.end === '23:59' ? 24 * 60 : parseTime(b.end) ?? 0 }));
  return Math.max(0, e - s - breakMinutesWithin({ start: s, end: e }, bs));
}
