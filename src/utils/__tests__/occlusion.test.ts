import { describe, expect, it } from 'vitest';
import { OcclusionMask } from '../../types';
import {
  groupMasks,
  hitMask,
  MAX_MASKS,
  maskGroups,
  maskContains,
  movePolygonPoint,
  moveMask,
  nextGroup,
  normalizeMasks,
  polygonFromPoints,
  rectFromPoints,
  resizeMask,
  ungroupMasks,
} from '../occlusion';
import { fitSize } from '../imageCompress';

const mask = (id: string, x: number, y: number, w: number, h: number, group: number): OcclusionMask => ({ id, x, y, w, h, group });

describe('occlusion', () => {
  it('builds a rectangle from two points in any order, clamped to the image', () => {
    expect(rectFromPoints(0.5, 0.6, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 });
    expect(rectFromPoints(-0.2, 0.5, 0.3, 1.4)).toEqual({ x: 0, y: 0.5, w: 0.3, h: 0.5 });
    expect(rectFromPoints(0.5, 0.5, 0.505, 0.9)).toBeNull(); // trop étroit : un simple toucher
  });

  it('moves a mask without leaving the image', () => {
    const m = mask('a', 0.7, 0.1, 0.2, 0.2, 1);
    expect(moveMask(m, 0.5, -0.5)).toMatchObject({ x: 0.8, y: 0 });
    expect(moveMask(m, -0.1, 0.1)).toMatchObject({ x: 0.6, y: 0.2 });
  });

  it('resizes from a corner, the opposite corner staying put', () => {
    const m = mask('a', 0.2, 0.2, 0.2, 0.2, 1);
    const se = resizeMask(m, 'se', 0.6, 0.5);
    expect(se).toMatchObject({ x: 0.2, y: 0.2 });
    expect(se.w).toBeCloseTo(0.4);
    expect(se.h).toBeCloseTo(0.3);
    const nw = resizeMask(m, 'nw', 0.1, 0.1);
    expect(nw).toMatchObject({ x: 0.1, y: 0.1 });
    expect(nw.w).toBeCloseTo(0.3);
    // Tiré au-delà du coin opposé : le rectangle se retourne sans disparaître
    expect(resizeMask(m, 'se', 0.1, 0.1)).toMatchObject({ x: 0.1, y: 0.1 });
  });

  it('finds the topmost mask under a point', () => {
    const masks = [mask('a', 0, 0, 0.5, 0.5, 1), mask('b', 0.25, 0.25, 0.5, 0.5, 2)];
    expect(hitMask(masks, 0.3, 0.3)?.id).toBe('b');
    expect(hitMask(masks, 0.1, 0.1)?.id).toBe('a');
    expect(hitMask(masks, 0.9, 0.1)).toBeNull();
  });

  it('groups and ungroups masks while keeping group numbers stable', () => {
    const masks = [mask('a', 0, 0, 0.1, 0.1, 1), mask('b', 0.2, 0, 0.1, 0.1, 2), mask('c', 0.4, 0, 0.1, 0.1, 3)];
    const grouped = groupMasks(masks, new Set(['b', 'c']));
    expect(grouped.map((m) => m.group)).toEqual([1, 2, 2]);
    expect(maskGroups(grouped)).toEqual([1, 2]);
    expect(nextGroup(grouped)).toBe(3);
    // Séparer : le premier garde son groupe, l'autre en prend un nouveau
    expect(ungroupMasks(grouped, new Set(['b', 'c'])).map((m) => m.group)).toEqual([1, 2, 3]);
    // Un masque déjà seul ne change pas
    expect(ungroupMasks(masks, new Set(['a']))).toEqual(masks);
  });

  it('normalizes stored masks', () => {
    const raw: unknown[] = [
      mask('a', 0.123456, 0.2, 0.3, 0.4, 2),
      { id: 'b', x: 'x', y: 0, w: 0.1, h: 0.1, group: 1 },
      mask('c', 0.9, 0.9, 0.5, 0.5, 0),
      null,
      mask('d', 0.5, 0.5, 0.001, 0.2, 1),
    ];
    expect(normalizeMasks(raw)).toEqual([
      mask('a', 0.1235, 0.2, 0.3, 0.4, 2),
      { id: 'c', x: 0.9, y: 0.9, w: 0.1, h: 0.1, group: 1 },
    ]);
    const many = Array.from({ length: MAX_MASKS + 5 }, (_, i) => mask(`m${i}`, 0, 0, 0.1, 0.1, i + 1));
    expect(normalizeMasks(many)).toHaveLength(MAX_MASKS);
  });
});

describe('imageCompress', () => {
  it('scales the long side down to the limit, never up', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(5000, 10, 1000)).toEqual({ width: 1000, height: 2 });
  });

  describe('shapes', () => {
    const tri = polygonFromPoints([{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.2, y: 0.6 }])!;
    const poly: OcclusionMask = { id: 'p', group: 1, ...tri };

    it('derives the bounding box of a polygon and rejects degenerate ones', () => {
      expect(tri).toMatchObject({ x: 0.2, y: 0.2, shape: 'polygon' });
      expect(tri.w).toBeCloseTo(0.4);
      expect(tri.h).toBeCloseTo(0.4);
      expect(polygonFromPoints([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }])).toBeNull();
      expect(polygonFromPoints([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 }])).toBeNull();
    });

    it('hits only inside the real shape, not the whole box', () => {
      expect(maskContains(poly, 0.3, 0.3)).toBe(true);
      expect(maskContains(poly, 0.55, 0.55)).toBe(false); // dans la boîte, hors du triangle
      const oval: OcclusionMask = { id: 'e', x: 0.2, y: 0.2, w: 0.4, h: 0.4, group: 2, shape: 'ellipse' };
      expect(maskContains(oval, 0.4, 0.4)).toBe(true);
      expect(maskContains(oval, 0.21, 0.21)).toBe(false); // coin de la boîte
      expect(hitMask([poly, oval], 0.55, 0.55)).toBeNull();
      expect(hitMask([mask('r', 0, 0, 0.5, 0.5, 1)], 0.49, 0.49)).not.toBeNull();
    });

    it('moves a polygon with its points and keeps it inside the image', () => {
      const moved = moveMask(poly, 0.1, 0.05);
      expect(moved.x).toBeCloseTo(0.3);
      expect(moved.points![0].x).toBeCloseTo(0.3);
      expect(moved.points![0].y).toBeCloseTo(0.25);
      const edge = moveMask(poly, 5, 5);
      expect(edge.x + edge.w).toBeLessThanOrEqual(1.0000001);
      expect(Math.max(...edge.points!.map((p) => p.x))).toBeLessThanOrEqual(1.0000001);
    });

    it('moves a vertex and the box follows', () => {
      const m = movePolygonPoint(poly, 1, 0.9, 0.1);
      expect(m.points![1]).toEqual({ x: 0.9, y: 0.1 });
      expect(m).toMatchObject({ y: 0.1 });
      expect(m.w).toBeCloseTo(0.7);
      expect(movePolygonPoint(poly, 9, 0.5, 0.5)).toBe(poly);
    });

    it('normalizes shapes: ellipse kept, polygon rebuilt, broken polygon dropped', () => {
      const out = normalizeMasks([
        { id: 'e', x: 0.1, y: 0.1, w: 0.3, h: 0.2, group: 1, shape: 'ellipse' },
        { id: 'p', x: 0, y: 0, w: 0, h: 0, group: 2, shape: 'polygon', points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.2, y: 1.4 }] },
        { id: 'bad', x: 0, y: 0, w: 0.5, h: 0.5, group: 3, shape: 'polygon', points: [{ x: 0.2, y: 0.2 }] },
        { id: 'r', x: 0.1, y: 0.1, w: 0.3, h: 0.2, group: 4, shape: 'weird' },
      ]);
      expect(out.map((m) => m.id)).toEqual(['e', 'p', 'r']);
      expect(out[0].shape).toBe('ellipse');
      expect(out[1]).toMatchObject({ shape: 'polygon', x: 0.2, y: 0.2 });
      expect(out[1].points![2].y).toBe(1);
      expect(out[2].shape).toBeUndefined();
    });
  });
});
