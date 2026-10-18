import type { Point, Stroke } from './drawing';

/**
 * Forme d'un dessin modifiable (éléments, taille, photo dessous) et son codage pour le stockage : JSON allégé (points
 * des traits libres simplifiés) puis gzip quand le navigateur sait le faire. Pur, sans accès au stockage (voir
 * drawingSource.ts, qui l'enregistre sur l'appareil et dans Firebase Storage).
 */
export interface DrawingSource {
  v: 1;
  width: number;
  height: number;
  strokes: Stroke[];
  /** Photo sous les éléments (annotation), recopiée en data URL. */
  backgroundUrl?: string;
}

/** Taille maximale d'un dessin envoyé dans le cloud (la règle de Storage refuse au-delà). */
export const MAX_DRAWING_BYTES = 3 * 1024 * 1024;
export const GZIP_TYPE = 'application/gzip';
export const JSON_TYPE = 'application/json';

/** Lit un dessin source enregistré ; `null` s'il est illisible ou d'une autre forme. */
export function parseDrawingSource(text: string): DrawingSource | null {
  try {
    const v = JSON.parse(text) as Partial<DrawingSource>;
    if (v?.v !== 1 || !Number.isFinite(v.width) || !Number.isFinite(v.height) || !Array.isArray(v.strokes)) return null;
    const okStroke = (s: Stroke) => s && Array.isArray(s.points) && typeof s.color === 'string' && typeof s.width === 'number';
    if (!v.strokes.every(okStroke)) return null;
    return { v: 1, width: v.width as number, height: v.height as number, strokes: v.strokes, ...(typeof v.backgroundUrl === 'string' ? { backgroundUrl: v.backgroundUrl } : {}) };
  } catch {
    return null;
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker : retire les points qui s'écartent de moins de `tol` px de la ligne ; les extrémités restent. */
export function simplifyPoints(points: Point[], tol = 0.8): Point[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(points[i], points[lo], points[hi]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tol) {
      keep[at] = true;
      stack.push([lo, at], [at, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Les traits à main levée sont allégés ; les formes, textes et polygones gardent leurs points. */
export function lightenSource(source: DrawingSource): DrawingSource {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    ...source,
    strokes: source.strokes.map((s) => {
      const pts = !s.shape && s.tool === 'pen' ? simplifyPoints(s.points) : s.points;
      return { ...s, points: pts.map(([x, y]): Point => [round(x), round(y)]) };
    }),
  };
}

const hasGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Le fichier à stocker : JSON allégé, en gzip si possible. */
export async function encodeDrawingSource(source: DrawingSource): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify(lightenSource(source)));
  if (!hasGzip) return new Blob([bytes as BlobPart], { type: JSON_TYPE });
  return new Blob([(await pipe(bytes, new CompressionStream('gzip'))) as BlobPart], { type: GZIP_TYPE });
}

/** Relit un fichier stocké (gzip reconnu à son en-tête, sinon JSON brut) ; `null` s'il est illisible. */
export async function decodeDrawingSource(blob: Blob): Promise<DrawingSource | null> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (gz && !hasGzip) return null;
    return parseDrawingSource(new TextDecoder().decode(gz ? await pipe(bytes, new DecompressionStream('gzip')) : bytes));
  } catch {
    return null;
  }
}
