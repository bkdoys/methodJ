import { describe, expect, it } from 'vitest';
import { backoffDelayMs, eventIdForRevision, idsToDelete, isRetryable, isUnchanged, toGoogleEvent } from '../googleCalendar';

describe('google calendar helpers', () => {
  it('derives a stable, valid event id from a revision id', async () => {
    const a = await eventIdForRevision('rev_1');
    expect(a).toBe(await eventIdForRevision('rev_1'));
    expect(a).not.toBe(await eventIdForRevision('rev_2'));
    // base32hex minuscule, 5 à 1024 caractères
    expect(a).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it('lists the events that are no longer wanted', () => {
    expect(idsToDelete(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
    expect(idsToDelete([], new Set(['b']))).toEqual([]);
  });

  it('builds a Google event with local times, the managed mark and an optional reminder', () => {
    const e = { revisionId: 'r1', title: 'J1 · X', description: 'd', completed: false, date: '2026-10-12', start: 8 * 60, end: 9 * 60 + 30 };
    const g = toGoogleEvent('mjabc', e, 'Europe/Paris', 10);
    expect(g.start).toEqual({ dateTime: '2026-10-12T08:00:00', timeZone: 'Europe/Paris' });
    expect(g.end.dateTime).toBe('2026-10-12T09:30:00');
    expect(g.extendedProperties.private).toMatchObject({ medj: '1', medjRevisionId: 'r1' });
    expect(g.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] });
    expect(toGoogleEvent('mjabc', e, 'Europe/Paris', 0).reminders.overrides).toEqual([]);
    // fin de journée : minuit passe au jour suivant
    expect(toGoogleEvent('mjabc', { ...e, start: 23 * 60, end: 24 * 60 }, 'Europe/Paris', 0).end.dateTime).toBe('2026-10-13T00:00:00');
  });

  it('shows a completed slot as done: grey, free, no reminder', () => {
    const e = { revisionId: 'r1', title: '✓ J1 · X', description: 'd', completed: true, date: '2026-10-12', start: 480, end: 570 };
    const g = toGoogleEvent('mjabc', e, 'Europe/Paris', 10);
    expect(g.colorId).toBe('8');
    expect(g.transparency).toBe('transparent');
    expect(g.reminders.overrides).toEqual([]);
    expect(toGoogleEvent('mjabc', { ...e, completed: false }, 'Europe/Paris', 0).colorId).toBeUndefined();
  });

  it('retries only on rate limits and temporary errors, with a growing delay', () => {
    expect(isRetryable(403, 'rateLimitExceeded')).toBe(true);
    expect(isRetryable(403, 'userRateLimitExceeded')).toBe(true);
    expect(isRetryable(429, '')).toBe(true);
    expect(isRetryable(503, '')).toBe(true);
    expect(isRetryable(403, 'forbidden')).toBe(false);
    expect(isRetryable(404, '')).toBe(false);
    expect(backoffDelayMs(0, 0)).toBe(1000);
    expect(backoffDelayMs(2, 0)).toBe(4000);
    expect(backoffDelayMs(10, 0)).toBe(30000);
  });

  it('detects an event already identical in the calendar', () => {
    const e = { revisionId: 'r1', title: 'J1 · X', description: 'd', completed: false, date: '2026-10-12', start: 480, end: 570 };
    const wanted = toGoogleEvent('mjabc', e, 'Europe/Paris', 10);
    const same = {
      id: 'mjabc',
      summary: 'J1 · X',
      description: 'd',
      start: { dateTime: wanted.start.dateTime },
      end: { dateTime: wanted.end.dateTime },
      transparency: undefined,
      reminders: { useDefault: false, overrides: [{ minutes: 10 }] },
    };
    expect(isUnchanged(same, wanted)).toBe(true);
    expect(isUnchanged({ ...same, summary: '✓ J1 · X' }, wanted)).toBe(false);
    expect(isUnchanged({ ...same, reminders: { useDefault: false, overrides: [] } }, wanted)).toBe(false);
    expect(isUnchanged({ ...same, colorId: '8' }, wanted)).toBe(false);
  });
});
