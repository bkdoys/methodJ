import { fitSize } from './imageCompress';

/**
 * Dessin à main levée pour les cartes (voir components/DrawingEditor). Un dessin n'est enregistré que sous forme
 * d'image à plat (même chemin que les photos : compression, `addMedia`) ; les traits ne servent qu'à annuler.
 * Ni pression ni rejet de la paume : un trait est une suite de points à épaisseur constante.
 */

export type Point = [number, number];

export interface Stroke {
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: Point[];
}

export interface History {
  strokes: Stroke[];
  /** Traits annulés, le dernier annulé en dernier (rétablir le reprend). */
  undone: Stroke[];
}

export const emptyHistory: History = { strokes: [], undone: [] };

/**
 * Taille d'un dessin vierge (4:3) et plafond du grand côté quand on annote une image : 1600 px, comme la
 * compression (`MAX_SIDE`), donc rien n'est réduit à l'enregistrement.
 */
export const BLANK_SIZE = { width: 1600, height: 1200 };
export const MAX_ANNOTATE_SIDE = 1600;

export const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#ea580c', '#9333ea'] as const;
/** Épaisseurs proposées, en pixels d'un canvas de `BLANK_SIZE.width` de large. */
export const PEN_WIDTHS = [3, 6, 12] as const;
export const ERASER_FACTOR = 4;

/**
 * Taille du canvas : celle de l'image à annoter ramenée sous `MAX_ANNOTATE_SIDE`, sinon une page blanche 4:3 en
 * paysage ou 3:4 en portrait (`portrait` : l'écran est plus haut que large, pour remplir la place).
 */
export function canvasSize(
  image?: { width: number; height: number },
  portrait = false
): { width: number; height: number } {
  if (image) return fitSize(image.width, image.height, MAX_ANNOTATE_SIDE);
  return portrait ? { width: BLANK_SIZE.height, height: BLANK_SIZE.width } : { ...BLANK_SIZE };
}

/** Épaisseur ramenée à la taille réelle du canvas, d'après son grand côté (une image annotée plus petite garde un trait proportionné). */
export function scaledWidth(base: number, longSide: number): number {
  return Math.max(1, Math.round((base * longSide) / BLANK_SIZE.width));
}

/** Ajoute un point sauf s'il est quasi confondu avec le précédent (évite des milliers de points inutiles). */
export function addPoint(points: Point[], x: number, y: number, minDist = 1.5): Point[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(x - last[0], y - last[1]) < minDist) return points;
  return [...points, [x, y]];
}

/**
 * Rejet de la paume : tant qu'aucun stylet n'a touché l'écran, le doigt dessine ; dès qu'un stylet est vu, les
 * doigts (la paume posée sur l'écran) sont ignorés.
 */
export function acceptsPointer(pointerType: string, penSeen: boolean): boolean {
  return !(penSeen && pointerType === 'touch');
}

/** Valide un trait terminé ; le « rétablir » est perdu. Un trait sans point est ignoré. */
export function commitStroke(h: History, stroke: Stroke): History {
  return stroke.points.length === 0 ? h : { strokes: [...h.strokes, stroke], undone: [] };
}

export function undoStroke(h: History): History {
  const last = h.strokes[h.strokes.length - 1];
  return last ? { strokes: h.strokes.slice(0, -1), undone: [...h.undone, last] } : h;
}

export function redoStroke(h: History): History {
  const last = h.undone[h.undone.length - 1];
  return last ? { strokes: [...h.strokes, last], undone: h.undone.slice(0, -1) } : h;
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function setup(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.width;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  // La gomme efface le calque des traits, pas le fond (photo ou blanc)
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
}

function dot(ctx: CanvasRenderingContext2D, s: Stroke, p: Point) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], s.width / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Trace un trait entier (rejouer l'historique après un « annuler »). Courbes lissées par les milieux des points. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const p = s.points;
  if (p.length === 0) return;
  ctx.save();
  setup(ctx, s);
  if (p.length === 1) dot(ctx, s, p[0]);
  else {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const m = mid(p[i], p[i + 1]);
      ctx.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]);
    }
    ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Trace seulement le dernier segment d'un trait en cours (même lissage que `drawStroke`). */
export function drawLastSegment(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const p = s.points;
  const n = p.length;
  if (n === 0) return;
  ctx.save();
  setup(ctx, s);
  if (n === 1) dot(ctx, s, p[0]);
  else {
    ctx.beginPath();
    if (n === 2) {
      ctx.moveTo(p[0][0], p[0][1]);
      const m = mid(p[0], p[1]);
      ctx.lineTo(m[0], m[1]);
    } else {
      const from = mid(p[n - 3], p[n - 2]);
      const to = mid(p[n - 2], p[n - 1]);
      ctx.moveTo(from[0], from[1]);
      ctx.quadraticCurveTo(p[n - 2][0], p[n - 2][1], to[0], to[1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Fin d'un trait en cours : rejoint le dernier point (le lissage s'arrête au milieu du dernier segment). */
export function drawStrokeEnd(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const p = s.points;
  if (p.length < 2) return;
  ctx.save();
  setup(ctx, s);
  ctx.beginPath();
  const m = mid(p[p.length - 2], p[p.length - 1]);
  ctx.moveTo(m[0], m[1]);
  ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  ctx.stroke();
  ctx.restore();
}
