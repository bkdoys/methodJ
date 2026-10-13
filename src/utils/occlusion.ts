import { OcclusionMask } from '../types';

/**
 * Géométrie des masques d'une carte `occlusion` : rectangles, ellipses et polygones en coordonnées relatives à
 * l'image (0 à 1), donc indépendants de la taille d'affichage. `x, y, w, h` est toujours la boîte englobante
 * (le rectangle et l'ellipse la remplissent ; le polygone la déduit de ses sommets). Un groupe (`group`) = une sous-carte ; ses numéros restent stables à
 * l'édition (ils font partie de la clé de programmation `cardId:m<groupe>`).
 */

export const MAX_MASKS = 100;
export const MIN_POLYGON_POINTS = 3;
export const MAX_POLYGON_POINTS = 60;
/** Côté minimal d'un masque (relatif) : un simple toucher ne crée rien. */
export const MIN_MASK_SIZE = 0.015;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

export function newMaskId(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Groupes présents, triés et sans doublon. */
export function maskGroups(masks: OcclusionMask[]): number[] {
  return [...new Set(masks.map((m) => m.group))].sort((a, b) => a - b);
}

/** Numéro de groupe libre suivant. */
export function nextGroup(masks: OcclusionMask[]): number {
  return Math.max(0, ...masks.map((m) => m.group)) + 1;
}

/** Rectangle entre deux points (dans n'importe quel ordre), borné à l'image ; null s'il est trop petit. */
export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; w: number; h: number } | null {
  const ax = clamp01(Math.min(x0, x1));
  const bx = clamp01(Math.max(x0, x1));
  const ay = clamp01(Math.min(y0, y1));
  const by = clamp01(Math.max(y0, y1));
  if (bx - ax < MIN_MASK_SIZE || by - ay < MIN_MASK_SIZE) return null;
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

/** Déplace un masque sans le faire sortir de l'image. */
export function moveMask(m: OcclusionMask, dx: number, dy: number): OcclusionMask {
  const x = clamp01(Math.min(1 - m.w, m.x + dx));
  const y = clamp01(Math.min(1 - m.h, m.y + dy));
  if (m.shape === 'polygon' && m.points) {
    return { ...m, x, y, points: m.points.map((p) => ({ x: p.x + (x - m.x), y: p.y + (y - m.y) })) };
  }
  return { ...m, x, y };
}

/** Boîte englobante de points, ou null s'il en manque ou si elle est trop petite. */
export function boxOfPoints(points: { x: number; y: number }[]): { x: number; y: number; w: number; h: number } | null {
  if (points.length < MIN_POLYGON_POINTS) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return rectFromPoints(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

/** Polygone à partir de sommets (bornés à l'image), ou null s'il est dégénéré. */
export function polygonFromPoints(points: { x: number; y: number }[]): Pick<OcclusionMask, 'x' | 'y' | 'w' | 'h' | 'shape' | 'points'> | null {
  const pts = points.slice(0, MAX_POLYGON_POINTS).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
  const box = boxOfPoints(pts);
  return box ? { ...box, shape: 'polygon', points: pts } : null;
}

/** Déplace un sommet d'un polygone (la boîte suit) ; le masque est rendu tel quel si le résultat serait dégénéré. */
export function movePolygonPoint(m: OcclusionMask, index: number, x: number, y: number): OcclusionMask {
  if (m.shape !== 'polygon' || !m.points || index < 0 || index >= m.points.length) return m;
  const pts = m.points.map((p, i) => (i === index ? { x, y } : p));
  const poly = polygonFromPoints(pts);
  return poly ? { ...m, ...poly } : m;
}

/** Centre de la boîte englobante, pour y poser le numéro du masque. */
export function maskCenter(m: Pick<OcclusionMask, 'x' | 'y' | 'w' | 'h'>): { x: number; y: number } {
  return { x: m.x + m.w / 2, y: m.y + m.h / 2 };
}

function insidePolygon(points: { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Le point (x, y) est-il dans la forme du masque (et pas seulement dans sa boîte) ? */
export function maskContains(m: OcclusionMask, x: number, y: number): boolean {
  if (x < m.x || x > m.x + m.w || y < m.y || y > m.y + m.h) return false;
  if (m.shape === 'ellipse') {
    const dx = (x - (m.x + m.w / 2)) / (m.w / 2);
    const dy = (y - (m.y + m.h / 2)) / (m.h / 2);
    return dx * dx + dy * dy <= 1;
  }
  if (m.shape === 'polygon' && m.points) return insidePolygon(m.points, x, y);
  return true;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Redimensionne un masque en tirant un coin jusqu'au point (x, y) ; le coin opposé reste fixe. */
export function resizeMask(m: OcclusionMask, corner: Corner, x: number, y: number): OcclusionMask {
  const fixedX = corner === 'nw' || corner === 'sw' ? m.x + m.w : m.x;
  const fixedY = corner === 'nw' || corner === 'ne' ? m.y + m.h : m.y;
  const r = rectFromPoints(fixedX, fixedY, x, y);
  return r ? { ...m, ...r } : m;
}

/** Masque le plus haut (dernier dessiné) sous le point, ou null. */
export function hitMask(masks: OcclusionMask[], x: number, y: number): OcclusionMask | null {
  for (let i = masks.length - 1; i >= 0; i--) {
    if (maskContains(masks[i], x, y)) return masks[i];
  }
  return null;
}

/** Réunit les masques donnés dans un seul groupe (le plus petit des leurs) : une seule sous-carte. */
export function groupMasks(masks: OcclusionMask[], ids: Set<string>): OcclusionMask[] {
  const picked = masks.filter((m) => ids.has(m.id));
  if (picked.length < 2) return masks;
  const g = Math.min(...picked.map((m) => m.group));
  return masks.map((m) => (ids.has(m.id) ? { ...m, group: g } : m));
}

/** Sépare les masques donnés : chacun reprend un groupe à lui (le premier garde le groupe d'origine). */
export function ungroupMasks(masks: OcclusionMask[], ids: Set<string>): OcclusionMask[] {
  let next = nextGroup(masks);
  const seen = new Set<number>();
  return masks.map((m) => {
    if (!ids.has(m.id)) return m;
    const shared = masks.some((o) => o.id !== m.id && o.group === m.group);
    if (!shared || !seen.has(m.group)) {
      seen.add(m.group);
      return m;
    }
    return { ...m, group: next++ };
  });
}

/** Masques enregistrables : valeurs numériques bornées, taille minimale, au plus `MAX_MASKS`, arrondis. */
export function normalizeMasks(masks: unknown[]): OcclusionMask[] {
  const out: OcclusionMask[] = [];
  for (const raw of masks) {
    if (out.length >= MAX_MASKS) break;
    const m = raw as Partial<OcclusionMask> | null;
    if (!m || typeof m.id !== 'string' || !m.id) continue;
    const nums = [m.x, m.y, m.w, m.h];
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const group = typeof m.group === 'number' && Number.isInteger(m.group) && m.group >= 1 ? m.group : 1;
    const id = m.id.slice(0, 40);
    if (m.shape === 'polygon') {
      const raw = Array.isArray(m.points) ? m.points : [];
      const pts = raw.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: round(clamp01(p.x)), y: round(clamp01(p.y)) }));
      const poly = polygonFromPoints(pts);
      if (!poly) continue;
      out.push({ id, x: round(poly.x), y: round(poly.y), w: round(poly.w), h: round(poly.h), group, shape: 'polygon', points: poly.points });
      continue;
    }
    const r = rectFromPoints(m.x!, m.y!, m.x! + m.w!, m.y! + m.h!);
    if (!r) continue;
    out.push({
      id,
      x: round(r.x),
      y: round(r.y),
      w: round(r.w),
      h: round(r.h),
      group,
      ...(m.shape === 'ellipse' ? { shape: 'ellipse' as const } : {}),
    });
  }
  return out;
}
