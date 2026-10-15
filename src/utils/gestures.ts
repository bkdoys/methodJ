// Gestes tactiles du planning : balayage horizontal (jour/semaine précédent ou suivant) et
// pincement à deux doigts (hauteur des heures). Fonctions pures : le hook usePlanningGestures
// mesure les doigts, ces fonctions décident.

/** Déplacement horizontal minimal d'un balayage (px). */
export const SWIPE_MIN_DX = 60;
/** Le geste doit être nettement horizontal : |dx| ≥ ce rapport × |dy|. */
export const SWIPE_RATIO = 1.5;
/** Au-delà, ce n'est plus un balayage mais une lecture lente (ms). */
export const SWIPE_MAX_MS = 700;
/** Un doigt resté immobile plus longtemps avant de bouger prépare un glisser de créneau (appui long). */
export const SWIPE_MAX_HOLD_MS = 250;
/** Écart des doigts à multiplier (ou diviser) pour un palier de zoom. */
export const PINCH_STEP_RATIO = 1.5;

export interface SwipeSample {
  dx: number;
  dy: number;
  /** Durée totale du geste (ms). */
  dt: number;
  /** Temps passé immobile avant le premier vrai mouvement (ms). */
  holdMs: number;
}

/** Doigt vers la gauche = suivant, vers la droite = précédent (comme on tourne les pages d'un agenda). */
export function classifySwipe({ dx, dy, dt, holdMs }: SwipeSample): 'prev' | 'next' | null {
  if (Math.abs(dx) < SWIPE_MIN_DX) return null;
  if (Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return null;
  if (dt > SWIPE_MAX_MS || holdMs >= SWIPE_MAX_HOLD_MS) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** Paliers franchis depuis le début du pincement : positif = doigts écartés (agrandir), négatif = resserrés. */
export function pinchSteps(startDistance: number, currentDistance: number): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return 0;
  const steps = Math.log(currentDistance / startDistance) / Math.log(PINCH_STEP_RATIO);
  return Math.trunc(steps + (steps >= 0 ? 1e-9 : -1e-9)) || 0; // pas de -0
}
