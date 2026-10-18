import { Course, Deck } from '../types';
import { CardInput, clozeNumbers, liveCards, MAX_CARDS_PER_DECK, validateCard } from './flashcards';

/**
 * Import de cartes depuis un CSV / TSV : export Anki « Notes en texte brut » ou tableau fait dans un tableur.
 * Tout est pur : lecture du texte (`parseDelimited`), choix des colonnes (`guessMapping`), puis plan d'import
 * (`planCardsImport`) qui dit quelles cartes vont dans quel cours, et pourquoi une ligne est écartée.
 */

export const MAX_IMPORT_ROWS = 20000;

export interface ParsedTable {
  rows: string[][];
  /** Numéro de ligne (1 = première ligne du fichier) de chaque rangée, pour les messages. */
  lines: number[];
  separator: string;
  /** Colonnes déclarées par Anki (`#deck column:3`…), à ne pas prendre pour du contenu. */
  ankiColumns: { deck?: number; tags?: number; notetype?: number; guid?: number };
  /** Anki a déclaré `#html:true` : le texte est du HTML à ramener à du texte. */
  html: boolean;
}

const SEPARATOR_NAMES: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
  space: ' ',
};

/** Séparateur le plus probable : celui qui découpe les premières lignes en un nombre de colonnes stable (> 1). */
function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 20);
  let best = '\t';
  let bestScore = -1;
  for (const sep of ['\t', ';', ',', '|']) {
    const counts = sample.map((l) => splitLine(l, sep).length);
    if (counts.length === 0) continue;
    const first = counts[0];
    if (first < 2) continue;
    const stable = counts.filter((c) => c === first).length;
    const score = stable * 10 + first;
    if (score > bestScore) {
      bestScore = score;
      best = sep;
    }
  }
  return best;
}

// Découpe naïve d'une ligne, seulement pour deviner le séparateur
function splitLine(line: string, sep: string): string[] {
  return parseRows(line, sep).rows[0] ?? [];
}

/** Découpe CSV : champs entre guillemets (`""` = guillemet), retours à la ligne permis dans les guillemets. */
function parseRows(text: string, sep: string): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === sep) {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      lines.push(rowLine);
      row = [];
      field = '';
      atFieldStart = true;
      line++;
      rowLine = line;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
    lines.push(rowLine);
  }
  return { rows, lines };
}

/** Lit un CSV / TSV (avec les en-têtes `#…` des exports Anki). Les lignes vides sont ignorées. */
export function parseDelimited(input: string): ParsedTable {
  const text = input.replace(/^﻿/, '');
  const all = text.split(/\r\n|\n|\r/);
  // En-têtes Anki : lignes `#clé:valeur` au début du fichier
  let headerLines = 0;
  let separator: string | undefined;
  let html = false;
  const ankiColumns: ParsedTable['ankiColumns'] = {};
  for (const l of all) {
    const m = /^#([a-z ]+):(.*)$/i.exec(l);
    if (!m) break;
    headerLines++;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (key === 'separator') separator = SEPARATOR_NAMES[value.toLowerCase()] ?? (value.length === 1 ? value : undefined);
    else if (key === 'html') html = value.toLowerCase() === 'true';
    else if (key === 'deck column') ankiColumns.deck = Number(value) - 1;
    else if (key === 'tags column') ankiColumns.tags = Number(value) - 1;
    else if (key === 'notetype column') ankiColumns.notetype = Number(value) - 1;
    else if (key === 'guid column') ankiColumns.guid = Number(value) - 1;
  }
  const body = all.slice(headerLines).join('\n');
  const sep = separator ?? detectSeparator(all.slice(headerLines).filter((l) => l.trim() && !l.startsWith('#')));
  const parsed = parseRows(body, sep);
  const rows: string[][] = [];
  const lines: number[] = [];
  parsed.rows.forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    if (r.length === 1 && r[0].startsWith('#')) return;
    rows.push(r);
    lines.push(parsed.lines[i] + headerLines);
  });
  return { rows: rows.slice(0, MAX_IMPORT_ROWS), lines: lines.slice(0, MAX_IMPORT_ROWS), separator: sep, ankiColumns, html };
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** HTML d'Anki ramené à du texte : retours à la ligne gardés, balises et sons/images retirés, entités décodées. */
/**
 * Gras, italique, souligné, exposant et indice d'Anki → marqueurs de l'appli (utils/richText.ts), quand le contenu n'a
 * pas de balise ni le caractère du marqueur (sinon la balise est simplement retirée) ; jusqu'à trois niveaux imbriqués.
 */
function htmlMarks(html: string): string {
  const rules: [RegExp, string, RegExp][] = [
    [/<(?:sup)(?:\s[^>]*)?>([^<\s^]+)<\/sup>/gi, '^', /\^/],
    [/<(?:sub)(?:\s[^>]*)?>([^<\s~]+)<\/sub>/gi, '~', /~/],
    [/<(?:u)(?:\s[^>]*)?>([^<\n]*?\S)<\/u>/gi, '++', /\+\+/],
    [/<(i|em)(?:\s[^>]*)?>([^<\n]*?\S)<\/\1>/gi, '_', /_/],
    [/<(b|strong)(?:\s[^>]*)?>([^<\n]*?\S)<\/\1>/gi, '**', /\*\*/],
  ];
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const [re, mark, clash] of rules) {
      out = out.replace(re, (all, ...g: string[]) => {
        const inner = mark === '^' || mark === '~' || mark === '++' ? g[0] : g[1];
        return clash.test(inner) || inner.startsWith(' ') ? all : `${mark}${inner.trimStart()}${mark}`;
      });
    }
    if (out === before) break;
  }
  return out;
}

export function htmlToText(html: string): string {
  return htmlMarks(html)
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Colonnes

export interface ColumnMapping {
  front: number;
  /** -1 = pas de verso (cartes à trous seulement). */
  back: number;
  /** -1 = tout va dans le cours choisi. */
  course: number;
  /** La première rangée est une ligne de titres, à ne pas importer. */
  hasHeader: boolean;
}

const FRONT_NAMES = /^(recto|front|question|texte|text)$/i;
const BACK_NAMES = /^(verso|back|r[ée]ponse|answer|back extra|remarque|extra)$/i;
const COURSE_NAMES = /^(cours|course|item|chapitre|chapter|code)$/i;

/** Colonnes devinées : d'après une ligne de titres si elle existe, sinon recto = 1re, verso = 2e. */
export function guessMapping(table: ParsedTable): ColumnMapping {
  const first = table.rows[0] ?? [];
  const find = (re: RegExp) => first.findIndex((c) => re.test(c.trim()));
  const front = find(FRONT_NAMES);
  if (front >= 0) {
    return { front, back: find(BACK_NAMES), course: find(COURSE_NAMES), hasHeader: true };
  }
  const skip = new Set(Object.values(table.ankiColumns));
  const usable = first.map((_, i) => i).filter((i) => !skip.has(i));
  return { front: usable[0] ?? 0, back: usable[1] ?? -1, course: -1, hasHeader: false };
}

// ---------------------------------------------------------------------------
// Plan d'import

export type RejectReason = 'empty' | 'no-back' | 'unknown-course' | 'no-course' | 'full';

export interface ImportPlan {
  /** Cartes à ajouter, par cours, dans l'ordre du fichier. */
  byCourse: Record<string, CardInput[]>;
  added: number;
  /** Déjà présentes (dans le cours ou plus haut dans le fichier). */
  duplicates: number;
  rejected: { line: number; reason: RejectReason; course?: string }[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Retrouve un cours par son code (EDN-228) ou son titre exact, sans tenir compte de la casse. */
export function findCourse(value: string, courses: Course[]): Course | undefined {
  const v = norm(value);
  if (!v) return undefined;
  return courses.find((c) => c.itemCode && norm(c.itemCode) === v) ?? courses.find((c) => norm(c.title) === v);
}

export function planCardsImport(
  table: ParsedTable,
  mapping: ColumnMapping,
  ctx: { courses: Course[]; decks: Record<string, Deck>; defaultCourseId?: string }
): ImportPlan {
  const plan: ImportPlan = { byCourse: {}, added: 0, duplicates: 0, rejected: [] };
  const seen = new Map<string, Set<string>>();
  const room = new Map<string, number>();
  const known = (courseId: string) => {
    if (!seen.has(courseId)) {
      const cards = liveCards(ctx.decks[courseId]);
      seen.set(courseId, new Set(cards.map((c) => `${c.kind}|${norm(c.front)}`)));
      room.set(courseId, MAX_CARDS_PER_DECK - cards.length);
    }
    return seen.get(courseId)!;
  };
  const clean = (s: string | undefined) => (table.html ? htmlToText(s ?? '') : (s ?? '').trim());

  table.rows.forEach((row, i) => {
    if (i === 0 && mapping.hasHeader) return;
    const line = table.lines[i];
    const front = clean(row[mapping.front]);
    const back = mapping.back >= 0 ? clean(row[mapping.back]) : '';
    if (!front) {
      plan.rejected.push({ line, reason: 'empty' });
      return;
    }

    let courseId = ctx.defaultCourseId;
    const courseCell = mapping.course >= 0 ? (row[mapping.course] ?? '').trim() : '';
    if (courseCell) {
      const course = findCourse(courseCell, ctx.courses);
      if (!course) {
        plan.rejected.push({ line, reason: 'unknown-course', course: courseCell });
        return;
      }
      courseId = course.id;
    }
    if (!courseId) {
      plan.rejected.push({ line, reason: 'no-course' });
      return;
    }

    const input: CardInput = clozeNumbers(front).length > 0
      ? { kind: 'cloze', front, ...(back ? { back } : {}) }
      : { kind: 'basic', front, back };
    if (validateCard(input)) {
      plan.rejected.push({ line, reason: input.kind === 'basic' && !back ? 'no-back' : 'empty' });
      return;
    }
    const keys = known(courseId);
    const key = `${input.kind}|${norm(input.front)}`;
    if (keys.has(key)) {
      plan.duplicates++;
      return;
    }
    if ((room.get(courseId) ?? 0) <= 0) {
      plan.rejected.push({ line, reason: 'full' });
      return;
    }
    keys.add(key);
    room.set(courseId, (room.get(courseId) ?? 0) - 1);
    (plan.byCourse[courseId] ??= []).push(input);
    plan.added++;
  });
  return plan;
}

/** Texte d'un fichier : UTF-8, sinon Windows-1252 (CSV enregistré par Excel sous Windows). */
export function decodeFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
