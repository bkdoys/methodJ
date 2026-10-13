import { describe, expect, it } from 'vitest';
import {
  acceptsPointer,
  addPoint,
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
    expect(h.undone).toHaveLength(1);
    h = commitStroke(h, stroke(3));
    expect(h.undone).toEqual([]);
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
