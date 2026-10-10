import { Subject } from '../types';
import { PRESET_COURSE_COLORS } from './colorUtils';
import { t } from '../i18n';

export interface SubjectsImportResult {
  added: Subject[];
  duplicates: number;
  invalid: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let v = value.trim();
  if (!v.startsWith('#')) v = `#${v}`;
  if (!HEX.test(v)) return null;
  if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v.toLowerCase();
}

function deriveCode(name: string): string {
  const code = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return code || 'MED';
}

interface RawSubject {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  color?: unknown;
}

function parseRaw(text: string): RawSubject[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // JSON : tableau, ou { subjects: [...] } (format de l'export de sauvegarde)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed?.subjects;
    if (!Array.isArray(list)) throw new Error(t('Aucune liste de matières trouvée'));
    return list.map((x) => (typeof x === 'string' ? { name: x } : (x as RawSubject)));
  }

  // CSV / TXT : nom;code;couleur (séparateurs ; , ou tabulation)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((line) => {
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const [name, code, color] = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    return { name, code, color } as RawSubject;
  });
  const first = String(rows[0]?.name ?? '').toLowerCase();
  if (['nom', 'name', 'matière', 'matiere', 'discipline'].includes(first)) rows.shift();
  return rows;
}

export function parseSubjectsImport(text: string, existing: Subject[]): SubjectsImportResult {
  const raw = parseRaw(text);
  const usedNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  const usedIds = new Set(existing.map((s) => s.id));
  const added: Subject[] = [];
  let duplicates = 0;
  let invalid = 0;

  raw.forEach((item, i) => {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 100) : '';
    if (!name) {
      invalid++;
      return;
    }
    const key = name.toLowerCase();
    if (usedNames.has(key)) {
      duplicates++;
      return;
    }

    const color =
      normalizeHex(item.color) ??
      PRESET_COURSE_COLORS[(existing.length + added.length) % PRESET_COURSE_COLORS.length].hex;
    const code =
      typeof item.code === 'string' && item.code.trim()
        ? item.code.trim().toUpperCase().slice(0, 20)
        : deriveCode(name);

    let id =
      typeof item.id === 'string' && SAFE_ID.test(item.id) && !usedIds.has(item.id)
        ? item.id
        : `sub_${Date.now()}_${i}`;
    while (usedIds.has(id)) id = `${id}x`;

    usedNames.add(key);
    usedIds.add(id);
    added.push({
      id,
      name,
      code,
      color,
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-200',
      accentBg: `${color}15`,
    });
  });

  return { added, duplicates, invalid };
}