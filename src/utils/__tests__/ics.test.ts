import { describe, expect, it } from 'vitest';
import { AppSettings, Course, RevisionItem, Subject } from '../../types';
import { DEFAULT_SETTINGS } from '../seedData';
import { APP_FILE_PREFIX } from '../../appInfo';
import { buildIcs, escapeIcsText, foldIcsLine, selectIcsSlots } from '../ics';

const subject: Subject = {
  id: 's1', name: 'Cardio', code: 'CARD', color: '#e11d48', bgColor: '', textColor: '', borderColor: '', accentBg: '',
  folders: [{ id: 'f1', name: 'Rythmologie' }],
};
const course: Course = {
  id: 'c1', title: 'Troubles du rythme, ECG', itemCode: 'X', subjectId: 's1', folderId: 'f1', j0Date: '2026-10-12',
  activeJList: [0, 1], mastery: 0, createdAt: '2026-10-12',
  links: [{ id: 'l1', url: 'https://drive.google.com/x', typeId: 'lt_course' }],
};
const rev = (over: Partial<RevisionItem>): RevisionItem => ({
  id: 'r1', courseId: 'c1', jIndex: 0, scheduledDate: '2026-10-12', durationMinutes: 90, completed: false, slotOrder: 0, ...over,
});
const settings: AppSettings = { ...DEFAULT_SETTINGS, dayStartTime: '08:00', breaks: {}, dayWindows: {} };
const data = (revisions: RevisionItem[]) => ({ courses: [course], revisions, subjects: [subject], settings });
const base = { fromIso: '2026-10-12', includeCompleted: false, reminderMinutes: 0, calendarName: 'Révisions test', now: new Date('2026-10-11T10:00:00Z') };

describe('ics text helpers', () => {
  it('escapes special characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });
  it('folds long lines at 75 octets without splitting a character', () => {
    const line = 'DESCRIPTION:' + 'é'.repeat(80);
    const folded = foldIcsLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    folded.forEach((l) => expect(enc.encode(l).length).toBeLessThanOrEqual(75));
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(line);
  });
});

describe('buildIcs', () => {
  it('builds one event per upcoming slot, with stable UID, local times, links and path', () => {
    const { ics, count } = buildIcs(data([rev({})]), base);
    expect(count).toBe(1);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain(`UID:r1@${APP_FILE_PREFIX}`);
    expect(ics).toContain('DTSTART:20261012T080000');
    expect(ics).toContain('DTEND:20261012T093000');
    expect(ics).toContain('SUMMARY:J0 · Troubles du rythme\\, ECG');
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Cardio / Rythmologie');
    // sans intitulé : le nom du type ; avec un intitulé : celui-ci
    expect(unfolded).toContain('Cours : https://drive.google.com/x');
    const labelled = buildIcs(
      { ...data([rev({})]), courses: [{ ...course, links: [{ id: 'l2', url: 'https://a.fr/x', typeId: 'lt_cards', label: 'Mes cartes' }] }] },
      base
    ).ics.replace(/\r\n /g, '');
    expect(labelled).toContain('Mes cartes : https://a.fr/x');
    expect(ics).toContain('CATEGORIES:Cardio');
    expect(ics).not.toContain('VALARM');
  });

  it('keeps the planner times (explicit start, stacking) and skips filtered slots', () => {
    const revs = [
      rev({ id: 'a', slotOrder: 0, durationMinutes: 60, completed: true }),
      rev({ id: 'b', slotOrder: 1, durationMinutes: 60, startTime: '14:30' }),
      rev({ id: 'c', slotOrder: 2, durationMinutes: 30, scheduledDate: '2026-12-01' }),
    ];
    const slots = selectIcsSlots(data(revs), { fromIso: '2026-10-12', toIso: '2026-11-01', includeCompleted: false });
    expect(slots.map((s) => s.rev.id)).toEqual(['b']);
    expect(slots[0].start).toBe(14 * 60 + 30);
    // la tranche de tri ne dépend pas du créneau écarté : a (validé) occupe quand même 8h-9h
    const all = selectIcsSlots(data(revs), { fromIso: '2026-10-12', includeCompleted: true });
    expect(all.map((s) => s.rev.id)).toEqual(['a', 'b', 'c']);
    expect(all[0]).toMatchObject({ start: 480, end: 540 });
  });

  it('adds a reminder when asked', () => {
    const { ics } = buildIcs(data([rev({})]), { ...base, reminderMinutes: 10 });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('returns an empty calendar when nothing matches', () => {
    const r = buildIcs(data([rev({ scheduledDate: '2026-01-01' })]), base);
    expect(r.count).toBe(0);
    expect(r.ics).not.toContain('VEVENT');
  });

  it('marks a completed slot with a check, its validation date and a free status', () => {
    const done = rev({ completed: true, completedDate: '2026-10-12', rating: 3 });
    const { ics } = buildIcs(data([done]), { ...base, includeCompleted: true });
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:✓ J0 · Troubles du rythme');
    expect(unfolded).toContain('(3★)');
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });
});
