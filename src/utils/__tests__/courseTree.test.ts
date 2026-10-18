import { describe, expect, it } from 'vitest';
import { Course, Subject } from '../../types';
import { buildCourseTree, courseChoices, filterCourseTree, foldText, pathToCourse } from '../courseTree';
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

describe('courseChoices', () => {
  const twin = course('c6', 'Généralités', 's1', 'fp'); // même titre que c1, rangé dans un dossier
  const inbox = { ...course('c_inbox', 'Cartes à trier', 's1'), inbox: true } as Course;
  const all = [...courses, twin, inbox];

  it('lists only courses, by discipline, the root first and then each folder', () => {
    const groups = courseChoices([icm, anat, empty], all);
    expect(groups.map((g) => g.subject.name)).toEqual(['Anatomie', 'ICM']);
    expect(groups[1].items.map((i) => [i.course.id, i.folderPath])).toEqual([
      ['c1', ''],
      ['c5', ''], // dossier disparu : racine
      ['c6', 'Pharmaco'],
      ['c2', 'Pharmaco'],
      ['c3', 'Pharmaco › Intro'],
    ]);
  });

  it('tells two courses of the same title apart by their folder', () => {
    const items = courseChoices([icm], all)[0].items.filter((i) => i.course.title === 'Généralités');
    expect(items.map((i) => i.folderPath)).toEqual(['', 'Pharmaco']);
  });

  it('leaves out the inbox and the disciplines without a course', () => {
    const groups = courseChoices([icm, anat, empty], all);
    expect(groups.flatMap((g) => g.items).some((i) => i.course.id === 'c_inbox')).toBe(false);
    expect(groups.some((g) => g.subject.id === 's3')).toBe(false);
  });

  it('searches title, folder and discipline, accents and case ignored, every word required', () => {
    const ids = (q: string) => courseChoices([icm, anat, empty], all, q).flatMap((g) => g.items.map((i) => i.course.id));
    expect(ids('elements')).toEqual(['c3']);
    expect(ids('PHARMACO intro')).toEqual(['c3']);
    expect(ids('pharmaco')).toEqual(['c6', 'c2', 'c3']);
    expect(ids('anatomie')).toEqual(['c4']);
    expect(ids('zzz')).toEqual([]);
    expect(ids('   ')).toHaveLength(6);
  });

  it('gives each course its own colour, else its folder or discipline colour', () => {
    const own = { ...course('c7', 'Perso', 's2'), customColor: '#abcdef' } as Course;
    const g = courseChoices([anat], [own, courses[3]])[0];
    expect(g.items.find((i) => i.course.id === 'c7')?.color).toBe('#abcdef');
    expect(g.items.find((i) => i.course.id === 'c4')?.color).toBe('#445566');
  });

  it('sorts numbered titles naturally', () => {
    const list = [course('a', 'Cours 10', 's2'), course('b', 'Cours 2', 's2')];
    expect(courseChoices([anat], list)[0].items.map((i) => i.course.title)).toEqual(['Cours 2', 'Cours 10']);
  });
});
