import { beforeEach, describe, expect, it } from 'vitest';
import { AppSettings, Course, RevisionItem } from '../../types';
import {
  CloudSnapshot,
  FULL_READ_MAX_AGE_MS,
  SyncData,
  canSkipFullRead,
  cloudToData,
  decideReconcile,
  diffData,
  getSyncMeta,
  hasUnsyncedChanges,
  hashData,
  loadSafetyBackups,
  markSynced,
  pendingChanges,
  recordCloudToken,
  recordCloudWrite,
  saveSafetyBackup,
} from '../cloudSync';

// Minimal in-memory localStorage (tests run in node)
class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  clear = () => this.m.clear();
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

const settings = { theme: 'light', dailyTargetHours: 4 } as AppSettings;
const course = (id: string, title = id): Course => ({
  id,
  title,
  itemCode: id,
  subjectId: 's',
  j0Date: '2026-10-01',
  activeJList: [0, 1],
  mastery: 0,
  createdAt: '2026-10-01',
});
const revision = (id: string, courseId: string, jIndex: number): RevisionItem => ({
  id,
  courseId,
  jIndex,
  scheduledDate: '2026-10-01',
  durationMinutes: 60,
  completed: false,
  slotOrder: 0,
});

const base: SyncData = { courses: [course('a', 'A')], revisions: [revision('r1', 'a', 0)], subjects: [], settings };
const cloudOf = (d: SyncData, stamp: string | null = '2026-10-01T10:00:00.000Z'): CloudSnapshot => ({ ...d, stamp });

describe('hashData', () => {
  it('ignores array order, key order and technical fields', () => {
    const a: SyncData = { ...base, courses: [course('a'), course('b')] };
    const b: SyncData = {
      ...base,
      courses: [{ ...course('b'), userId: 'u', updatedAt: 'x' } as Course, course('a')],
    };
    expect(hashData(a)).toBe(hashData(b));
  });

  it('changes when content changes', () => {
    const changed: SyncData = { ...base, courses: [course('a', 'A edited')] };
    expect(hashData(changed)).not.toBe(hashData(base));
    const noted: SyncData = { ...base, revisions: [{ ...base.revisions[0], notes: 'x' }] };
    expect(hashData(noted)).not.toBe(hashData(base));
  });

  it('treats undefined fields as absent', () => {
    const withUndef: SyncData = { ...base, courses: [{ ...course('a', 'A'), customColor: undefined }] };
    expect(hashData(withUndef)).toBe(hashData(base));
  });
});

describe('decideReconcile', () => {
  const meta = { hash: hashData(base), stamp: '2026-10-01T10:00:00.000Z' };
  const edited: SyncData = { ...base, courses: [course('a', 'A edited')] };
  const elsewhere: SyncData = { ...base, courses: [course('a', 'A'), course('b', 'B')] };

  it('in-sync when contents match, even if only technical fields differ', () => {
    const cloud = cloudOf({ ...base, courses: [{ ...course('a', 'A'), userId: 'u', updatedAt: 'z' } as Course] });
    expect(decideReconcile(base, cloud, meta)).toBe('in-sync');
  });

  it('adopts the cloud when nothing is pending locally', () => {
    expect(decideReconcile(base, cloudOf(elsewhere, '2026-10-02T10:00:00.000Z'), meta)).toBe('adopt-cloud');
  });

  it('adopts the cloud on a device that never synced', () => {
    expect(decideReconcile(base, cloudOf(elsewhere), {})).toBe('adopt-cloud');
  });

  it('pushes local changes when the cloud has not moved since the last sync', () => {
    expect(decideReconcile(edited, cloudOf(base, '2026-10-01T10:00:00.000Z'), meta)).toBe('push-local');
  });

  it('flags a conflict when both sides changed', () => {
    expect(decideReconcile(edited, cloudOf(elsewhere, '2026-10-02T10:00:00.000Z'), meta)).toBe('conflict');
  });

  it('treats a cloud with no stamp as unchanged', () => {
    expect(decideReconcile(edited, cloudOf(base, null), meta)).toBe('push-local');
  });

  it('pushes an offline deletion when the cloud has not moved', () => {
    const local: SyncData = { ...base, courses: [], revisions: [] };
    expect(decideReconcile(local, cloudOf(base), meta)).toBe('push-local');
  });
});

describe('cloudToData', () => {
  it('falls back to local subjects and settings when the cloud has none', () => {
    const fallback: SyncData = { ...base, subjects: [{ id: 'x' } as any] };
    const out = cloudToData({ ...cloudOf(base), subjects: [], settings: null }, fallback);
    expect(out.subjects).toBe(fallback.subjects);
    expect(out.settings).toBe(fallback.settings);
  });
});

describe('diffData', () => {
  it('counts documents only on one side or changed', () => {
    const local: SyncData = {
      ...base,
      courses: [course('a', 'A edited'), course('local-only')],
      revisions: [revision('r1', 'a', 0)],
    };
    const cloud: SyncData = {
      ...base,
      courses: [course('a', 'A'), course('cloud-only')],
      revisions: [revision('r1', 'a', 0), revision('r2', 'a', 1)],
    };
    const d = diffData(local, cloud);
    expect(d.courses).toMatchObject({ onlyLocal: 1, onlyCloud: 1, changed: 1 });
    expect(d.revisions).toMatchObject({ onlyLocal: 0, onlyCloud: 1, changed: 0 });
    expect(d.subjectsDiffer).toBe(false);
    expect(d.settingsDiffer).toBe(false);
  });

  it('reports different settings', () => {
    expect(diffData(base, { ...base, settings: { ...settings, theme: 'dark' } }).settingsDiffer).toBe(true);
  });
});

describe('sync meta (localStorage)', () => {
  it('flags unsynced changes until markSynced is called', () => {
    expect(hasUnsyncedChanges('u1', base)).toBe(true); // never synced
    markSynced('u1', base, '2026-10-01T10:00:00.000Z');
    expect(hasUnsyncedChanges('u1', base)).toBe(false);
    expect(hasUnsyncedChanges('u1', { ...base, courses: [course('a', 'edited')] })).toBe(true);
  });

  it('keeps meta per user', () => {
    markSynced('u1', base);
    expect(hasUnsyncedChanges('u2', base)).toBe(true);
  });

  it('only ever moves the stamp forward', () => {
    markSynced('u1', base, '2026-10-05T00:00:00.000Z');
    recordCloudWrite('u1', '2026-10-03T00:00:00.000Z');
    expect(getSyncMeta('u1').stamp).toBe('2026-10-05T00:00:00.000Z');
    recordCloudWrite('u1', '2026-10-09T00:00:00.000Z');
    expect(getSyncMeta('u1').stamp).toBe('2026-10-09T00:00:00.000Z');
  });

  it('recordCloudWrite does not mark data as synced', () => {
    markSynced('u1', base, '2026-10-01T00:00:00.000Z');
    const edited = { ...base, courses: [course('a', 'edited')] };
    recordCloudWrite('u1', '2026-10-02T00:00:00.000Z');
    expect(hasUnsyncedChanges('u1', edited)).toBe(true);
  });
});

describe('safety backups', () => {
  it('keeps the two most recent, newest first', () => {
    saveSafetyBackup('u1', base, 'first');
    saveSafetyBackup('u1', base, 'second');
    saveSafetyBackup('u1', base, 'third');
    expect(loadSafetyBackups('u1').map((b) => b.reason)).toEqual(['third', 'second']);
  });

  it('is isolated per user and tolerates missing or corrupt storage', () => {
    saveSafetyBackup('u1', base, 'x');
    expect(loadSafetyBackups('u2')).toEqual([]);
    localStorage.setItem('medj_safety_backups_v1_u3', '{not json');
    expect(loadSafetyBackups('u3')).toEqual([]);
  });
});

describe('pendingChanges', () => {
  const data: SyncData = {
    courses: [course('a'), course('b')],
    revisions: [revision('r1', 'a', 0), revision('r2', 'a', 1), revision('r3', 'b', 0)],
    subjects: [{ id: 's', name: 'S', color: 'teal' } as SyncData['subjects'][number]],
    settings,
  };

  it('sends everything when no per-document fingerprints exist yet', () => {
    const p = pendingChanges(data, undefined);
    expect(p.courses).toHaveLength(2);
    expect(p.revisions).toHaveLength(3);
    expect(p.subjects).toHaveLength(1);
    expect(p.count).toBe(7);
  });

  it('sends nothing right after a sync', () => {
    markSynced('u1', data, null);
    const p = pendingChanges(data, getSyncMeta('u1').docs);
    expect(p.count).toBe(0);
    expect(p.courses).toEqual([]);
    expect(p.revisions).toEqual([]);
  });

  it('sends only the modified and new documents', () => {
    markSynced('u1', data, null);
    const edited: SyncData = {
      ...data,
      revisions: [
        revision('r1', 'a', 0),
        { ...revision('r2', 'a', 1), scheduledDate: '2026-10-05' },
        revision('r3', 'b', 0),
        revision('r4', 'b', 1),
      ],
    };
    const p = pendingChanges(edited, getSyncMeta('u1').docs);
    expect(p.revisions.map((r) => r.id)).toEqual(['r2', 'r4']);
    expect(p.courses).toEqual([]);
    expect(p.count).toBe(2);
  });

  it('counts a settings change and ignores technical fields', () => {
    markSynced('u1', data, null);
    const docs = getSyncMeta('u1').docs;
    const withStamps: SyncData = {
      ...data,
      courses: data.courses.map((c) => ({ ...c, userId: 'u1', updatedAt: 'x' }) as Course),
    };
    expect(pendingChanges(withStamps, docs).count).toBe(0);
    const themed: SyncData = { ...data, settings: { ...settings, theme: 'dark' } };
    const p = pendingChanges(themed, docs);
    expect(p.count).toBe(1);
    expect(p.courses).toEqual([]);
  });

  it('ignores deleted documents (handled by targeted deletes)', () => {
    markSynced('u1', data, null);
    const p = pendingChanges({ ...data, courses: [course('a')] }, getSyncMeta('u1').docs);
    expect(p.count).toBe(0);
  });

  it('keeps the fingerprints when a cloud write is recorded', () => {
    markSynced('u1', data, null);
    recordCloudWrite('u1', '2026-10-03T00:00:00.000Z');
    expect(getSyncMeta('u1').docs).toBeDefined();
  });
});

describe('sync token', () => {
  const now = 1_000_000_000;

  it('is kept by recordCloudWrite and markSynced', () => {
    recordCloudWrite('u1', '2026-10-02T00:00:00.000Z', 'tok-1');
    markSynced('u1', base, '2026-10-02T00:00:00.000Z');
    expect(getSyncMeta('u1').token).toBe('tok-1');
    recordCloudToken('u1', 'tok-2');
    expect(getSyncMeta('u1').token).toBe('tok-2');
    recordCloudToken('u1', null);
    expect(getSyncMeta('u1').token).toBe('tok-2');
  });

  it('skips the full read only for a known token and a recent full read', () => {
    const meta = { token: 'tok' };
    expect(canSkipFullRead(meta, 'tok', now - 1000, now)).toBe(true);
    expect(canSkipFullRead(meta, 'other', now - 1000, now)).toBe(false);
    expect(canSkipFullRead(meta, null, now - 1000, now)).toBe(false);
    expect(canSkipFullRead({}, 'tok', now - 1000, now)).toBe(false);
    expect(canSkipFullRead(meta, 'tok', null, now)).toBe(false);
    expect(canSkipFullRead(meta, 'tok', now - FULL_READ_MAX_AGE_MS, now)).toBe(false);
  });

  it('is ignored when comparing data', () => {
    const withToken: SyncData = { ...base, settings: { ...settings, syncToken: 'x' } as AppSettings };
    expect(hashData(withToken)).toBe(hashData(base));
  });
});

describe('hashData format', () => {
  // Les empreintes sont enregistrées sur chaque appareil : changer le texte haché ferait croire à des
  // modifications locales (voire à un conflit) après une mise à jour. Ces valeurs ne doivent pas bouger.
  it('stays byte-for-byte stable', () => {
    expect(hashData(base)).toBe('4dec2f61:344');
    const reordered: SyncData = { ...base, courses: [course('b'), course('a')], revisions: [revision('r2', 'b', 1), revision('r1', 'a', 0)] };
    expect(hashData(reordered)).toBe('37473aa7:597');
  });

  it('follows a change inside a collection and in the settings', () => {
    const edited: SyncData = { ...base, revisions: [{ ...revision('r1', 'a', 0), completed: true }] };
    expect(hashData(edited)).not.toBe(hashData(base));
    expect(hashData({ ...base, settings: { ...settings, theme: 'dark' } })).not.toBe(hashData(base));
    expect(hashData({ ...base, revisions: [revision('r1', 'a', 0)] })).toBe(hashData(base)); // same content, new objects
  });
});
