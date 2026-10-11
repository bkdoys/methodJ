import { Subject, SubjectFolder } from '../types';
import { MAX_FOLDERS_PER_SUBJECT, MAX_FOLDER_DEPTH } from './folders';
import { PRESET_COURSE_COLORS } from './colorUtils';
import { t } from '../i18n';

export interface SubjectsImportResult {
  added: Subject[];
  /** Disciplines déjà présentes qui reçoivent de nouveaux dossiers (version complète, à substituer à l'ancienne). */
  updated: Subject[];
  /** Nombre de dossiers créés (dans les disciplines ajoutées ou mises à jour). */
  foldersAdded: number;
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
  /** Dossiers : noms (niveau 1) avec leurs sous-dossiers, ou liste à plat { id, name, parentId } d'une sauvegarde. */
  folders?: unknown;
  children?: unknown;
}

interface FolderNode {
  name: string;
  children: string[];
}

/** Nombre d'espaces de tête d'une ligne (une tabulation compte pour 4). */
function indentOf(line: string): number {
  const lead = line.match(/^[ \t]*/)![0];
  return lead.replace(/\t/g, '    ').length;
}

const nameOf = (x: unknown): string =>
  typeof x === 'string' ? x.trim().slice(0, 100) : typeof (x as RawSubject)?.name === 'string' ? String((x as RawSubject).name).trim().slice(0, 100) : '';

/** Dossiers d'un JSON : liste imbriquée (noms / { name, children }) ou à plat (id + parentId, comme une sauvegarde). */
function foldersFromJson(raw: unknown): FolderNode[] {
  if (!Array.isArray(raw)) return [];
  const isFlat = raw.some((x) => x && typeof x === 'object' && 'id' in (x as object));
  if (isFlat) {
    const items = raw.filter((x) => x && typeof x === 'object') as { id?: unknown; name?: unknown; parentId?: unknown }[];
    const roots = items.filter((x) => !x.parentId && nameOf(x));
    return roots.map((r) => ({
      name: nameOf(r),
      children: items.filter((x) => x.parentId && x.parentId === r.id).map(nameOf).filter(Boolean),
    }));
  }
  return raw
    .map((x) => ({
      name: nameOf(x),
      children: Array.isArray((x as RawSubject)?.children)
        ? ((x as RawSubject).children as unknown[]).map(nameOf).filter(Boolean)
        : [],
    }))
    .filter((n) => n.name);
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

  // CSV / TXT : nom;code;couleur (séparateurs ; , ou tabulation). Une ligne indentée est un dossier de la discipline au-dessus
  // (une seconde indentation, un sous-dossier).
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const rows: RawSubject[] = [];
  let indents: number[] = []; // indentations des niveaux de dossiers ouverts sous la dernière discipline
  let lastFolder: FolderNode | null = null;
  for (const line of lines) {
    const indent = indentOf(line);
    const body = line.trim().replace(/^[-*•]\s+/, '');
    if (indent === 0 && !/^[-*•]\s/.test(line)) {
      const sep = body.includes(';') ? ';' : body.includes('\t') ? '\t' : ',';
      const [name, code, color] = body.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      rows.push({ name, code, color });
      indents = [];
      lastFolder = null;
      continue;
    }
    const root = rows[rows.length - 1];
    const name = body.replace(/^"|"$/g, '').slice(0, 100);
    if (!root || !root.name) {
      rows.push({}); // dossier sans discipline : compté comme invalide
      continue;
    }
    const folders = (root.folders ??= []) as FolderNode[];
    while (indents.length && indent < indents[indents.length - 1]) indents.pop();
    if (indents.length === 0 || indent === indents[0] || !lastFolder) {
      indents = [indent];
      lastFolder = { name, children: [] };
      folders.push(lastFolder);
    } else {
      if (indent > indents[indents.length - 1] && indents.length < MAX_FOLDER_DEPTH) indents.push(indent);
      lastFolder.children.push(name);
    }
  }
  const first = String(rows[0]?.name ?? '').toLowerCase();
  if (['nom', 'name', 'matière', 'matiere', 'discipline'].includes(first)) rows.shift();
  return rows;
}

/** Fusionne des dossiers (noms) dans une discipline sans créer de doublon (même nom, même niveau). Renvoie le nombre de créations. */
function mergeFolders(subject: Subject, nodes: FolderNode[], nextId: () => string): { subject: Subject; created: number } {
  const folders: SubjectFolder[] = [...(subject.folders ?? [])];
  let created = 0;
  const find = (name: string, parentId?: string) =>
    folders.find((f) => (f.parentId ?? undefined) === parentId && f.name.toLowerCase() === name.toLowerCase());
  for (const node of nodes) {
    let parent = find(node.name);
    if (!parent) {
      if (folders.length >= MAX_FOLDERS_PER_SUBJECT) break;
      parent = { id: nextId(), name: node.name };
      folders.push(parent);
      created++;
    }
    for (const childName of node.children) {
      if (find(childName, parent.id)) continue;
      if (folders.length >= MAX_FOLDERS_PER_SUBJECT) break;
      folders.push({ id: nextId(), name: childName, parentId: parent.id });
      created++;
    }
  }
  return { subject: created ? { ...subject, folders } : subject, created };
}

export function parseSubjectsImport(text: string, existing: Subject[]): SubjectsImportResult {
  const raw = parseRaw(text);
  const usedNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  const usedIds = new Set(existing.map((s) => s.id));
  const added: Subject[] = [];
  const updatedById = new Map<string, Subject>();
  let foldersAdded = 0;
  let duplicates = 0;
  let invalid = 0;
  let folderSeq = 0;
  const stamp = Date.now().toString(36);
  const nextFolderId = () => `f_${stamp}${(folderSeq++).toString(36)}`;

  raw.forEach((item, i) => {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 100) : '';
    if (!name) {
      invalid++;
      return;
    }
    const key = name.toLowerCase();
    const nodes: FolderNode[] = Array.isArray(item.folders) && item.folders.every((f) => f && typeof (f as FolderNode).name === 'string' && Array.isArray((f as FolderNode).children))
      ? (item.folders as FolderNode[])
      : foldersFromJson(item.folders);

    if (usedNames.has(key)) {
      // Discipline déjà là : on ne la recrée pas, mais ses nouveaux dossiers sont ajoutés
      const current = existing.find((s) => s.name.trim().toLowerCase() === key) ?? added.find((s) => s.name.toLowerCase() === key);
      const base = current && (updatedById.get(current.id) ?? current);
      const merged = base ? mergeFolders(base, nodes, nextFolderId) : null;
      if (merged && current && merged.created > 0) {
        foldersAdded += merged.created;
        const idx = added.findIndex((s) => s.id === current.id);
        if (idx >= 0) added[idx] = merged.subject;
        else updatedById.set(current.id, merged.subject);
      } else {
        duplicates++;
      }
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
    const subject: Subject = {
      id,
      name,
      code,
      color,
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-200',
      accentBg: `${color}15`,
    };
    const merged = mergeFolders(subject, nodes, nextFolderId);
    foldersAdded += merged.created;
    added.push(merged.subject);
  });

  return { added, updated: [...updatedById.values()], foldersAdded, duplicates, invalid };
}
