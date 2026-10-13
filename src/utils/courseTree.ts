import { Course, Subject } from '../types';
import { getChildFolders, resolveCourseFolderId } from './folders';
import { getFolderColor } from './folderColors';
import { getCourseEffectiveColor } from './colorUtils';

/** Nœud de l'arbre discipline › dossier › sous-dossier › cours (choix d'un cours, sans compteurs). */
export interface CourseTreeNode {
  key: string;
  kind: 'subject' | 'folder' | 'course';
  label: string;
  color: string;
  children: CourseTreeNode[];
  courseId?: string;
}

/** Texte comparable : minuscules, sans accents. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Arbre complet des cours rangés par discipline et dossier ; les branches sans cours sont omises. */
export function buildCourseTree(subjects: Subject[], courses: Course[]): CourseTreeNode[] {
  const courseNodes = (list: Course[], subject: Subject): CourseTreeNode[] =>
    [...list]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((c) => ({
        key: `c:${c.id}`,
        kind: 'course' as const,
        label: c.title,
        color: getCourseEffectiveColor(c, subject),
        children: [],
        courseId: c.id,
      }));

  return [...subjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((subject) => {
      const own = courses.filter((c) => c.subjectId === subject.id);
      const inFolder = (folderId: string | undefined) => own.filter((c) => resolveCourseFolderId(c, subject) === folderId);
      const folderNode = (folderId: string, name: string): CourseTreeNode => ({
        key: `f:${folderId}`,
        kind: 'folder',
        label: name,
        color: getFolderColor(subject, folderId) ?? subject.color,
        children: [
          ...getChildFolders(subject, folderId).map((f) => folderNode(f.id, f.name)),
          ...courseNodes(inFolder(folderId), subject),
        ].filter(hasCourse),
      });
      return {
        key: `s:${subject.id}`,
        kind: 'subject' as const,
        label: subject.name,
        color: subject.color,
        children: [
          ...getChildFolders(subject).map((f) => folderNode(f.id, f.name)),
          ...courseNodes(inFolder(undefined), subject),
        ].filter(hasCourse),
      };
    })
    .filter(hasCourse);
}

function hasCourse(node: CourseTreeNode): boolean {
  return node.kind === 'course' || node.children.some(hasCourse);
}

/** Branches qui contiennent un cours dont le titre contient `query` ; les nœuds gardés sont tous dépliés. */
export function filterCourseTree(nodes: CourseTreeNode[], query: string): CourseTreeNode[] {
  const q = foldText(query);
  if (!q) return nodes;
  const walk = (list: CourseTreeNode[]): CourseTreeNode[] =>
    list.flatMap((n) => {
      if (n.kind === 'course') return foldText(n.label).includes(q) ? [n] : [];
      const children = walk(n.children);
      return children.length > 0 ? [{ ...n, children }] : [];
    });
  return walk(nodes);
}

/** Clés des nœuds à déplier pour voir ce cours (discipline et dossiers qui le contiennent), du haut vers le bas. */
export function pathToCourse(nodes: CourseTreeNode[], courseId: string): string[] {
  for (const n of nodes) {
    if (n.courseId === courseId) return [];
    const inner = pathToCourse(n.children, courseId);
    if (inner.length > 0 || n.children.some((c) => c.courseId === courseId)) return [n.key, ...inner];
  }
  return [];
}
