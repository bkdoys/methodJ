import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettings, Course, RevisionItem, Subject } from '../../types';
import { loadStoredData, parseImportDecks, saveStoredData } from '../storage';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = vi.fn((k: string, v: string) => void this.m.set(k, v));
  removeItem = (k: string) => void this.m.delete(k);
  clear = () => this.m.clear();
}
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;
});

const courses = [{ id: 'c1', title: 'C1', itemCode: 'c1', subjectId: 's1', j0Date: '2026-10-01', activeJList: [0], mastery: 0, createdAt: '2026-10-01' }] as Course[];
const revisions = [{ id: 'r1', courseId: 'c1', jIndex: 0, scheduledDate: '2026-10-01', durationMinutes: 60, completed: false, slotOrder: 0 }] as RevisionItem[];
const subjects = [{ id: 's1', name: 'S', code: 'S', color: '#000' }] as Subject[];
const settings = { theme: 'light', dailyTargetHours: 4 } as AppSettings;
const writtenKeys = () => storage.setItem.mock.calls.map(([k]) => k);

describe('saveStoredData', () => {
  it('writes only the collections whose reference changed', () => {
    saveStoredData(courses, revisions, subjects, settings, 'u-a');
    expect(writtenKeys()).toHaveLength(4);
    storage.setItem.mockClear();

    saveStoredData(courses, revisions, subjects, settings, 'u-a');
    expect(writtenKeys()).toEqual([]);

    const moved = [{ ...revisions[0], scheduledDate: '2026-10-03' }];
    saveStoredData(courses, moved, subjects, settings, 'u-a');
    expect(writtenKeys()).toEqual(['medj_revisions_v1_u-a']);
    expect(loadStoredData('u-a').revisions[0].scheduledDate).toBe('2026-10-03');
  });

  it('writes everything for another account', () => {
    saveStoredData(courses, revisions, subjects, settings, 'u-b');
    storage.setItem.mockClear();
    saveStoredData(courses, revisions, subjects, settings, 'u-c');
    expect(writtenKeys()).toHaveLength(4);
  });

  it('retries a key whose write failed', () => {
    saveStoredData(courses, revisions, subjects, settings, 'u-d');
    const next = [...revisions];
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    saveStoredData(courses, next, subjects, settings, 'u-d'); // fails, logged
    storage.setItem.mockClear();
    saveStoredData(courses, next, subjects, settings, 'u-d');
    expect(writtenKeys()).toEqual(['medj_revisions_v1_u-d']);
  });
});

describe('parseImportDecks', () => {
  const card = { id: 'k1', kind: 'basic', front: 'q', back: 'r', createdAt: 't', updatedAt: 't' };

  it('reads the decks of a backup and skips invalid ones', () => {
    const json = JSON.stringify({
      courses: [],
      revisions: [],
      decks: [
        { id: 'c1', cards: [card], review: {}, userId: 'u' },
        { id: 'c2', cards: [{ ...card, kind: 'image' }], review: {} },
        { id: 3, cards: [], review: {} },
      ],
    });
    expect(parseImportDecks(json)).toEqual([{ id: 'c1', cards: [card], review: {} }]);
  });

  it('returns nothing for an old backup or broken JSON', () => {
    expect(parseImportDecks(JSON.stringify({ courses: [], revisions: [] }))).toEqual([]);
    expect(parseImportDecks('{')).toEqual([]);
  });
});
