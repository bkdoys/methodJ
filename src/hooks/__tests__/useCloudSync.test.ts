// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Course, RevisionItem, Subject } from '../../types';
import { DEFAULT_SETTINGS } from '../../utils/seedData';
import { SyncData, recordCloudWrite } from '../../utils/cloudSync';

// ---------- Faux cloud en mémoire (remplace Firestore) ----------
type Cloud = { data: SyncData; stamp: string | null; token: string | null };
const fb = vi.hoisted(() => ({
  cloud: null as unknown as Cloud,
  authCallback: null as null | ((user: unknown) => Promise<void> | void),
  writes: 0,
  fetchCloudData: vi.fn(),
  fetchCloudSyncToken: vi.fn(),
  syncLocalDataToCloud: vi.fn(),
  mirrorLocalToCloud: vi.fn(),
}));

vi.mock('../../utils/firebase', () => ({
  auth: {},
  isCloudConfigured: true,
  fetchCloudData: fb.fetchCloudData,
  fetchCloudSyncToken: fb.fetchCloudSyncToken,
  syncLocalDataToCloud: fb.syncLocalDataToCloud,
  mirrorLocalToCloud: fb.mirrorLocalToCloud,
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fb.authCallback = cb;
    return () => {};
  },
}));

import { useCloudSync } from '../useCloudSync';

const upsert = <T extends { id: string }>(list: T[], items: T[]) => {
  const map = new Map(list.map((x) => [x.id, x]));
  items.forEach((x) => map.set(x.id, x));
  return [...map.values()];
};
/** Une écriture sur le cloud, comme la vraie : nouvelle estampille, nouveau jeton, mémorisés par l'appareil. */
function cloudWrite(uid: string, apply: () => void): string {
  apply();
  fb.writes++;
  const stamp = new Date(Date.UTC(2026, 9, 12, 10, 0, fb.writes)).toISOString();
  const token = `tok-${fb.writes}`;
  fb.cloud.stamp = stamp;
  fb.cloud.token = token;
  recordCloudWrite(uid, stamp, token);
  return stamp;
}

// ---------- Données ----------
const subject = { id: 's1', name: 'Cardio', code: 'CARDIO', color: '#e11d48' } as Subject;
const course = (id: string): Course =>
  ({ id, title: id, itemCode: id, subjectId: 's1', j0Date: '2026-10-01', activeJList: [0, 1], mastery: 0, createdAt: '2026-10-01' }) as Course;
const rev = (id: string, courseId: string, date = '2026-10-12'): RevisionItem => ({
  id, courseId, jIndex: 0, scheduledDate: date, durationMinutes: 60, completed: false, slotOrder: 0,
});
const base: SyncData = {
  courses: [course('a'), course('b')],
  revisions: [rev('r1', 'a'), rev('r2', 'a'), rev('r3', 'b')],
  subjects: [subject],
  settings: DEFAULT_SETTINGS,
};
const user = { uid: 'u1', email: 'u1@example.com' };

function setup(initial: SyncData = base) {
  const applyData = vi.fn();
  const notify = vi.fn();
  const stateRef = { current: initial };
  const hook = renderHook((props: { data: SyncData }) => {
    stateRef.current = props.data;
    return useCloudSync({ dataLoaded: true, data: props.data, stateRef, applyData, notify });
  }, { initialProps: { data: initial } });
  const setData = (data: SyncData) => hook.rerender({ data });
  return { ...hook, applyData, notify, setData };
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const login = () => act(async () => { await fb.authCallback!(user); });
const focusTab = async () => {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
  localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  fb.writes = 0;
  fb.cloud = { data: structuredClone(base), stamp: '2026-10-12T09:00:00.000Z', token: 'tok-initial' };
  fb.fetchCloudData.mockReset().mockImplementation(async () => ({ ...structuredClone(fb.cloud.data), stamp: fb.cloud.stamp, token: fb.cloud.token }));
  fb.fetchCloudSyncToken.mockReset().mockImplementation(async () => fb.cloud.token);
  fb.syncLocalDataToCloud.mockReset().mockImplementation(async (uid: string, courses: Course[], revisions: RevisionItem[], subjects: Subject[], settings: SyncData['settings']) =>
    cloudWrite(uid, () => {
      fb.cloud.data = {
        courses: upsert(fb.cloud.data.courses, courses),
        revisions: upsert(fb.cloud.data.revisions, revisions),
        subjects: upsert(fb.cloud.data.subjects, subjects),
        settings,
      };
    })
  );
  fb.mirrorLocalToCloud.mockReset().mockImplementation(async (uid: string, data: SyncData) =>
    cloudWrite(uid, () => {
      fb.cloud.data = structuredClone(data);
    })
  );
});

afterEach(() => {
  cleanup(); // sans les globales de Vitest, Testing Library ne démonte pas tout seul
  vi.useRealTimers();
});

describe('useCloudSync: login', () => {
  it('reads the cloud once and finds it in sync with the device', async () => {
    const { result } = setup();
    await login();
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(1);
    expect(result.current.syncStatus).toBe('synced');
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
  });
});

describe('useCloudSync: auto-push', () => {
  it('sends only the modified document, 3 s after the change', async () => {
    const { setData, result } = setup();
    await login();
    const moved = { ...base.revisions[1], scheduledDate: '2026-10-14' };
    setData({ ...base, revisions: [base.revisions[0], moved, base.revisions[2]] });
    expect(result.current.syncStatus).toBe('pending');

    await wait(2900);
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
    await wait(200);
    expect(fb.syncLocalDataToCloud).toHaveBeenCalledTimes(1);
    const [, courses, revisions, subjects] = fb.syncLocalDataToCloud.mock.calls[0];
    expect(courses).toEqual([]);
    expect(revisions).toEqual([moved]);
    expect(subjects).toEqual([]);
    expect(result.current.syncStatus).toBe('synced');
    expect(fb.cloud.data.revisions.find((r) => r.id === 'r2')?.scheduledDate).toBe('2026-10-14');
  });

  it('sends nothing when nothing changed', async () => {
    setup();
    await login();
    await wait(10_000);
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
    expect(fb.mirrorLocalToCloud).not.toHaveBeenCalled();
  });

  it('waits while offline', async () => {
    const { setData, result } = setup();
    await login();
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    setData({ ...base, courses: [course('a'), { ...course('b'), title: 'renamed' }] });
    await wait(10_000);
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
    expect(result.current.syncStatus).toBe('offline');
  });
});

describe('useCloudSync: back on the tab', () => {
  it('reads only the sync token when the cloud has not changed', async () => {
    setup();
    await login();
    await focusTab();
    expect(fb.fetchCloudSyncToken).toHaveBeenCalledTimes(1);
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(1); // the login read only
  });

  it('still skips the full read after its own push', async () => {
    const { setData } = setup();
    await login();
    setData({ ...base, courses: [course('a'), { ...course('b'), title: 'renamed' }] });
    await wait(3100);
    expect(fb.syncLocalDataToCloud).toHaveBeenCalledTimes(1);
    await focusTab();
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(1);
  });

  it('reads everything and adopts the cloud when another device wrote', async () => {
    const { applyData } = setup();
    await login();
    // Another device moves r3 and writes a new token
    fb.cloud.data.revisions = fb.cloud.data.revisions.map((r) => (r.id === 'r3' ? { ...r, scheduledDate: '2026-10-20' } : r));
    fb.cloud.stamp = '2026-10-12T11:00:00.000Z';
    fb.cloud.token = 'tok-other-device';
    await focusTab();
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(2);
    const adopted = applyData.mock.calls.at(-1)![0] as SyncData;
    expect(adopted.revisions.find((r) => r.id === 'r3')?.scheduledDate).toBe('2026-10-20');
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
  });

  it('reads everything again after 30 minutes even with the same token', async () => {
    setup();
    await login();
    await wait(31 * 60 * 1000);
    await focusTab();
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(2);
  });

  it('does a full read (and pushes) when local changes are still pending', async () => {
    const { setData } = setup();
    await login();
    const edited = { ...base, courses: [course('a'), { ...course('b'), title: 'renamed' }] };
    setData(edited);
    await focusTab(); // before the 3 s auto-push
    expect(fb.fetchCloudData).toHaveBeenCalledTimes(2);
    expect(fb.mirrorLocalToCloud).toHaveBeenCalledTimes(1);
    expect(fb.cloud.data.courses.find((c) => c.id === 'b')?.title).toBe('renamed');
  });

  it('opens a conflict instead of writing when both sides changed', async () => {
    const { setData, result } = setup();
    await login();
    setData({ ...base, courses: [course('a'), { ...course('b'), title: 'device edit' }] });
    fb.cloud.data.courses = fb.cloud.data.courses.map((c) => (c.id === 'b' ? { ...c, title: 'other device edit' } : c));
    fb.cloud.stamp = '2026-10-12T11:00:00.000Z';
    fb.cloud.token = 'tok-other-device';
    await focusTab();
    await wait(10_000);
    expect(result.current.syncStatus).toBe('conflict');
    expect(fb.syncLocalDataToCloud).not.toHaveBeenCalled();
    expect(fb.mirrorLocalToCloud).not.toHaveBeenCalled();
    expect(fb.cloud.data.courses.find((c) => c.id === 'b')?.title).toBe('other device edit');
  });
});
