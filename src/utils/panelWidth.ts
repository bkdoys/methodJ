// Largeur réglable d'un panneau latéral (arbre des disciplines de la vue Cours), mémorisée par appareil.

export const PANEL_MIN_WIDTH = 180;
export const PANEL_DEFAULT_WIDTH = 240;
export const PANEL_MAX_WIDTH = 520;
/** Le panneau ne mange jamais plus de cette part de la zone qui le contient : la liste des cours garde sa place. */
export const PANEL_MAX_SHARE = 0.55;

/** Largeur bornée : entre le minimum et le maximum, et au plus une part de la zone disponible si on la connaît. */
export function clampPanelWidth(width: number, containerWidth?: number): number {
  const byShare = containerWidth && containerWidth > 0 ? Math.floor(containerWidth * PANEL_MAX_SHARE) : PANEL_MAX_WIDTH;
  const max = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, byShare));
  if (!Number.isFinite(width)) return PANEL_DEFAULT_WIDTH;
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, width)));
}

/** Largeur lue du stockage : valeur absente, illisible ou hors bornes = largeur par défaut / bornée. */
export function parseStoredPanelWidth(raw: string | null): number {
  if (raw === null || raw.trim() === '') return PANEL_DEFAULT_WIDTH;
  const n = Number(raw);
  return Number.isFinite(n) ? clampPanelWidth(n) : PANEL_DEFAULT_WIDTH;
}

/** Pas d'une flèche du clavier (plus grand avec Maj). */
export const PANEL_KEY_STEP = 16;
export const PANEL_KEY_STEP_LARGE = 48;
