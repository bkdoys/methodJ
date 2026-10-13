import { RevisionItem } from '../types';
import { addDays } from './dateUtils';
import { analyzeDay, analyzeDays } from './dayLoad';
import {
  assignStartTimes,
  findFreeStart,
  formatTime,
  getDayBreaks,
  getDayWindow,
  getTimelineConfig,
  parseTime,
  resolveDayLayout,
} from './dayLayout';
import { applyCascadeShift } from './jMethod';

type DaySettings = Parameters<typeof analyzeDay>[2];
export type SmoothingSettings = DaySettings & { autoCascadeShift?: boolean };

/** Nombre maximal de déplacements qu'un plan propose d'un coup. */
export const MAX_PROPOSALS = 30;
/** Un créneau en retard est replacé au plus tard dans ce nombre de jours à partir d'aujourd'hui. */
export const CATCH_UP_HORIZON_DAYS = 14;

/**
 * Retard maximal qu'on accepte d'imposer à un créneau pour alléger un jour : plus le J est élevé,
 * plus l'intervalle de révision est long et plus un petit retard est sans conséquence.
 */
export function maxDelayDays(jIndex: number): number {
  if (jIndex <= 1) return 1;
  if (jIndex <= 3) return 2;
  return 3;
}

export interface ShiftedSlot {
  revisionId: string;
  fromDate: string;
  toDate: string;
}

/** Un déplacement d'un plan, tel qu'il est appliqué : un autre jour (`toDate`), ou la même journée à une autre heure (`toStart`). */
export interface PlannedMove {
  revisionId: string;
  toDate: string;
  /** `HH:MM` : le créneau reste ce jour-là et remonte à cette heure (sans cascade). */
  toStart?: string;
}

export interface Proposal {
  /** `smooth` : alléger un jour chargé ; `catchup` : rattraper un créneau en retard. */
  kind: 'smooth' | 'catchup';
  revisionId: string;
  courseId: string;
  jIndex: number;
  fromDate: string;
  toDate: string;
  /** Remontée dans la journée (même `fromDate` et `toDate`) : heure actuelle et nouvelle heure `HH:MM`. */
  fromStart?: string;
  toStart?: string;
  /** Créneaux suivants du même cours décalés avec lui (cascade), s'il y en a. */
  cascade: ShiftedSlot[];
}

export interface Unresolved {
  kind: 'smooth' | 'catchup';
  /** Jour qu'on n'arrive pas à alléger (lissage). */
  date?: string;
  /** Créneau qu'on n'arrive pas à replacer (rattrapage). */
  revisionId?: string;
  courseId?: string;
  jIndex?: number;
}

export interface Plan {
  proposals: Proposal[];
  /** Ce pour quoi on n'a pas de solution simple : l'utilisateur le traite à la main. */
  unresolved: Unresolved[];
}

// ---------- Index par jour (performance) ----------
// Les moteurs essaient des centaines de déplacements ; refiltrer toutes les révisions à chaque essai coûte cher
// avec une année de cours. Chaque état simulé est un tableau jamais modifié : on lui associe un index
// jour -> positions (dans l'ordre du tableau, comme un filtre), et l'analyse de chaque jour déjà faite.
// L'état obtenu par un déplacement reprend l'index de l'état de départ et ne recalcule que les jours touchés.

type DayIndex = Map<string, number[]>;
const dayIndexes = new WeakMap<RevisionItem[], DayIndex>();
// Analyse par état ET par objet de réglages (un changement de réglage crée un nouvel objet)
const dayLoads = new WeakMap<RevisionItem[], WeakMap<SmoothingSettings, Map<string, ReturnType<typeof analyzeDay>>>>();

function buildDayIndex(revs: RevisionItem[]): DayIndex {
  const index: DayIndex = new Map();
  revs.forEach((r, i) => {
    const list = index.get(r.scheduledDate);
    if (list) list.push(i);
    else index.set(r.scheduledDate, [i]);
  });
  return index;
}

function dayIndexOf(revs: RevisionItem[]): DayIndex {
  let index = dayIndexes.get(revs);
  if (!index) {
    index = buildDayIndex(revs);
    dayIndexes.set(revs, index);
  }
  return index;
}

/** Créneaux d'un jour, dans l'ordre du tableau (même résultat qu'un `filter`). */
function byDate(revs: RevisionItem[], date: string): RevisionItem[] {
  return (dayIndexOf(revs).get(date) ?? []).map((i) => revs[i]);
}

/** Analyse d'un jour pour cet état, calculée une fois. */
function loadOf(revs: RevisionItem[], settings: SmoothingSettings, date: string) {
  let bySettings = dayLoads.get(revs);
  if (!bySettings) {
    bySettings = new WeakMap();
    dayLoads.set(revs, bySettings);
  }
  let cache = bySettings.get(settings);
  if (!cache) {
    cache = new Map();
    bySettings.set(settings, cache);
  }
  let load = cache.get(date);
  if (!load) {
    load = analyzeDay(date, byDate(revs, date), settings);
    cache.set(date, load);
  }
  return load;
}

/** Gravité d'un jour : créneaux hors plage d'abord, puis minutes au-dessus de l'objectif. */
function severity(revs: RevisionItem[], settings: SmoothingSettings, date: string): number {
  const d = loadOf(revs, settings, date);
  return d.overflowIds.length * 100_000 + Math.max(0, d.totalMinutes - d.targetMinutes);
}

/** Un jour n'est « pas aggravé » s'il n'est pas en alerte après le déplacement, ou si son alerte n'a pas empiré. */
function notWorse(before: RevisionItem[], after: RevisionItem[], settings: SmoothingSettings, date: string): boolean {
  return !loadOf(after, settings, date).alert || severity(after, settings, date) <= severity(before, settings, date);
}

interface Evaluation {
  after: RevisionItem[];
  /** Le créneau et ses suivants, avec leur jour d'arrivée. */
  slots: ShiftedSlot[];
  /** Jours (d'aujourd'hui en avant) dont le contenu change. */
  affected: string[];
}

/**
 * Applique un déplacement (avec cascade si activée) sur une copie, sans rien enregistrer. Comme dans l'application
 * (`shiftAndPlace`), les créneaux qui changent de jour sont replacés à la première place libre de leur nouveau jour :
 * un créneau posé tard à la main ne garde pas une heure qui déborderait aussi là-bas.
 */
export function applyMove(
  revs: RevisionItem[],
  id: string,
  toDate: string,
  autoCascade: boolean,
  todayIso: string,
  settings: SmoothingSettings
): Evaluation | null {
  const res = applyCascadeShift(revs, id, toDate, autoCascade);
  if (res.deltaDays === 0) return null;
  const shifted = res.updatedRevisions;
  // `applyCascadeShift` garde l'ordre et les objets inchangés : seules les positions remplacées ont bougé
  const slots: ShiftedSlot[] = [];
  const affected = new Set<string>();
  const movedIdx = new Set<number>();
  const touchedDates = new Set<string>();
  for (let i = 0; i < shifted.length; i++) {
    if (shifted[i] === revs[i]) continue;
    const from = revs[i].scheduledDate;
    const to = shifted[i].scheduledDate;
    if (from === to) continue;
    movedIdx.add(i);
    touchedDates.add(from).add(to);
    slots.push({ revisionId: shifted[i].id, fromDate: from, toDate: to });
    if (from >= todayIso) affected.add(from);
    if (to >= todayIso) affected.add(to);
  }
  // Index du nouvel état : celui de départ, avec les jours touchés recalculés
  const index = new Map(dayIndexOf(revs));
  touchedDates.forEach((date) => {
    const kept = (index.get(date) ?? []).filter((i) => !movedIdx.has(i));
    movedIdx.forEach((i) => {
      if (shifted[i].scheduledDate === date) kept.push(i);
    });
    kept.sort((a, b) => a - b);
    if (kept.length) index.set(date, kept);
    else index.delete(date);
  });
  // Replacement des créneaux déplacés : seuls les jours d'arrivée comptent, on n'y regarde que leurs créneaux
  const moved = [...movedIdx].map((i) => shifted[i]);
  const existing: RevisionItem[] = [];
  new Set(moved.map((r) => r.scheduledDate)).forEach((date) => {
    (index.get(date) ?? []).forEach((i) => {
      if (!movedIdx.has(i)) existing.push(shifted[i]);
    });
  });
  const placed = new Map(assignStartTimes(existing, moved, settings, true).map((r) => [r.id, r]));
  const after = shifted.slice();
  movedIdx.forEach((i) => {
    after[i] = placed.get(shifted[i].id) ?? shifted[i];
  });
  dayIndexes.set(after, index);
  return { after, slots, affected: [...affected] };
}

/** Remonte un créneau à une autre heure du même jour (mêmes positions : l'index par jour reste valable). */
export function retimeRevision(revs: RevisionItem[], id: string, startTime: string): RevisionItem[] {
  return revs.map((r) => (r.id === id ? { ...r, startTime } : r));
}

function applyRetime(revs: RevisionItem[], id: string, startTime: string, todayIso: string): Evaluation | null {
  const rev = revs.find((r) => r.id === id);
  if (!rev) return null;
  const after = retimeRevision(revs, id, startTime);
  dayIndexes.set(after, dayIndexOf(revs));
  return { after, slots: [], affected: rev.scheduledDate >= todayIso ? [rev.scheduledDate] : [] };
}

/**
 * Un créneau qui déborde de la plage alors qu'une place est libre plus tôt le même jour : on le remonte à la première
 * place libre (pas de changement de jour, donc ni cascade ni autre jour touché). On ne retient le déplacement que s'il
 * allège réellement le jour. Renvoie null s'il n'y a rien à remonter.
 */
function tryRetime(work: RevisionItem[], settings: SmoothingSettings, date: string, todayIso: string) {
  const load = loadOf(work, settings, date);
  if (load.overflowIds.length === 0) return null;
  const win = getDayWindow(settings, date);
  const breaks = getDayBreaks(settings, date);
  const step = getTimelineConfig(settings).stepMinutes;
  const day = byDate(work, date);
  const current = new Map(resolveDayLayout(day, win.start, breaks).map((p) => [p.id, p]));
  // Du créneau le plus tôt au plus tard : en remonter un laisse parfois la place au suivant
  const candidates = load.overflowIds
    .map((id) => day.find((r) => r.id === id)!)
    .filter((r) => !r.completed)
    .sort((a, b) => current.get(a.id)!.start - current.get(b.id)!.start);

  for (const rev of candidates) {
    const others = resolveDayLayout(day.filter((r) => r.id !== rev.id), win.start, breaks).map((p) => ({ start: p.start, end: p.end }));
    const start = findFreeStart(others, rev.durationMinutes, win, step, breaks);
    if (start < win.start || start + rev.durationMinutes > win.end) continue; // pas de vraie place libre dans la plage
    const startTime = formatTime(start);
    if (parseTime(rev.startTime) === start) continue;
    const ev = applyRetime(work, rev.id, startTime, todayIso);
    if (!ev || severity(ev.after, settings, date) >= severity(work, settings, date)) continue;
    return { rev, ev, fromStart: formatTime(current.get(rev.id)!.start), toStart: startTime };
  }
  return null;
}

function toProposal(kind: Proposal['kind'], rev: RevisionItem, ev: Evaluation, toDate: string): Proposal {
  return {
    kind,
    revisionId: rev.id,
    courseId: rev.courseId,
    jIndex: rev.jIndex,
    fromDate: rev.scheduledDate,
    toDate,
    cascade: ev.slots.filter((s) => s.revisionId !== rev.id),
  };
}

/** Lissage : le jour de départ s'allège et aucun autre jour n'empire. */
function smoothMoveOk(work: RevisionItem[], ev: Evaluation, settings: SmoothingSettings, sourceDate: string): boolean {
  const improves = severity(ev.after, settings, sourceDate) < severity(work, settings, sourceDate);
  const harmless = ev.affected.filter((d) => d !== sourceDate).every((d) => notWorse(work, ev.after, settings, d));
  return improves && harmless;
}

/** Rattrapage : aucun jour concerné n'empire. */
function catchUpMoveOk(work: RevisionItem[], ev: Evaluation, settings: SmoothingSettings): boolean {
  return ev.affected.every((d) => notWorse(work, ev.after, settings, d));
}

/**
 * Un déplacement proposé reste-t-il sûr appliqué seul, sur l'état actuel ? Les propositions d'un plan se calculent l'une après
 * l'autre : une proposition qui comptait sur les précédentes peut ne plus l'être si on ne les accepte pas.
 */
export function isMoveSafe(
  kind: 'smooth' | 'catchup',
  revisions: RevisionItem[],
  settings: SmoothingSettings,
  todayIso: string,
  revisionId: string,
  toDate: string,
  toStart?: string
): boolean {
  const rev = revisions.find((r) => r.id === revisionId);
  if (!rev || rev.completed) return false;
  const ev =
    toStart !== undefined
      ? applyRetime(revisions, revisionId, toStart, todayIso)
      : applyMove(revisions, revisionId, toDate, settings.autoCascadeShift ?? true, todayIso, settings);
  if (!ev) return false;
  return kind === 'smooth' ? smoothMoveOk(revisions, ev, settings, rev.scheduledDate) : catchUpMoveOk(revisions, ev, settings);
}

/**
 * Déplacements réellement applicables quand l'utilisateur coche une partie d'un plan. Les propositions se suivent : l'une peut
 * compter sur les précédentes. On rejoue donc le plan dans l'ordre sur un état simulé et on n'applique une proposition cochée
 * que si elle reste sûre à son tour ; sinon elle est « bloquée » (elle dépendait d'un déplacement décoché) et n'est pas appliquée.
 */
export function selectMoves(
  kind: 'smooth' | 'catchup',
  proposals: Proposal[],
  checked: (revisionId: string) => boolean,
  revisions: RevisionItem[],
  settings: SmoothingSettings,
  todayIso: string
): { moves: PlannedMove[]; blocked: Set<string> } {
  const moves: PlannedMove[] = [];
  const blocked = new Set<string>();
  let state = revisions;
  for (const p of proposals) {
    if (!checked(p.revisionId)) continue;
    if (!isMoveSafe(kind, state, settings, todayIso, p.revisionId, p.toDate, p.toStart)) {
      blocked.add(p.revisionId);
      continue;
    }
    const ev =
      p.toStart !== undefined
        ? applyRetime(state, p.revisionId, p.toStart, todayIso)
        : applyMove(state, p.revisionId, p.toDate, settings.autoCascadeShift ?? true, todayIso, settings);
    if (!ev) continue;
    state = ev.after;
    moves.push(p.toStart !== undefined ? { revisionId: p.revisionId, toDate: p.toDate, toStart: p.toStart } : { revisionId: p.revisionId, toDate: p.toDate });
  }
  return { moves, blocked };
}

/**
 * Lissage : pour chaque jour à surveiller (au-dessus de l'objectif ou avec des créneaux hors plage), du plus proche
 * au plus lointain, on essaie d'abord de remonter un créneau qui déborde à une place libre plus tôt le même jour, puis
 * on cherche un créneau non validé à repousser de quelques jours. On préfère les J élevés (plus de marge),
 * jamais un créneau validé, et un déplacement n'est retenu que s'il améliore le jour de départ **sans aggraver un autre
 * jour** (un jour sans alerte n'en reçoit pas ; un jour déjà en alerte ne doit pas empirer) (y compris pour les créneaux décalés en cascade). Sinon : « aucune solution simple ».
 */
export function planSmoothing(revisions: RevisionItem[], settings: SmoothingSettings, todayIso: string): Plan {
  const autoCascade = settings.autoCascadeShift ?? true;
  let work = revisions;
  const proposals: Proposal[] = [];
  const unresolved: Unresolved[] = [];

  const alertDates = analyzeDays(work, settings, todayIso)
    .filter((d) => d.alert)
    .map((d) => d.date);

  for (const date of alertDates) {
    while (loadOf(work, settings, date).alert && proposals.length < MAX_PROPOSALS) {
      // D'abord, sans changer de jour : un créneau qui déborde remonte à la première place libre de la journée
      const retime = tryRetime(work, settings, date, todayIso);
      if (retime) {
        proposals.push({
          kind: 'smooth',
          revisionId: retime.rev.id,
          courseId: retime.rev.courseId,
          jIndex: retime.rev.jIndex,
          fromDate: date,
          toDate: date,
          fromStart: retime.fromStart,
          toStart: retime.toStart,
          cascade: [],
        });
        work = retime.ev.after;
        continue;
      }

      const candidates = byDate(work, date)
        .filter((r) => !r.completed)
        .sort((a, b) => b.jIndex - a.jIndex || b.slotOrder - a.slotOrder);

      let moved = false;
      search: for (const rev of candidates) {
        for (let delta = 1; delta <= maxDelayDays(rev.jIndex); delta++) {
          const toDate = addDays(date, delta);
          const ev = applyMove(work, rev.id, toDate, autoCascade, todayIso, settings);
          if (!ev) continue;
          if (smoothMoveOk(work, ev, settings, date)) {
            proposals.push(toProposal('smooth', rev, ev, toDate));
            work = ev.after;
            moved = true;
            break search;
          }
        }
      }
      if (!moved) {
        unresolved.push({ kind: 'smooth', date });
        break;
      }
    }
  }
  return { proposals, unresolved };
}

/**
 * Rattrapage : chaque créneau en retard (le plus ancien d'abord) est replacé le plus tôt possible, à partir d'aujourd'hui,
 * sur un jour où il n'aggrave rien (objectif et plage respectés, cascade comprise). Le même moteur que le lissage,
 * avec un autre objectif : ici on ne cherche pas à alléger un jour, on cherche la première place libre.
 * Un créneau déplacé en cascade avec un précédent n'est pas proposé une seconde fois.
 */
export function planCatchUp(revisions: RevisionItem[], settings: SmoothingSettings, todayIso: string): Plan {
  const autoCascade = settings.autoCascadeShift ?? true;
  let work = revisions;
  const proposals: Proposal[] = [];
  const unresolved: Unresolved[] = [];

  const overdueIds = revisions
    .filter((r) => !r.completed && r.scheduledDate < todayIso)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.jIndex - b.jIndex)
    .map((r) => r.id);

  for (const id of overdueIds) {
    const rev = work.find((r) => r.id === id);
    if (!rev || rev.completed || rev.scheduledDate >= todayIso) continue; // déjà replacé par une cascade
    if (proposals.length >= MAX_PROPOSALS) break;

    let placed = false;
    for (let offset = 0; offset <= CATCH_UP_HORIZON_DAYS; offset++) {
      const toDate = addDays(todayIso, offset);
      const ev = applyMove(work, rev.id, toDate, autoCascade, todayIso, settings);
      if (!ev) continue;
      if (catchUpMoveOk(work, ev, settings)) {
        proposals.push(toProposal('catchup', rev, ev, toDate));
        work = ev.after;
        placed = true;
        break;
      }
    }
    if (!placed) unresolved.push({ kind: 'catchup', revisionId: rev.id, courseId: rev.courseId, jIndex: rev.jIndex });
  }
  return { proposals, unresolved };
}

/** Déplacements à appliquer, dans l'ordre, pour exécuter un plan. */
export function movesOf(plan: Plan): PlannedMove[] {
  return plan.proposals.map((p) => (p.toStart !== undefined ? { revisionId: p.revisionId, toDate: p.toDate, toStart: p.toStart } : { revisionId: p.revisionId, toDate: p.toDate }));
}
