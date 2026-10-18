import { describe, expect, it } from 'vitest';
import {
  acceptsPointer,
  addPoint,
  arrowHead,
  boundsContain,
  boundsIntersect,
  closesPolygon,
  containsPoint,
  toggleFill,
  topClosedShapeAt,
  replaceStrokes,
  strokeBounds,
  topStrokeAt,
  translateStroke,
  unionBounds,
  isDegenerateShape,
  BLANK_SIZE,
  canvasSize,
  commitStroke,
  emptyHistory,
  MAX_ANNOTATE_SIDE,
  redoStroke,
  scaledWidth,
  Stroke,
  undoStroke,
} from '../drawing';

const stroke = (n: number): Stroke => ({ tool: 'pen', color: '#111827', width: 3, points: [[n, n]] });

describe('drawing history', () => {
  it('undoes and redoes strokes in order', () => {
    let h = commitStroke(commitStroke(emptyHistory, stroke(1)), stroke(2));
    expect(h.strokes.map((s) => s.points[0][0])).toEqual([1, 2]);
    h = undoStroke(h);
    expect(h.strokes.map((s) => s.points[0][0])).toEqual([1]);
    h = undoStroke(h);
    expect(h.strokes).toEqual([]);
    expect(undoStroke(h)).toBe(h); // rien à annuler
    h = redoStroke(redoStroke(h));
    expect(h.strokes.map((s) => s.points[0][0])).toEqual([1, 2]);
    expect(redoStroke(h)).toBe(h); // rien à rétablir
  });

  it('forgets the redo list when a new stroke is drawn', () => {
    let h = undoStroke(commitStroke(commitStroke(emptyHistory, stroke(1)), stroke(2)));
    expect(h.future).toHaveLength(1);
    h = commitStroke(h, stroke(3));
    expect(h.future).toEqual([]);
    expect(h.strokes.map((s) => s.points[0][0])).toEqual([1, 3]);
  });

  it('ignores a stroke without points', () => {
    expect(commitStroke(emptyHistory, { ...stroke(1), points: [] })).toBe(emptyHistory);
  });
});

describe('drawing geometry', () => {
  it('skips points almost on top of the previous one', () => {
    const a = addPoint([], 10, 10);
    expect(a).toEqual([[10, 10]]);
    expect(addPoint(a, 10.5, 10.5)).toBe(a);
    expect(addPoint(a, 14, 10)).toEqual([[10, 10], [14, 10]]);
  });

  it('sizes the canvas: blank, or the image fitted under the limit', () => {
    expect(canvasSize()).toEqual(BLANK_SIZE);
    expect(canvasSize(undefined, true)).toEqual({ width: BLANK_SIZE.height, height: BLANK_SIZE.width });
    expect(canvasSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(canvasSize({ width: 800, height: 600 }, true)).toEqual({ width: 800, height: 600 }); // une image garde ses proportions
    expect(canvasSize({ width: 4000, height: 3000 })).toEqual({ width: MAX_ANNOTATE_SIDE, height: 1200 });
  });

  it('keeps the pen proportional to the canvas width', () => {
    expect(scaledWidth(6, BLANK_SIZE.width)).toBe(6);
    expect(scaledWidth(6, 800)).toBe(3);
    expect(scaledWidth(3, 100)).toBe(1); // jamais moins d'un pixel
  });
});

describe('palm rejection', () => {
  it('lets a finger draw until a pen has been seen, then ignores touches', () => {
    expect(acceptsPointer('touch', false)).toBe(true);
    expect(acceptsPointer('touch', true)).toBe(false);
  });

  it('always accepts the pen and the mouse', () => {
    expect(acceptsPointer('pen', true)).toBe(true);
    expect(acceptsPointer('pen', false)).toBe(true);
    expect(acceptsPointer('mouse', true)).toBe(true);
  });
});

describe('shapes', () => {
  const shape = (kind: Stroke['shape'], a: [number, number], b: [number, number]): Stroke => ({ tool: 'pen', color: '#111827', width: 6, points: [a, b], shape: kind });

  it('keeps a real shape and drops one with no size', () => {
    expect(commitStroke(emptyHistory, shape('rect', [10, 10], [80, 60])).strokes).toHaveLength(1);
    expect(commitStroke(emptyHistory, shape('arrow', [10, 10], [11, 11])).strokes).toHaveLength(0);
    expect(isDegenerateShape(shape('line', [5, 5], [5, 5]))).toBe(true);
    expect(isDegenerateShape(stroke(1))).toBe(false);
  });

  it('draws the arrow head back from the tip, symmetric around the line', () => {
    const [l, r] = arrowHead([0, 0], [100, 0], 6);
    expect(l[0]).toBeCloseTo(r[0]);
    expect(l[0]).toBeLessThan(100);
    expect(l[1]).toBeCloseTo(-r[1]);
    expect(Math.hypot(100 - l[0], l[1])).toBeCloseTo(30);
  });

  it('keeps the head inside a short arrow', () => {
    const [l] = arrowHead([0, 0], [10, 0], 12);
    expect(Math.hypot(10 - l[0], l[1])).toBeLessThanOrEqual(6.001);
  });
});

describe('polygon and text', () => {
  const poly = (points: [number, number][]): Stroke => ({ tool: 'pen', color: '#111827', width: 6, points, shape: 'polygon' });

  it('needs three vertices to be a polygon', () => {
    expect(isDegenerateShape(poly([[0, 0], [50, 50]]))).toBe(true);
    expect(isDegenerateShape(poly([[0, 0], [50, 0], [25, 40]]))).toBe(false);
  });

  it('closes when the tap lands near the first vertex, and only with three or more', () => {
    const pts: [number, number][] = [[100, 100], [300, 100], [200, 300]];
    expect(closesPolygon(pts, 110, 105, 1600)).toBe(true);
    expect(closesPolygon(pts, 200, 200, 1600)).toBe(false);
    expect(closesPolygon(pts.slice(0, 2), 100, 100, 1600)).toBe(false);
  });

  it('drops an empty text box', () => {
    const text = (t: string): Stroke => ({ tool: 'pen', color: '#111827', width: 6, points: [[10, 10]], shape: 'text', text: t, fontSize: 48 });
    expect(commitStroke(emptyHistory, text('  ')).strokes).toHaveLength(0);
    expect(commitStroke(emptyHistory, text('Noyau')).strokes).toHaveLength(1);
  });
});

describe('moving and selecting elements', () => {
  const free = (pts: [number, number][]): Stroke => ({ tool: 'pen', color: '#111827', width: 6, points: pts });
  const rect = (a: [number, number], b: [number, number]): Stroke => ({ tool: 'pen', color: '#2563eb', width: 6, points: [a, b], shape: 'rect' });
  const eraser = (pts: [number, number][]): Stroke => ({ tool: 'eraser', color: '#000', width: 24, points: pts });

  it('moves are undoable and share the other elements', () => {
    const a = rect([0, 0], [10, 10]);
    const b = rect([50, 50], [90, 90]);
    let h = commitStroke(commitStroke(emptyHistory, a), b);
    const moved = translateStroke(a, 100, 5);
    h = replaceStrokes(h, [moved, b]);
    expect(h.strokes[0].points).toEqual([[100, 5], [110, 15]]);
    expect(h.strokes[1]).toBe(b);
    expect(a.points[0]).toEqual([0, 0]); // l'original n'est pas modifié
    h = undoStroke(h);
    expect(h.strokes[0]).toBe(a);
    h = redoStroke(h);
    expect(h.strokes[0]).toBe(moved);
  });

  it('finds the topmost element under the touch, never an eraser stroke', () => {
    const under = rect([0, 0], [200, 200]);
    const over = rect([50, 50], [100, 100]);
    expect(topStrokeAt([under, over], 70, 70, 6)).toBe(over);
    expect(topStrokeAt([under, over], 150, 150, 6)).toBe(under);
    expect(topStrokeAt([under, over], 400, 400, 6)).toBeUndefined();
    expect(topStrokeAt([under, eraser([[0, 0], [200, 200]])], 100, 100, 6)).toBe(under);
  });

  it('hits a freehand line near its path but not in the empty space around it', () => {
    const line = free([[0, 0], [100, 0]]);
    expect(topStrokeAt([line], 50, 8, 6)).toBe(line);
    expect(topStrokeAt([line], 50, 40, 6)).toBeUndefined();
  });

  it('measures bounds, a text box by its lines, and the union of a selection', () => {
    expect(strokeBounds(rect([10, 80], [60, 20]))).toEqual({ x0: 7, y0: 17, x1: 63, y1: 83 });
    const text: Stroke = { tool: 'pen', color: '#000', width: 6, points: [[10, 10]], shape: 'text', text: 'ab\nabcd', fontSize: 40 };
    const b = strokeBounds(text, (line, size) => line.length * size * 0.5);
    expect(b).toEqual({ x0: 10, y0: 10, x1: 90, y1: 110 });
    expect(unionBounds([{ x0: 0, y0: 0, x1: 5, y1: 5 }, { x0: 10, y0: -2, x1: 20, y1: 3 }])).toEqual({ x0: 0, y0: -2, x1: 20, y1: 5 });
    expect(unionBounds([])).toBeNull();
  });

  it('intersects and contains', () => {
    expect(boundsIntersect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 10, x1: 20, y1: 20 })).toBe(true);
    expect(boundsIntersect({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 11, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(boundsContain({ x0: 0, y0: 0, x1: 10, y1: 10 }, 12, 5, 3)).toBe(true);
  });
});

describe('filling shapes', () => {
  const sh = (shape: Stroke['shape'], points: [number, number][]): Stroke => ({ tool: 'pen', color: '#111827', width: 6, points, shape });

  it('tells inside from outside for each closed shape', () => {
    expect(containsPoint(sh('rect', [[0, 0], [100, 50]]), 50, 25)).toBe(true);
    expect(containsPoint(sh('rect', [[0, 0], [100, 50]]), 120, 25)).toBe(false);
    // les coins d'un ovale sont dehors
    expect(containsPoint(sh('ellipse', [[0, 0], [100, 100]]), 50, 50)).toBe(true);
    expect(containsPoint(sh('ellipse', [[0, 0], [100, 100]]), 5, 5)).toBe(false);
    // triangle : sommet en haut au milieu
    expect(containsPoint(sh('triangle', [[0, 0], [100, 100]]), 50, 70)).toBe(true);
    expect(containsPoint(sh('triangle', [[0, 0], [100, 100]]), 10, 10)).toBe(false);
    expect(containsPoint(sh('polygon', [[0, 0], [100, 0], [100, 100], [0, 100]]), 50, 50)).toBe(true);
    expect(containsPoint(sh('polygon', [[0, 0], [100, 0], [50, 100]]), 90, 80)).toBe(false);
  });

  it('never fills a line, an arrow or a freehand stroke', () => {
    expect(containsPoint(sh('line', [[0, 0], [100, 100]]), 50, 50)).toBe(false);
    expect(containsPoint({ tool: 'pen', color: '#000', width: 6, points: [[0, 0], [100, 100]] }, 50, 50)).toBe(false);
  });

  it('fills the topmost closed shape under the touch', () => {
    const under = sh('rect', [[0, 0], [200, 200]]);
    const over = sh('ellipse', [[50, 50], [150, 150]]);
    expect(topClosedShapeAt([under, over], 100, 100)).toBe(over);
    expect(topClosedShapeAt([under, over], 10, 10)).toBe(under);
    expect(topClosedShapeAt([under, over], 300, 300)).toBeUndefined();
  });

  it('toggles the fill: same colour removes it, another replaces it', () => {
    const r = sh('rect', [[0, 0], [10, 10]]);
    const filled = toggleFill(r, '#dc2626');
    expect(filled.fill).toBe('#dc2626');
    expect(toggleFill(filled, '#2563eb').fill).toBe('#2563eb');
    expect('fill' in toggleFill(filled, '#dc2626')).toBe(false);
    expect(r.fill).toBeUndefined(); // l'original n'est pas modifié
  });
});
