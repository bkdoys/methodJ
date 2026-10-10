import { AppSettings, RevisionItem } from '../types';
import { addDays, parseIsoDate } from './dateUtils';

export interface TimelineConfig {
  startHour: number;
  endHour: number;
  stepMinutes: number;
}

export const STEP_OPTIONS = [5, 10, 15, 30, 60];
export const DEFAULT_TIMELINE: TimelineConfig = { startHour: 7, endHour: 23, stepMinutes: 30 };
const DAY_MINUTES = 24 * 60;

/** Réglages de l'échelle, avec valeurs par défaut si absents ou invalides (ex. réglages cloud anciens). */
export function getTimelineConfig(
  s?: Partial<Pick<AppSettings, 'timelineStartHour' | 'timelineEndHour' | 'timelineStepMinutes'>>
): TimelineConfig {
  const isHour = (n: unknown, min: number, max: number): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
  const startHour = isHour(s?.timelineStartHour, 0, 23) ? s!.timelineStartHour! : DEFAULT_TIMELINE.startHour;
  const endHour = isHour(s?.timelineEndHour, startHour + 1, 24)
    ? s!.timelineEndHour!
    : Math.min(24, Math.max(startHour + 1, DEFAULT_TIMELINE.endHour));
  const stepMinutes = STEP_OPTIONS.includes(s?.timelineStepMinutes as number)
    ? (s!.timelineStepMinutes as number)
    : DEFAULT_TIMELINE.stepMinutes;
  return { startHour, endHour, stepMinutes };
}

/** « 14:30 » → 870 ; null si invalide. */
export function parseTime(t: string | undefined | null): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 870 → « 14:30 » (24:00 s'écrit 00:00). */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const snapToStep = (minutes: number, step: number) => Math.round(minutes / step) * step;

export interface Placement {
  id: string;
  start: number; // minutes depuis minuit
  end: number;
}

const byOrder = (a: RevisionItem, b: RevisionItem) => a.slotOrder - b.slotOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Place les créneaux d'une journée. Un créneau avec `startTime` valide garde cette heure ;
 * les autres s'empilent à la suite depuis `dayStartMinutes` (dans l'ordre `slotOrder`, sans pause).
 * Aucun chevauchement n'est jamais renvoyé : un créneau en collision est repoussé après le précédent.
 */
export function resolveDayLayout(revs: RevisionItem[], dayStartMinutes: number): Placement[] {
  let cumulative = dayStartMinutes;
  const provisional = [...revs].sort(byOrder).map((r) => {
    const explicit = parseTime(r.startTime);
    let start: number;
    if (explicit !== null) {
      start = explicit;
    } else {
      start = cumulative;
      cumulative += r.durationMinutes;
    }
    return { r, start };
  });
  provisional.sort((a, b) => a.start - b.start || byOrder(a.r, b.r));

  let cursor = 0;
  return provisional.map(({ r, start }) => {
    const s = Math.max(start, cursor);
    cursor = s + r.durationMinutes;
    return { id: r.id, start: s, end: cursor };
  });
}

/**
 * Déplace un créneau à `targetStart` ; le créneau déposé garde sa place, ceux qu'il chevauche sont
 * repoussés plus tard (en cascade). Renvoie null si le résultat dépasserait minuit.
 */
export function moveSlotInLayout(
  revs: RevisionItem[],
  dayStartMinutes: number,
  id: string,
  targetStart: number
): Placement[] | null {
  const base = resolveDayLayout(revs, dayStartMinutes);
  const moved = revs.find((r) => r.id === id);
  if (!moved) return base;
  const T = Math.max(0, targetStart);
  const result: Placement[] = [{ id, start: T, end: T + moved.durationMinutes }];
  let cursor = T + moved.durationMinutes;

  for (const p of base) {
    if (p.id === id) continue;
    if (p.end <= T) {
      result.push(p); // entièrement avant le point de dépôt : inchangé
      continue;
    }
    const start = Math.max(p.start, cursor);
    cursor = start + (p.end - p.start);
    result.push({ id: p.id, start, end: cursor });
  }

  if (result.some((p) => p.end > DAY_MINUTES)) return null;
  return result.sort((a, b) => a.start - b.start);
}

/** Données à enregistrer : heure de début explicite et rang, pour toute la journée. */
export function placementsToUpdates(placements: Placement[]): { id: string; startTime: string; slotOrder: number }[] {
  return [...placements]
    .sort((a, b) => a.start - b.start)
    .map((p, index) => ({ id: p.id, startTime: formatTime(p.start), slotOrder: index }));
}

/**
 * Plage affichée sur l'échelle : la plage choisie dans les préférences, élargie à l'heure pleine pour
 * qu'aucun créneau (ni la disposition en cours de glisser, `extraEnd`) ne soit coupé.
 */
export function computeDisplayRange(
  placements: { start: number; end: number }[],
  cfgStartMinutes: number,
  cfgEndMinutes: number,
  extraEnd?: number | null,
  windows: { start: number; end: number }[] = []
): { displayStart: number; displayEnd: number } {
  const starts = [...placements.map((p) => p.start), ...windows.map((w) => w.start)];
  const ends = [...placements.map((p) => p.end), ...windows.map((w) => w.end)];
  const minStart = starts.length ? Math.min(...starts) : cfgStartMinutes;
  const maxEnd = Math.max(ends.length ? Math.max(...ends) : cfgEndMinutes, extraEnd ?? 0);
  return {
    displayStart: Math.min(cfgStartMinutes, Math.floor(minStart / 60) * 60),
    displayEnd: Math.max(cfgEndMinutes, Math.ceil(maxEnd / 60) * 60),
  };
}

/** Hauteur d'une heure sur l'échelle, en pixels : paliers du réglage « − / + ». */
export const HOUR_HEIGHT_STEPS = [48, 60, 72, 90, 108, 132, 160, 200];
export const DEFAULT_HOUR_HEIGHT = 108;

/** Ramène une valeur (ex. ancienne valeur mémorisée) au palier valide le plus proche. */
export function normalizeHourHeight(value: unknown): number {
  const n = typeof value === 'number' ? value : value === null || value === undefined || value === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_HOUR_HEIGHT;
  return HOUR_HEIGHT_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), HOUR_HEIGHT_STEPS[0]);
}

/** Palier suivant (+1) ou précédent (−1), borné aux extrémités. */
export function stepHourHeight(current: number, direction: -1 | 1): number {
  const i = HOUR_HEIGHT_STEPS.indexOf(normalizeHourHeight(current));
  return HOUR_HEIGHT_STEPS[Math.min(HOUR_HEIGHT_STEPS.length - 1, Math.max(0, i + direction))];
}

// ---------------------------------------------------------------------------------------------
// Plages horaires autorisées par jour de la semaine + placement automatique des créneaux
// ---------------------------------------------------------------------------------------------

export interface DayWindow {
  start: number; // minutes depuis minuit
  end: number;
}

/** 0 = lundi … 6 = dimanche. */
export function weekdayIndex(dateIso: string): number {
  return (parseIsoDate(dateIso).getDay() + 6) % 7;
}

/**
 * Plage où l'on accepte de travailler ce jour-là : celle des préférences pour ce jour de la semaine,
 * sinon de l'heure de début par défaut à la fin de l'échelle. Toujours valide (fin après début).
 */
export function getDayWindow(
  settings: Partial<Pick<AppSettings, 'dayStartTime' | 'dayWindows' | 'timelineStartHour' | 'timelineEndHour' | 'timelineStepMinutes'>>,
  dateIso: string
): DayWindow {
  const cfg = getTimelineConfig(settings);
  const defStart = parseTime(settings.dayStartTime) ?? 8 * 60;
  const defEnd = Math.max(cfg.endHour * 60, defStart + 60);
  const fallback: DayWindow = { start: defStart, end: Math.min(defEnd, DAY_MINUTES) };

  const custom = settings.dayWindows?.[String(weekdayIndex(dateIso))];
  if (!custom) return fallback;
  const start = parseTime(custom.start);
  // « 23:59 » (champ heure du navigateur) vaut minuit
  const end = custom.end === '23:59' ? DAY_MINUTES : parseTime(custom.end);
  return start !== null && end !== null && end > start ? { start, end } : fallback;
}

/** Plage par défaut, pour les préférences (jour sans plage personnalisée). */
export function defaultDayWindowStrings(
  settings: Partial<Pick<AppSettings, 'dayStartTime' | 'timelineStartHour' | 'timelineEndHour' | 'timelineStepMinutes'>>
): { start: string; end: string } {
  const w = getDayWindow({ ...settings, dayWindows: {} }, '2026-01-05'); // un lundi : seule la valeur par défaut compte
  return { start: formatTime(w.start), end: w.end >= DAY_MINUTES ? '23:59' : formatTime(w.end) };
}

type Span = { start: number; end: number };
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * Première place libre dans la plage, en avançant par pas. Si la plage est pleine, le créneau est posé
 * juste après le dernier créneau (au mieux, avant minuit) : il déborde de la plage plutôt que d'être perdu.
 */
export function findFreeStart(occupied: Span[], duration: number, win: DayWindow, step: number): number {
  for (let s = win.start; s + duration <= win.end; s += step) {
    const candidate = { start: s, end: s + duration };
    if (!occupied.some((o) => overlaps(candidate, o))) return s;
  }
  const lastEnd = occupied.length ? Math.max(...occupied.map((o) => o.end)) : win.start;
  const aligned = Math.ceil(lastEnd / step) * step;
  return Math.max(0, Math.min(aligned, DAY_MINUTES - duration));
}

/**
 * Donne une heure de début à des créneaux qui arrivent dans une journée (création d'un cours, créneau
 * décalé sur un autre jour) : là où il y a de la place dans la plage autorisée de ce jour. Si
 * `keepStartTime` est vrai et que l'heure d'origine du créneau est libre et dans la plage, on la garde.
 * `now` (jour + minutes courantes) : un J0 posé ce jour-là ne se place pas avant cette heure (les autres J
 * gardent la première place libre de la plage).
 * Renvoie les créneaux entrants avec `startTime` renseigné (les autres créneaux ne sont pas modifiés).
 */
export function assignStartTimes(
  existing: RevisionItem[],
  incoming: RevisionItem[],
  settings: AppSettings,
  keepStartTime = false,
  now?: { date: string; minutes: number }
): RevisionItem[] {
  const incomingIds = new Set(incoming.map((r) => r.id));
  const step = getTimelineConfig(settings).stepMinutes;
  const dates = [...new Set(incoming.map((r) => r.scheduledDate))];
  const placed = new Map<string, string>();

  for (const date of dates) {
    const win = getDayWindow(settings, date);
    const dayExisting = existing.filter((r) => r.scheduledDate === date && !incomingIds.has(r.id));
    const occupied: Span[] = resolveDayLayout(dayExisting, win.start).map((p) => ({ start: p.start, end: p.end }));
    const news = incoming
      .filter((r) => r.scheduledDate === date)
      .sort((a, b) => a.jIndex - b.jIndex || a.slotOrder - b.slotOrder);

    for (const r of news) {
      let start: number | null = null;
      if (keepStartTime) {
        const preferred = parseTime(r.startTime);
        const span = preferred === null ? null : { start: preferred, end: preferred + r.durationMinutes };
        if (span && span.start >= win.start && span.end <= win.end && !occupied.some((o) => overlaps(span, o))) {
          start = span.start;
        }
      }
      if (start === null) {
        const searchWin =
          now && r.jIndex === 0 && date === now.date
            ? { ...win, start: Math.min(Math.max(win.start, Math.ceil(now.minutes / step) * step), win.end) }
            : win;
        start = findFreeStart(occupied, r.durationMinutes, searchWin, step);
      }
      occupied.push({ start, end: start + r.durationMinutes });
      placed.set(r.id, formatTime(start));
    }
  }

  return incoming.map((r) => ({ ...r, startTime: placed.get(r.id) ?? r.startTime }));
}

/**
 * Pose `targetId` (dont `scheduledDate` est déjà le jour visé) à `startMinutes`, calé sur le pas et borné à la
 * plage de ce jour ; les autres créneaux du même jour qu'il gêne sont repoussés plus tard.
 * Renvoie la liste complète des créneaux, avec `startTime` / `slotOrder` mis à jour pour ce jour.
 */
export function placeRevisionAtTime(
  revisions: RevisionItem[],
  targetId: string,
  startMinutes: number,
  settings: AppSettings
): RevisionItem[] {
  const target = revisions.find((r) => r.id === targetId);
  if (!target) return revisions;
  const win = getDayWindow(settings, target.scheduledDate);
  const step = getTimelineConfig(settings).stepMinutes;
  const start = Math.min(
    Math.max(snapToStep(startMinutes, step), win.start),
    Math.max(win.start, win.end - target.durationMinutes)
  );

  const dayRevs = revisions.filter((r) => r.scheduledDate === target.scheduledDate);
  const layout = moveSlotInLayout(dayRevs, win.start, targetId, start);
  if (!layout) {
    // Déborderait après minuit : on retombe sur la première place libre du jour
    const others = revisions.filter((r) => r.id !== targetId);
    const [placed] = assignStartTimes(others, [target], settings);
    return revisions.map((r) => (r.id === targetId ? placed : r));
  }
  const updates = new Map(placementsToUpdates(layout).map((u) => [u.id, u]));
  return revisions.map((r) => {
    const u = updates.get(r.id);
    return u ? { ...r, startTime: u.startTime, slotOrder: u.slotOrder } : r;
  });
}

// ---------------------------------------------------------------------------------------------
// Vue sur plusieurs jours + détails affichés dans les blocs
// ---------------------------------------------------------------------------------------------

export const MULTI_DAY_MIN = 2;
export const MULTI_DAY_MAX = 6;
export const MULTI_DAY_DEFAULT = 3;

/** Nombre de jours de la vue multi-jours (2 à 6), 3 par défaut. */
export function getMultiDayCount(settings?: Partial<Pick<AppSettings, 'multiDayCount'>>): number {
  const n = settings?.multiDayCount;
  return typeof n === 'number' && Number.isInteger(n) && n >= MULTI_DAY_MIN && n <= MULTI_DAY_MAX ? n : MULTI_DAY_DEFAULT;
}

/** Matière dans un bloc : rien (la couleur suffit), son code court (CARDIO) ou son nom complet. */
export type SubjectDisplay = 'none' | 'code' | 'name';

export interface BlockDetails {
  subject: SubjectDisplay;
  code: boolean;
  notes: boolean;
  rating: boolean;
}

export const DEFAULT_BLOCK_DETAILS: BlockDetails = { subject: 'code', code: false, notes: true, rating: true };

/**
 * Détails affichés dans les blocs pleine taille ; un réglage absent ou invalide garde sa valeur par défaut.
 * Un ancien réglage booléen de la matière est repris : vrai = code court, faux = rien.
 */
export function getBlockDetails(settings?: Partial<Pick<AppSettings, 'blockDetails'>>): BlockDetails {
  const d = settings?.blockDetails;
  const flag = (key: 'code' | 'notes' | 'rating') => (typeof d?.[key] === 'boolean' ? (d[key] as boolean) : DEFAULT_BLOCK_DETAILS[key]);
  const s = d?.subject;
  const subject: SubjectDisplay =
    s === 'none' || s === 'code' || s === 'name' ? s : s === true ? 'code' : s === false ? 'none' : DEFAULT_BLOCK_DETAILS.subject;
  return { subject, code: flag('code'), notes: flag('notes'), rating: flag('rating') };
}

/** Nombre de jours suivant dans le cycle 2 → 3 → … → 6 → 2 (clics répétés sur l'onglet « N jours »). */
export function nextMultiDayCount(current: number): number {
  const n = getMultiDayCount({ multiDayCount: current });
  return n >= MULTI_DAY_MAX ? MULTI_DAY_MIN : n + 1;
}

/** `count` jours consécutifs à partir de `startIso` (YYYY-MM-DD). */
export function consecutiveDays(startIso: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(startIso, i));
}
