import { describe, expect, it } from 'vitest';
import { Course, Subject } from '../../types';
import { buildCourseTree, filterCourseTree, foldText, pathToCourse } from '../courseTree';
import { addFolder } from '../folders';

let icm: Subject = {
  id: 's1', name: 'ICM', code: 'ICM', color: '#112233', bgColor: '', textColor: '', borderColor: '', accentBg: '',
};
icm = addFolder(icm, 'Pharmaco', undefined, 'fp');
icm = addFolder(icm, 'Intro', 'fp', 'fi');
const anat: Subject = { ...icm, id: 's2', name: 'Anatomie', code: 'ANA', color: '#445566', folders: undefined };
const empty: Subject = { ...icm, id: 's3', name: 'Vide', folders: undefined };

const course = (id: string, title: string, subjectId: string, folderId?: string) =>
  ({ id, title, subjectId, folderId }) as Course;
const courses = [
  course('c1', 'Généralités', 's1'),
  course('c2', 'Médicaments', 's1', 'fp'),
  course('c3', 'Éléments de pharmacocinétique', 's1', 'fi'),
  course('c4', 'Os du crâne', 's2'),
  course('c5', 'Orphelin', 's1', 'dossier-supprime'),
];

describe('courseTree', () => {
  const tree = buildCourseTree([icm, anat, empty], courses);

  it('orders disciplines by name, folders before courses, and omits empty branches', () => {
    expect(tree.map((n) => n.label)).toEqual(['Anatomie', 'ICM']);
    const icmNode = tree[1];
    expect(icmNode.children.map((n) => [n.kind, n.label])).toEqual([
      ['folder', 'Pharmaco'],
      ['course', 'Généralités'],
      ['course', 'Orphelin'], // dossier disparu : racine de la discipline
    ]);
    const pharmaco = icmNode.children[0];
    expect(pharmaco.children.map((n) => [n.kind, n.label])).toEqual([
      ['folder', 'Intro'],
      ['course', 'Médicaments'],
    ]);
  });

  it('gives each node a colour', () => {
    expect(tree[1].color).toBe('#112233');
    expect(tree[1].children[0].color).toMatch(/^#|^hsl|^rgb/);
    expect(tree[1].children[1].color).toMatch(/^#|^hsl|^rgb/);
  });

  it('filters by course title, ignoring case and accents, keeping the branch', () => {
    expect(foldText('  Éléments ')).toBe('elements');
    const found = filterCourseTree(tree, 'ELEMENTS');
    expect(found.map((n) => n.label)).toEqual(['ICM']);
    expect(found[0].children[0].children[0].children.map((n) => n.label)).toEqual(['Éléments de pharmacocinétique']);
    expect(filterCourseTree(tree, 'zzz')).toEqual([]);
    expect(filterCourseTree(tree, '  ')).toBe(tree);
  });

  it('finds the branches to open for a course', () => {
    expect(pathToCourse(tree, 'c3')).toEqual(['s:s1', 'f:fp', 'f:fi']);
    expect(pathToCourse(tree, 'c1')).toEqual(['s:s1']);
    expect(pathToCourse(tree, 'inconnu')).toEqual([]);
  });
});
