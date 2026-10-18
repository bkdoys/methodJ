import { OcclusionMask, OcclusionMode } from '../../types';
import { MIN_MASK_SIZE, newMaskId, normalizeMasks, polygonFromPoints } from '../occlusion';

// Image Occlusion d'Anki : le champ « Occlusion » contient une chaîne par forme,
//   {{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}
//   {{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.15:oi=1}}
//   {{c3::image-occlusion:polygon:points=0.1,0.6 0.3,0.6 0.2,0.8:oi=1}}
// Les valeurs sont des fractions de l'image (0 à 1). `cN` est le numéro de la carte : des formes de même numéro se
// devinent ensemble (un groupe, comme chez nous). `oi=1` : les autres formes restent masquées pendant qu'on devine.
// Les formes de texte et la rotation ne sont pas reprises.

export interface ParsedOcclusion {
  masks: OcclusionMask[];
  mode: OcclusionMode;
  /** Formes laissées de côté (texte, forme illisible). */
  ignored: number;
}

const SHAPE_RE = /\{\{c(\d+)::image-occlusion:(\w+)((?::(?:\\.|[^:}\\])*)*)\}\}/g;

/** Le champ est-il un champ d'occlusion ? */
export function hasOcclusion(field: string): boolean {
  return /\{\{c\d+::image-occlusion:/.test(field);
}

function props(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/(?<!\\):/).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq)] = part.slice(eq + 1).replace(/\\(.)/g, '$1');
  }
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const finite = (v: string | undefined): number | null => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Boîte d'une forme `left/top` + largeur et hauteur (fractions), recadrée dans l'image ; null si elle est trop petite. */
function box(left: number, top: number, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  const x = clamp01(left);
  const y = clamp01(top);
  const width = Math.min(w, 1 - x);
  const height = Math.min(h, 1 - y);
  return width >= MIN_MASK_SIZE && height >= MIN_MASK_SIZE ? { x, y, w: width, h: height } : null;
}

export function parseAnkiOcclusion(field: string): ParsedOcclusion {
  const masks: OcclusionMask[] = [];
  let ignored = 0;
  let hideAll = false;

  for (const m of field.matchAll(SHAPE_RE)) {
    const group = Number(m[1]);
    const type = m[2];
    const p = props(m[3]);
    if (p.oi === '1') hideAll = true;
    if (group < 1) {
      ignored++;
      continue;
    }

    if (type === 'rect') {
      const b = box(finite(p.left) ?? NaN, finite(p.top) ?? NaN, finite(p.width) ?? NaN, finite(p.height) ?? NaN);
      if (b) masks.push({ id: newMaskId(), ...b, group });
      else ignored++;
    } else if (type === 'ellipse') {
      // `left` et `top` : coin haut-gauche de la boîte de l'ellipse (origine par défaut de la bibliothèque graphique d'Anki)
      const rx = finite(p.rx);
      const ry = finite(p.ry);
      const b = rx !== null && ry !== null ? box(finite(p.left) ?? NaN, finite(p.top) ?? NaN, rx * 2, ry * 2) : null;
      if (b) masks.push({ id: newMaskId(), ...b, group, shape: 'ellipse' });
      else ignored++;
    } else if (type === 'polygon') {
      const points = (p.points ?? '')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(','))
        .map(([x, y]) => ({ x: clamp01(parseFloat(x)), y: clamp01(parseFloat(y)) }))
        .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
      const poly = points.length >= 3 ? polygonFromPoints(points) : null;
      if (poly) masks.push({ id: newMaskId(), ...poly, group });
      else ignored++;
    } else {
      ignored++; // text, et toute forme inconnue
    }
  }

  const kept = normalizeMasks(masks);
  return { masks: kept, mode: hideAll ? 'hide-all' : 'hide-one', ignored: ignored + (masks.length - kept.length) };
}
