import { parseIsoDate } from './dateUtils';

/** Limite appliquée par firestore.rules sur `notes` (cours et créneaux). */
export const MAX_NOTES_LENGTH = 5000;

/** « [J3 · 12 oct.] texte de la note » : repère le créneau (J3, R2…) et la date d'origine dans les notes du cours. */
export function formatSlotNoteEntry(label: string, dateIso: string, note: string): string {
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(parseIsoDate(dateIso));
  return `[${label} · ${day}] ${note.trim()}`;
}

export type AppendNoteResult =
  | { status: 'added'; notes: string }
  | { status: 'duplicate' }
  | { status: 'empty' }
  | { status: 'too-long'; overBy: number };

/** Ajoute une entrée à la fin des notes du cours, sans doublon et sans dépasser la limite. */
export function appendNoteEntry(existing: string | undefined, entry: string): AppendNoteResult {
  const current = (existing ?? '').trimEnd();
  const body = entry.trim();
  if (!body) return { status: 'empty' };
  if (current.includes(body)) return { status: 'duplicate' };
  const notes = current ? `${current}\n${body}` : body;
  if (notes.length > MAX_NOTES_LENGTH) return { status: 'too-long', overBy: notes.length - MAX_NOTES_LENGTH };
  return { status: 'added', notes };
}

/** Cette entrée figure-t-elle déjà dans les notes du cours ? */
export function hasNoteEntry(existing: string | undefined, entry: string): boolean {
  return !!existing && !!entry.trim() && existing.includes(entry.trim());
}
