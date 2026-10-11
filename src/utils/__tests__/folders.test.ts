import { describe, expect, it } from 'vitest';
import { Subject } from '../../types';
import {
  addFolder,
  courseInNode,
  deleteFolder,
  formatCoursePath,
  getChildFolders,
  getFolderChain,
  renameFolder,
  resolveCourseFolderId,
} from '../folders';

const base: Subject = {
  id: 's1', name: 'ICM', code: 'ICM', color: '#000000',
  bgColor: '', textColor: '', borderColor: '', accentBg: '',
};

function build(): Subject {
  let s = addFolder(base, 'Intro Médicaments', undefined, 'a');
  s = addFolder(s, 'Pharmacocinétique', 'a', 'b');
  s = addFolder(s, 'Autre', undefined, 'c');
  return s;
}

describe('folders', () => {
  it('builds at most 2 levels', () => {
    const s = build();
    expect(getChildFolders(s)).toHaveLength(2);
    expect(getChildFolders(s, 'a').map((f) => f.id)).toEqual(['b']);
    expect(addFolder(s, 'Trop profond', 'b')).toBe(s);
    expect(addFolder(s, '   ')).toBe(s);
    expect(addFolder(s, 'x', 'inconnu')).toBe(s);
  });

  it('returns the chain root → leaf', () => {
    expect(getFolderChain(build(), 'b').map((f) => f.name)).toEqual(['Intro Médicaments', 'Pharmacocinétique']);
    expect(getFolderChain(build(), 'zzz')).toEqual([]);
  });

  it('renames a folder', () => {
    expect(getFolderChain(renameFolder(build(), 'a', 'Intro'), 'a')[0].name).toBe('Intro');
  });

  it('deletes a folder and lifts its children and courses', () => {
    const { subject, courseTarget } = deleteFolder(build(), 'a');
    expect(courseTarget).toBeUndefined();
    expect(subject.folders?.find((f) => f.id === 'b')).toEqual({ id: 'b', name: 'Pharmacocinétique' });
    const r = deleteFolder(build(), 'b');
    expect(r.courseTarget).toBe('a');
    expect(r.subject.folders?.some((f) => f.id === 'b')).toBe(false);
  });

  it('matches courses in a node and its descendants', () => {
    const subjects = [build()];
    const c = (folderId?: string) => ({ subjectId: 's1', folderId });
    expect(courseInNode(c('b'), { subjectId: 's1' }, subjects)).toBe(true);
    expect(courseInNode(c(), { subjectId: 's1' }, subjects)).toBe(true);
    expect(courseInNode(c('b'), { subjectId: 's1', folderId: 'a' }, subjects)).toBe(true);
    expect(courseInNode(c('c'), { subjectId: 's1', folderId: 'a' }, subjects)).toBe(false);
    expect(courseInNode(c(), { subjectId: 's1', folderId: 'a' }, subjects)).toBe(false);
    expect(courseInNode({ subjectId: 's2' }, { subjectId: 's1' }, subjects)).toBe(false);
  });

  it('ignores a dangling folderId', () => {
    expect(resolveCourseFolderId({ folderId: 'zzz' }, build())).toBeUndefined();
    expect(resolveCourseFolderId({ folderId: 'b' }, build())).toBe('b');
  });

  it('formats the path, keeping only the end when 3 levels are too long', () => {
    expect(formatCoursePath(build(), 'a').text).toBe('ICM / Intro Médicaments');
    expect(formatCoursePath(build(), undefined).text).toBe('ICM');
    expect(formatCoursePath(build(), 'b').text).toBe('ICM / Intro Médicaments / Pharmacocinétique');
    const short = formatCoursePath(build(), 'b', 20);
    expect(short.text).toBe('… / Pharmacocinétique');
    expect(short.full).toBe('ICM / Intro Médicaments / Pharmacocinétique');
  });
});
