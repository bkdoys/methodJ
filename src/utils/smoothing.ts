import { RevisionItem } from '../types';
import { addDays } from './dateUtils';
import { analyzeDay, analyzeDays } from './dayLoad';
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

export interface Proposal {
  /** `smooth` : alléger un jour chargé ; `catchup` : rattraper un créneau en retard. */
  kind: 'smooth' | 'catchup';
  revisionId: string;
  courseId: string;
  jIndex: number;
  fromDate: string;
  toDate: string;
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

const byDate = (revs: RevisionItem[], date: string) => revs.filter((r) => r.scheduledDate === date);

/** Gravité d'un jour : créneaux hors plage d'abord, puis minutes au-dessus de l'objectif. */
function severity(revs: RevisionItem[], settings: SmoothingSettings, date: string): number {
  const d = analyzeDay(date, byDate(revs, date), settings);
  return d.overflowIds.length * 100_000 + Math.max(0, d.totalMinutes - d.targetMinutes);
}

/** Un jour n'est « pas aggravé » s'il n'est pas en alerte après le déplacement, ou si son alerte n'a pas empiré. */
function notWorse(before: RevisionItem[], after: RevisionItem[], settings: SmoothingSettings, date: string): boolean {
  return !analyzeDay(date, byDate(after, date), settings).alert || severity(after, settings, date) <= severity(before, settings, date);
}

interface Evaluation {
  after: RevisionItem[];
  /** Le créneau et ses suivants, avec leur jour d'arrivée. */
  slots: ShiftedSlot[];
  /** Jours (d'aujourd'hui en avant) dont le contenu change. */
  affected: string[];
}

/** Applique un déplacement (avec cascade si activée) sur une copie, sans rien enregistrer. */
function applyMove(
  revs: RevisionItem[],
  id: string,
  toDate: string,
  autoCascade: boolean,
  todayIso: string
): Evaluation | null {
  const res = applyCascadeShift(revs, id, toDate, autoCascade);
  if (res.deltaDays === 0) return null;
  const before = new Map(revs.map((r) => [r.id, r.scheduledDate]));
  const slots: ShiftedSlot[] = [];
  const affected = new Set<string>();
  res.updatedRevisions.forEach((r) => {
    const from = before.get(r.id);
    if (from === undefined || from === r.scheduledDate) return;
    slots.push({ revisionId: r.id, fromDate: from, toDate: r.scheduledDate });
    if (from >= todayIso) affected.add(from);
    if (r.scheduledDate >= todayIso) affected.add(r.scheduledDate);
  });
  return { after: res.updatedRevisions, slots, affected: [...affected] };
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
  toDate: string
): boolean {
  const rev = revisions.find((r) => r.id === revisionId);
  if (!rev || rev.completed) return false;
  const ev = applyMove(revisions, revisionId, toDate, settings.autoCascadeShift ?? true, todayIso);
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
): { moves: { revisionId: string; toDate: string }[]; blocked: Set<string> } {
  const moves: { revisionId: string; toDate: string }[] = [];
  const blocked = new Set<string>();
  let state = revisions;
  for (const p of proposals) {
    if (!checked(p.revisionId)) continue;
    if (!isMoveSafe(kind, state, settings, todayIso, p.revisionId, p.toDate)) {
      blocked.add(p.revisionId);
      continue;
    }
    const ev = applyMove(state, p.revisionId, p.toDate, settings.autoCascadeShift ?? true, todayIso);
    if (!ev) continue;
    state = ev.after;
    moves.push({ revisionId: p.revisionId, toDate: p.toDate });
  }
  return { moves, blocked };
}

/**
 * Lissage : pour chaque jour à surveiller (au-dessus de l'objectif ou avec des créneaux hors plage), du plus proche
 * au plus lointain, on cherche un créneau non validé à repousser de quelques jours. On préfère les J élevés (plus de marge),
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
    while (analyzeDay(date, byDate(work, date), settings).alert && proposals.length < MAX_PROPOSALS) {
      const candidates = byDate(work, date)
        .filter((r) => !r.completed)
        .sort((a, b) => b.jIndex - a.jIndex || b.slotOrder - a.slotOrder);

      let moved = false;
      search: for (const rev of candidates) {
        for (let delta = 1; delta <= maxDelayDays(rev.jIndex); delta++) {
          const toDate = addDays(date, delta);
          const ev = applyMove(work, rev.id, toDate, autoCascade, todayIso);
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
      const ev = applyMove(work, rev.id, toDate, autoCascade, todayIso);
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
export function movesOf(plan: Plan): { revisionId: string; toDate: string }[] {
  return plan.proposals.map((p) => ({ revisionId: p.revisionId, toDate: p.toDate }));
}
