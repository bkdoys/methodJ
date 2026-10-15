import { describe, expect, it } from 'vitest';
import { MAX_NOTES_LENGTH, appendNoteEntry, formatSlotNoteEntry, hasNoteEntry } from '../notes';

describe('formatSlotNoteEntry', () => {
  it('prefixes the J step and the short date, and trims the note', () => {
    expect(formatSlotNoteEntry('J3', '2026-10-12', '  Troponine H0 et H3  ')).toBe('[J3 · 12 oct.] Troponine H0 et H3');
  });

  it('keeps multi-line notes intact', () => {
    expect(formatSlotNoteEntry('J0', '2026-01-05', 'a\nb')).toBe('[J0 · 5 janv.] a\nb');
  });
});

describe('appendNoteEntry', () => {
  const entry = '[J3 · 12 oct.] Troponine';

  it('starts the notes when empty or undefined', () => {
    expect(appendNoteEntry(undefined, entry)).toEqual({ status: 'added', notes: entry });
    expect(appendNoteEntry('', entry)).toEqual({ status: 'added', notes: entry });
  });

  it('appends on a new line and ignores trailing whitespace', () => {
    expect(appendNoteEntry('Mon résumé  \n', entry)).toEqual({ status: 'added', notes: `Mon résumé\n${entry}` });
  });

  it('does not add the same entry twice', () => {
    const first = appendNoteEntry('Mon résumé', entry);
    expect(first.status).toBe('added');
    const notes = first.status === 'added' ? first.notes : '';
    expect(appendNoteEntry(notes, entry)).toEqual({ status: 'duplicate' });
  });

  it('rejects empty entries', () => {
    expect(appendNoteEntry('abc', '   ')).toEqual({ status: 'empty' });
  });

  it('refuses to exceed the Firestore limit and reports by how much', () => {
    const existing = 'x'.repeat(MAX_NOTES_LENGTH - 5);
    const res = appendNoteEntry(existing, 'y'.repeat(10));
    expect(res).toEqual({ status: 'too-long', overBy: 6 });
  });

  it('accepts an entry that lands exactly on the limit', () => {
    const existing = 'x'.repeat(MAX_NOTES_LENGTH - 11);
    expect(appendNoteEntry(existing, 'y'.repeat(10)).status).toBe('added');
  });
});

describe('hasNoteEntry', () => {
  it('detects an entry already present', () => {
    expect(hasNoteEntry('avant\n[J1 · 2 oct.] x\naprès', '[J1 · 2 oct.] x')).toBe(true);
    expect(hasNoteEntry('rien', '[J1 · 2 oct.] x')).toBe(false);
    expect(hasNoteEntry(undefined, 'x')).toBe(false);
    expect(hasNoteEntry('abc', '  ')).toBe(false);
  });
});
