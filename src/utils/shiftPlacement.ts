import { RevisionItem } from '../types';
import { applyCascadeShift } from './jMethod';
import { PlacementSettings, assignStartTimes, placeRevisionAtTime } from './dayLayout';

/**
 * Décale un créneau (avec la cascade si elle est activée) puis replace dans la plage autorisée de leur nouveau jour
 * les créneaux qui ont changé de jour, en gardant leur heure si elle y est libre. Si `exactStartMinutes` est donné
 * (glisser-déposer entre jours), le créneau visé est posé à cette heure. C'est le cœur d'un décalage : l'application
 * (`useStudyData`) et la simulation des plans de lissage (`smoothing.ts`) doivent donner le même résultat.
 */
export function shiftAndPlace(
  revs: RevisionItem[],
  revisionId: string,
  newDate: string,
  autoCascade: boolean,
  settings: PlacementSettings,
  exactStartMinutes?: number
) {
  const shifted = applyCascadeShift(revs, revisionId, newDate, autoCascade);
  const originalDate = new Map(revs.map((r) => [r.id, r.scheduledDate]));
  const movedIds = new Set(
    shifted.updatedRevisions.filter((r) => originalDate.get(r.id) !== r.scheduledDate).map((r) => r.id)
  );
  let base = shifted.updatedRevisions;
  const exact = exactStartMinutes !== undefined && movedIds.has(revisionId);
  if (exact) base = placeRevisionAtTime(base, revisionId, exactStartMinutes!, settings);
  const toPlaceIds = new Set([...movedIds].filter((id) => !(exact && id === revisionId)));
  const placed = new Map(
    assignStartTimes(
      base.filter((r) => !toPlaceIds.has(r.id)),
      base.filter((r) => toPlaceIds.has(r.id)),
      settings,
      true
    ).map((r) => [r.id, r])
  );
  const finalRevisions = base.map((r) => placed.get(r.id) ?? r);
  return { shifted, finalRevisions };
}
