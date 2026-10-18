import { fitSize } from './imageCompress';

/**
 * Dessin à main levée pour les cartes (voir components/DrawingEditor). Un dessin n'est enregistré que sous forme
 * d'image à plat (même chemin que les photos : compression, `addMedia`) ; les traits ne servent qu'à annuler.
 * Ni pression ni rejet de la paume : un trait est une suite de points à épaisseur constante.
 */

export type Point = [number, number];

/**
 * Formes : le geste va du premier point (où le doigt se pose) au dernier ; sans forme, trait à main levée.
 * `polygon` garde tous ses sommets (touchers successifs) et se ferme ; `text` est une zone de texte ancrée en haut à
 * gauche de son premier point.
 */
export type Shape = 'line' | 'arrow' | 'darrow' | 'rect' | 'ellipse' | 'triangle' | 'polygon' | 'text';

export interface Stroke {
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: Point[];
  shape?: Shape;
  /** Couleur de remplissage d'une forme fermée (rectangle, ovale, triangle, polygone) ; absent = transparent. */
  fill?: string;
  /** Zone de texte : le texte (lignes séparées par \n) et sa taille en pixels du canvas. */
  text?: string;
  fontSize?: number;
}

/**
 * Historique par instantanés : `strokes` = le dessin actuel (les éléments, dans l'ordre de superposition), `past` et
 * `future` = les états d'avant et d'après (annuler/rétablir). Ajouter, déplacer ou supprimer des éléments empile un
 * instantané ; les éléments eux-mêmes ne sont jamais modifiés (déplacer en crée des copies), donc les instantanés se
 * partagent leurs éléments.
 */
export interface History {
  strokes: Stroke[];
  past: Stroke[][];
  future: Stroke[][];
}

export const emptyHistory: History = { strokes: [], past: [], future: [] };

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
/** Taille du texte d'une zone de texte : l'épaisseur choisie × ce facteur (3 → 24 px, 6 → 48, 12 → 96 sur 1600 px). */
export const TEXT_FACTOR = 8;
export const TEXT_LINE_HEIGHT = 1.25;
/** Un toucher à moins de cette distance (px du canvas, avant mise à l'échelle) du premier sommet ferme le polygone. */
export const POLYGON_CLOSE_DIST = 28;

export const closesPolygon = (points: Point[], x: number, y: number, longSide: number): boolean =>
  points.length >= 3 && Math.hypot(x - points[0][0], y - points[0][1]) <= (POLYGON_CLOSE_DIST * longSide) / BLANK_SIZE.width;

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

/** Une forme réduite à un point (simple toucher) ne dessine rien : on ne la garde pas. */
export const MIN_SHAPE_SIZE = 3;
export function isDegenerateShape(s: Stroke): boolean {
  if (!s.shape) return false;
  if (s.shape === 'text') return !s.text?.trim() || s.points.length === 0;
  if (s.shape === 'polygon') return s.points.length < 3;
  const a = s.points[0];
  const b = s.points[s.points.length - 1];
  return !a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SHAPE_SIZE;
}

/** Valide un trait terminé ; le « rétablir » est perdu. Un trait sans point, ou une forme sans taille, est ignoré. */
export function commitStroke(h: History, stroke: Stroke): History {
  return stroke.points.length === 0 || isDegenerateShape(stroke) ? h : replaceStrokes(h, [...h.strokes, stroke]);
}

/** Nouvel état du dessin (déplacement, suppression) : annulable, le « rétablir » est perdu. */
export function replaceStrokes(h: History, strokes: Stroke[]): History {
  return { strokes, past: [...h.past, h.strokes], future: [] };
}

export function undoStroke(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { strokes: prev, past: h.past.slice(0, -1), future: [h.strokes, ...h.future] } : h;
}

export function redoStroke(h: History): History {
  const next = h.future[0];
  return next ? { strokes: next, past: [...h.past, h.strokes], future: h.future.slice(1) } : h;
}

// ---------------------------------------------------------------------------
// Sélection et déplacement

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Largeur d'une ligne de texte, mesurée par le canvas ; par défaut une estimation. */
export type MeasureText = (line: string, fontSize: number) => number;
const estimateText: MeasureText = (line, fontSize) => line.length * fontSize * 0.6;

/** Rectangle englobant d'un élément, épaisseur du trait comprise. */
export function strokeBounds(s: Stroke, measure: MeasureText = estimateText): Bounds {
  const pad = s.width / 2;
  if (s.shape === 'text') {
    const [x, y] = s.points[0];
    const size = s.fontSize ?? 32;
    const lines = (s.text ?? '').split('\n');
    return { x0: x, y0: y, x1: x + Math.max(...lines.map((l) => measure(l, size))), y1: y + lines.length * size * TEXT_LINE_HEIGHT };
  }
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  const [ax, ay] = s.points[0];
  const [bx, by] = s.points[s.points.length - 1];
  // Une forme à deux points (ligne, rectangle…) s'étend entre le premier et le dernier ; un trait ou un polygone, sur tous ses points
  const two = s.shape && s.shape !== 'polygon';
  const [x0, x1] = two ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = two ? [Math.min(ay, by), Math.max(ay, by)] : [Math.min(...ys), Math.max(...ys)];
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  return {
    x0: Math.min(...list.map((b) => b.x0)),
    y0: Math.min(...list.map((b) => b.y0)),
    x1: Math.max(...list.map((b) => b.x1)),
    y1: Math.max(...list.map((b) => b.y1)),
  };
}

export const boundsIntersect = (a: Bounds, b: Bounds): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
export const boundsContain = (b: Bounds, x: number, y: number, tol = 0): boolean => x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol;

function distToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/**
 * Le toucher (x, y) vise-t-il cet élément ? Un trait à main levée ou une ligne : près du tracé ; les autres formes et le
 * texte : dans leur rectangle. `tol` élargit la zone (un doigt est moins précis qu'un pixel). La gomme n'est jamais visée.
 */
export function hitStroke(s: Stroke, x: number, y: number, tol: number, measure?: MeasureText): boolean {
  if (s.tool === 'eraser') return false;
  const reach = s.width / 2 + tol;
  const p = s.points;
  if (!s.shape) return p.length === 1 ? Math.hypot(x - p[0][0], y - p[0][1]) <= reach : p.slice(1).some((q, i) => distToSegment(x, y, p[i], q) <= reach);
  if (s.shape === 'line' || s.shape === 'arrow' || s.shape === 'darrow') return distToSegment(x, y, p[0], p[p.length - 1]) <= reach + s.width * 2;
  return boundsContain(strokeBounds(s, measure), x, y, tol);
}

/** L'élément le plus haut (dessiné en dernier) sous le toucher, ou `undefined`. */
export function topStrokeAt(strokes: Stroke[], x: number, y: number, tol: number, measure?: MeasureText): Stroke | undefined {
  for (let i = strokes.length - 1; i >= 0; i--) if (hitStroke(strokes[i], x, y, tol, measure)) return strokes[i];
  return undefined;
}

function inPolygon(x: number, y: number, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Le point est-il dans l'intérieur d'une forme fermée ? (pour la remplir) */
export function containsPoint(s: Stroke, x: number, y: number): boolean {
  if (!isClosedShape(s.shape)) return false;
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  if (s.shape === 'polygon') return inPolygon(x, y, s.points);
  if (s.shape === 'rect') return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (s.shape === 'ellipse') {
    const rx = (x1 - x0) / 2 || 1e-6;
    const ry = (y1 - y0) / 2 || 1e-6;
    return ((x - (x0 + x1) / 2) / rx) ** 2 + ((y - (y0 + y1) / 2) / ry) ** 2 <= 1;
  }
  return inPolygon(x, y, [[(x0 + x1) / 2, y0], [x1, y1], [x0, y1]]); // triangle
}

/** La forme fermée la plus haute sous le toucher (celle que le pot de peinture remplit). */
export function topClosedShapeAt(strokes: Stroke[], x: number, y: number): Stroke | undefined {
  for (let i = strokes.length - 1; i >= 0; i--) if (containsPoint(strokes[i], x, y)) return strokes[i];
  return undefined;
}

/** Copie avec ce remplissage ; la même couleur une deuxième fois l'enlève. */
export function toggleFill(s: Stroke, color: string): Stroke {
  const { fill, ...rest } = s;
  return fill === color ? rest : { ...rest, fill: color };
}

/** Copie de l'élément déplacée de (dx, dy). */
export const translateStroke = (s: Stroke, dx: number, dy: number): Stroke => ({ ...s, points: s.points.map(([x, y]): Point => [x + dx, y + dy]) });

/** Pointe d'une flèche arrivant en `to` depuis `from` : les deux extrémités des barbes (±28°), longueur selon l'épaisseur. */
export function arrowHead(from: Point, to: Point, width: number): [Point, Point] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const len = Math.min(Math.max(14, width * 5), Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.6);
  const barb = (delta: number): Point => [to[0] - len * Math.cos(angle + delta), to[1] - len * Math.sin(angle + delta)];
  const spread = (28 * Math.PI) / 180;
  return [barb(spread), barb(-spread)];
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

/** Police des zones de texte (le même réglage sert à les tracer et à les mesurer pour la sélection). */
export const textFont = (size: number): string => `600 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;

export const isClosedShape = (shape: Shape | undefined): boolean => shape === 'rect' || shape === 'ellipse' || shape === 'triangle' || shape === 'polygon';

function drawShape(ctx: CanvasRenderingContext2D, s: Stroke, shape: Shape) {
  const a = s.points[0];
  const b = s.points[s.points.length - 1];
  if (shape === 'text') {
    ctx.font = textFont(s.fontSize ?? 32);
    ctx.textBaseline = 'top';
    (s.text ?? '').split('\n').forEach((line, i) => ctx.fillText(line, a[0], a[1] + i * (s.fontSize ?? 32) * TEXT_LINE_HEIGHT));
    return;
  }
  ctx.beginPath();
  if (shape === 'polygon') {
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
  } else if (shape === 'rect') ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  else if (shape === 'ellipse') {
    ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    ctx.moveTo((x0 + x1) / 2, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
  } else {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    if (shape === 'arrow' || shape === 'darrow') {
      const [l, r] = arrowHead(a, b, s.width);
      ctx.moveTo(l[0], l[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(r[0], r[1]);
    }
    if (shape === 'darrow') {
      const [l, r] = arrowHead(b, a, s.width);
      ctx.moveTo(l[0], l[1]);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(r[0], r[1]);
    }
  }
  if (s.fill && isClosedShape(shape)) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  ctx.stroke();
}

/** Trace un trait entier (rejouer l'historique après un « annuler »). Courbes lissées par les milieux des points. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const p = s.points;
  if (p.length === 0) return;
  ctx.save();
  setup(ctx, s);
  if (s.shape) drawShape(ctx, s, s.shape);
  else if (p.length === 1) dot(ctx, s, p[0]);
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
