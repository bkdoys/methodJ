// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeLogDays, ReviewEntry, ReviewLogDay } from '../../utils/reviewLog';

// Faux cloud en mémoire : un jour distant déjà noté depuis un autre appareil
const fb = vi.hoisted(() => ({
  remote: {} as Record<string, ReviewLogDay>,
  pushes: [] as string[],
}));

vi.mock('../../utils/firebase', () => ({
  fetchLogDaysSince: vi.fn(async () => ({ days: Object.values(fb.remote), latest: 1 })),
  pushLogDayToCloud: vi.fn(async (_uid: string, day: ReviewLogDay) => {
    fb.pushes.push(day.id);
    const merged = fb.remote[day.id] ? mergeLogDays(day, fb.remote[day.id]) : day;
    fb.remote[day.id] = merged;
    return merged;
  }),
}));

import { useReviewLog } from '../useReviewLog';

const at = (hh: string) => new Date(`2026-10-13T${hh}`).toISOString();
const entry = (hh: string, k: string): ReviewEntry => ({ t: at(hh), c: 'c1', k, g: 3, s: 2 });

beforeEach(() => {
  fb.remote = {};
  fb.pushes = [];
  localStorage.clear();
});
afterEach(cleanup);

describe('useReviewLog', () => {
  it('records and undoes a review locally without any account', async () => {
    const { result } = renderHook(() => useReviewLog({ storageUid: null }));
    act(() => result.current.recordReview(entry('09:00:00', 'k1')));
    act(() => result.current.recordReview(entry('09:01:00', 'k2')));
    expect(result.current.reviewLog['2026-10-13'].entries).toHaveLength(2);
    act(() => result.current.undoReview({ t: at('09:01:00'), c: 'c1', k: 'k2' }));
    expect(result.current.reviewLog['2026-10-13'].entries.map((e) => e.k)).toEqual(['k1']);
    act(() => result.current.undoReview({ t: at('09:00:00'), c: 'c1', k: 'k1' }));
    expect(result.current.reviewLog).toEqual({});
  });

  it('unions with the cloud day: nothing noted elsewhere is lost, and the merged day is sent', async () => {
    fb.remote['2026-10-13'] = { id: '2026-10-13', entries: [entry('08:00:00', 'other-device')] };
    const { result } = renderHook(() => useReviewLog({ storageUid: 'u1', cloudUid: 'u1' }));
    await waitFor(() => expect(result.current.reviewLog['2026-10-13']?.entries).toHaveLength(1)); // tiré du cloud
    act(() => result.current.recordReview(entry('09:00:00', 'k1')));
    await act(async () => {
      await result.current.flushReviewLog();
    });
    expect(fb.pushes).toContain('2026-10-13');
    expect(fb.remote['2026-10-13'].entries.map((e) => e.k)).toEqual(['other-device', 'k1']);
    expect(result.current.reviewLog['2026-10-13'].entries).toHaveLength(2);
  });
});
