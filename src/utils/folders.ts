import { Course, Subject, SubjectFolder } from '../types';

/** Sous-niveaux sous une discipline (discipline > dossier > sous-dossier ; les cours sont au bout). */
export const MAX_FOLDER_DEPTH = 2;
export const MAX_FOLDERS_PER_SUBJECT = 200;
const MAX_NAME_LENGTH = 100;

export function getFolders(subject: Subject | undefined): SubjectFolder[] {
  return subject?.folders ?? [];
}

/** Dossiers de premier niveau, ou enfants d'un dossier. */
export function getChildFolders(subject: Subject, parentId?: string): SubjectFolder[] {
  return getFolders(subject).filter((f) => (f.parentId ?? undefined) === parentId);
}

/** Chaîne de dossiers de la racine jusqu'au dossier demandé ; vide si absent ou inconnu. */
export function getFolderChain(subject: Subject | undefined, folderId: string | undefined): SubjectFolder[] {
  if (!subject || !folderId) return [];
  const byId = new Map(getFolders(subject).map((f) => [f.id, f]));
  const chain: SubjectFolder[] = [];
  let cur = byId.get(folderId);
  while (cur && chain.length < MAX_FOLDER_DEPTH) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** Le dossier lui-même et tous ses descendants. */
export function getFolderSubtreeIds(subject: Subject, folderId: string): Set<string> {
  const ids = new Set<string>([folderId]);
  getFolders(subject).forEach((f) => {
    if (f.parentId === folderId) ids.add(f.id);
  });
  return ids;
}

/** Un cours appartient à un nœud de l'arbre : une discipline (tout dedans) ou un dossier (lui et ses descendants). */
export function courseInNode(
  course: Pick<Course, 'subjectId' | 'folderId'>,
  node: { subjectId: string; folderId?: string },
  subjects: Subject[]
): boolean {
  if (course.subjectId !== node.subjectId) return false;
  if (!node.folderId) return true;
  const subject = subjects.find((s) => s.id === node.subjectId);
  if (!subject || !course.folderId) return false;
  return getFolderSubtreeIds(subject, node.folderId).has(course.folderId);
}

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export function newFolderId(): string {
  return `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ajoute un dossier (niveau 1, ou niveau 2 sous un dossier de niveau 1). Renvoie la discipline inchangée si impossible. */
export function addFolder(subject: Subject, name: string, parentId?: string, id: string = newFolderId()): Subject {
  const clean = cleanName(name);
  const folders = getFolders(subject);
  if (!clean || folders.length >= MAX_FOLDERS_PER_SUBJECT) return subject;
  if (parentId) {
    const parent = folders.find((f) => f.id === parentId);
    if (!parent || parent.parentId) return subject; // 2 niveaux max
  }
  const folder: SubjectFolder = parentId ? { id, name: clean, parentId } : { id, name: clean };
  return { ...subject, folders: [...folders, folder] };
}

export function renameFolder(subject: Subject, folderId: string, name: string): Subject {
  const clean = cleanName(name);
  if (!clean) return subject;
  return { ...subject, folders: getFolders(subject).map((f) => (f.id === folderId ? { ...f, name: clean } : f)) };
}

/**
 * Supprime un dossier sans rien perdre : ses sous-dossiers et ses cours remontent d'un niveau.
 * `courseTarget` = dossier qui reçoit ses cours (`undefined` = racine de la discipline).
 */
export function deleteFolder(
  subject: Subject,
  folderId: string
): { subject: Subject; courseTarget: string | undefined } {
  const folders = getFolders(subject);
  const target = folders.find((f) => f.id === folderId);
  if (!target) return { subject, courseTarget: undefined };
  const courseTarget = target.parentId;
  const next = folders
    .filter((f) => f.id !== folderId)
    .map((f) => {
      if (f.parentId !== folderId) return f;
      const { parentId: _drop, ...rest } = f;
      return target.parentId ? { ...rest, parentId: target.parentId } : rest;
    });
  return { subject: { ...subject, folders: next }, courseTarget };
}

/** Enlève de la discipline les `folderId` qui ne pointent plus sur un dossier existant (affichage et sauvegarde sains). */
export function resolveCourseFolderId(course: Pick<Course, 'folderId'>, subject: Subject | undefined): string | undefined {
  return course.folderId && getFolders(subject).some((f) => f.id === course.folderId) ? course.folderId : undefined;
}

/**
 * Chemin lisible d'un cours : « ICM / Intro Médicaments / Sous-partie ».
 * Trop long avec 3 niveaux, on garde la fin : « … / Sous-partie ».
 */
export function formatCoursePath(
  subject: Subject | undefined,
  folderId: string | undefined,
  maxChars = 44
): { text: string; full: string } {
  const parts = [subject?.name ?? '', ...getFolderChain(subject, folderId).map((f) => f.name)].filter(Boolean);
  const full = parts.join(' / ');
  if (full.length <= maxChars || parts.length < 3) return { text: full, full };
  return { text: `… / ${parts[parts.length - 1]}`, full };
}
