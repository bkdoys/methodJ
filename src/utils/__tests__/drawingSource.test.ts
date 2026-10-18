import { describe, expect, it } from 'vitest';
import { decodeDrawingSource, DrawingSource, encodeDrawingSource, lightenSource, parseDrawingSource, simplifyPoints } from '../drawingCodec';

const stroke = { tool: 'pen', color: '#111827', width: 6, points: [[1, 2], [3, 4]], shape: 'line' };

describe('parseDrawingSource', () => {
  it('reads a saved drawing back', () => {
    const text = JSON.stringify({ v: 1, width: 1600, height: 1200, strokes: [stroke], backgroundUrl: 'data:image/jpeg;base64,AAAA' });
    expect(parseDrawingSource(text)).toEqual({ v: 1, width: 1600, height: 1200, strokes: [stroke], backgroundUrl: 'data:image/jpeg;base64,AAAA' });
  });

  it('does not invent a background', () => {
    expect(parseDrawingSource(JSON.stringify({ v: 1, width: 10, height: 10, strokes: [] }))).toEqual({ v: 1, width: 10, height: 10, strokes: [] });
  });

  it('refuses anything that is not a drawing of this version', () => {
    expect(parseDrawingSource('not json')).toBeNull();
    expect(parseDrawingSource(JSON.stringify({ v: 2, width: 10, height: 10, strokes: [] }))).toBeNull();
    expect(parseDrawingSource(JSON.stringify({ v: 1, width: 10, strokes: [] }))).toBeNull();
    expect(parseDrawingSource(JSON.stringify({ v: 1, width: 10, height: 10, strokes: [{ color: 3 }] }))).toBeNull();
  });

});

describe('simplifyPoints', () => {
  it('drops points on a straight line and keeps the ends', () => {
    expect(simplifyPoints([[0, 0], [10, 0.1], [20, 0], [30, 0.2], [40, 0]])).toEqual([[0, 0], [40, 0]]);
  });

  it('keeps the corners of a path', () => {
    const out = simplifyPoints([[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]]);
    expect(out).toEqual([[0, 0], [100, 0], [100, 100]]);
  });

  it('leaves short paths alone', () => {
    expect(simplifyPoints([[1, 1]])).toEqual([[1, 1]]);
    expect(simplifyPoints([[1, 1], [2, 2]])).toEqual([[1, 1], [2, 2]]);
  });
});

describe('lightenSource', () => {
  it('lightens freehand pen strokes only, not shapes or erasers, and rounds to a tenth', () => {
    const free = { ...stroke, shape: undefined, points: [[0, 0], [10, 0.05], [20, 0], [30, 0]] };
    const rect = { ...stroke, shape: 'rect', points: [[0.123, 0.987], [10, 10]] };
    const eraser = { ...stroke, tool: 'eraser', shape: undefined, points: [[0, 0], [10, 0], [20, 0]] };
    const out = lightenSource({ v: 1, width: 100, height: 100, strokes: [free, rect, eraser] as DrawingSource['strokes'] });
    expect(out.strokes[0].points).toEqual([[0, 0], [30, 0]]);
    expect(out.strokes[1].points).toEqual([[0.1, 1], [10, 10]]);
    expect(out.strokes[2].points).toHaveLength(3);
  });
});

describe('encode / decode', () => {
  it('round-trips a drawing and compresses repeated points', async () => {
    const pts = Array.from({ length: 800 }, (_, i) => [i, Math.sin(i / 7) * 40 + 100] as [number, number]);
    const source: DrawingSource = { v: 1, width: 1600, height: 1200, strokes: [{ ...stroke, shape: undefined, points: pts } as DrawingSource['strokes'][number]], backgroundUrl: 'data:image/jpeg;base64,AAAA' };
    const blob = await encodeDrawingSource(source);
    expect(['application/gzip', 'application/json']).toContain(blob.type);
    const back = await decodeDrawingSource(blob);
    expect(back?.width).toBe(1600);
    expect(back?.backgroundUrl).toBe('data:image/jpeg;base64,AAAA');
    expect(back?.strokes[0].points.length).toBeLessThanOrEqual(800);
    expect(back?.strokes[0].points[0]).toEqual([0, 100]);
  });

  it('reads a plain JSON file too, and refuses garbage', async () => {
    const plain = new Blob([JSON.stringify({ v: 1, width: 5, height: 5, strokes: [] })], { type: 'application/json' });
    expect(await decodeDrawingSource(plain)).toEqual({ v: 1, width: 5, height: 5, strokes: [] });
    expect(await decodeDrawingSource(new Blob([new Uint8Array([0x1f, 0x8b, 1, 2, 3])]))).toBeNull();
    expect(await decodeDrawingSource(new Blob(['nope']))).toBeNull();
  });
});
