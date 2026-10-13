import { describe, expect, it } from 'vitest';
import { Course, Subject } from '../../types';
import { PRESET_COURSE_COLORS, getCourseEffectiveColor } from '../colorUtils';
import { deleteFolder, setChildFoldersColor, setFolderColor } from '../folders';
import { SHADE_SPREAD, folderColorMap, getFolderColor, hexToHsl, hslToHex, isHexColor, shadeColor } from '../folderColors';

const subject = (folders: Subject['folders'], color = '#2563eb'): Subject =>
  ({ id: 's1', name: 'Cardio', code: 'CARDIO', color, bgColor: '', textColor: '', borderColor: '', accentBg: '', folders }) as Subject;
const light = (hex: string) => hexToHsl(hex)!.l;
const hue = (hex: string) => hexToHsl(hex)!.h;

describe('hex and HSL conversion', () => {
  it('round-trips every preset colour within one unit per channel', () => {
    for (const { hex } of PRESET_COURSE_COLORS) {
      const back = hslToHex(hexToHsl(hex)!);
      [1, 3, 5].forEach((i) => expect(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))).toBeLessThanOrEqual(1));
    }
  });

  it('handles greys and rejects other formats', () => {
    expect(hexToHsl('#808080')).toMatchObject({ s: 0 });
    expect(hexToHsl('#fff')).toBeNull();
    expect(isHexColor('#0d9488')).toBe(true);
    expect(isHexColor('0d9488')).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe('shadeColor', () => {
  const base = '#2563eb';

  it('keeps the base colour for a single sibling', () => {
    expect(shadeColor(base, 0, 1, SHADE_SPREAD.folder)).toBe(base);
  });

  it('goes from darker to lighter across the siblings', () => {
    const shades = [0, 1, 2, 3].map((i) => shadeColor(base, i, 4, SHADE_SPREAD.folder));
    for (let i = 1; i < shades.length; i++) expect(light(shades[i])).toBeGreaterThan(light(shades[i - 1]));
    expect(new Set(shades).size).toBe(4);
  });

  it('keeps every shade readable, even from a very dark or very light base', () => {
    for (const b of ['#000000', '#ffffff', '#0f172a', '#fef3c7']) {
      for (let i = 0; i < 5; i++) {
        const l = light(shadeColor(b, i, 5, SHADE_SPREAD.folder));
        expect(l).toBeGreaterThanOrEqual(0.2);
        expect(l).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('shifts the hue a little, in the same direction', () => {
    const first = hue(shadeColor(base, 0, 3, SHADE_SPREAD.folder));
    const last = hue(shadeColor(base, 2, 3, SHADE_SPREAD.folder));
    expect(last - first).toBeGreaterThan(20);
    expect(last - first).toBeLessThan(40);
  });

  it('returns an unparsable colour unchanged', () => {
    expect(shadeColor('red', 0, 3, SHADE_SPREAD.folder)).toBe('red');
  });
});

describe('folder colours', () => {
  const folders = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'a1', name: 'A1', parentId: 'a' },
    { id: 'a2', name: 'A2', parentId: 'a' },
  ];

  it('gives each sibling folder its own shade, different from the discipline', () => {
    const s = subject(folders);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => getFolderColor(s, id)!);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(light(a)).toBeLessThan(light(b));
    expect(light(b)).toBeLessThan(light(c));
    expect(isHexColor(a) && isHexColor(b) && isHexColor(c)).toBe(true);
  });

  it('derives sub-folders from their parent, with a smaller spread', () => {
    const s = subject(folders);
    const parent = getFolderColor(s, 'a')!;
    const [x, y] = [getFolderColor(s, 'a1')!, getFolderColor(s, 'a2')!];
    expect(x).not.toBe(y);
    expect(Math.abs(light(x) - light(parent))).toBeLessThanOrEqual(SHADE_SPREAD.subfolder.l + 0.01);
    expect(Math.abs(light(y) - light(parent))).toBeLessThanOrEqual(SHADE_SPREAD.subfolder.l + 0.01);
  });

  it('uses the chosen colour, and sub-folders follow it', () => {
    const s = setFolderColor(subject(folders), 'a', '#E11D48');
    expect(getFolderColor(s, 'a')).toBe('#e11d48');
    expect(Math.abs(hue(getFolderColor(s, 'a1')!) - hue('#e11d48'))).toBeLessThan(SHADE_SPREAD.subfolder.h + 2);
    // a sub-folder can still have its own colour
    const s2 = setFolderColor(s, 'a1', '#059669');
    expect(getFolderColor(s2, 'a1')).toBe('#059669');
  });

  it('falls back to the discipline colour when there is no folder', () => {
    const s = subject(folders);
    expect(getFolderColor(s, undefined)).toBe('#2563eb');
    expect(getFolderColor(s, 'missing')).toBe('#2563eb');
    expect(getFolderColor(undefined, 'a')).toBeUndefined();
    expect(getFolderColor(subject(undefined), 'a')).toBe('#2563eb');
  });

  it('survives a dangling parent and a parent loop', () => {
    const s = subject([
      { id: 'x', name: 'X', parentId: 'ghost' },
      { id: 'p', name: 'P', parentId: 'q' },
      { id: 'q', name: 'Q', parentId: 'p' },
    ]);
    const map = folderColorMap(s);
    expect(map.size).toBe(3);
    map.forEach((c) => expect(isHexColor(c)).toBe(true));
  });

  it('re-shades the remaining siblings after a deletion, and keeps chosen colours', () => {
    const s = setFolderColor(subject(folders), 'c', '#059669');
    const before = getFolderColor(s, 'b');
    const { subject: next } = deleteFolder(s, 'a');
    expect(getFolderColor(next, 'c')).toBe('#059669');
    // b was the middle of three, now the last of two with a1 and a2 lifted: shades are recomputed from the new list
    expect(getFolderColor(next, 'b')).not.toBe(before);
    expect(folderColorMap(next).size).toBe(next.folders!.length);
  });

  it('computes once per discipline object', () => {
    const s = subject(folders);
    expect(folderColorMap(s)).toBe(folderColorMap(s));
    expect(folderColorMap({ ...s })).not.toBe(folderColorMap(s));
  });
});

describe('setFolderColor', () => {
  const s = subject([{ id: 'a', name: 'A' }]);

  it('sets, normalises and clears a colour', () => {
    const set = setFolderColor(s, 'a', '#ABCDEF');
    expect(set.folders![0].color).toBe('#abcdef');
    const cleared = setFolderColor(set, 'a', undefined);
    expect('color' in cleared.folders![0]).toBe(false);
  });

  it('ignores an invalid colour or an unknown folder', () => {
    expect(setFolderColor(s, 'a', 'blue')).toBe(s);
    expect(setFolderColor(s, 'a', '#12345')).toBe(s);
    expect(setFolderColor(s, 'zzz', '#abcdef')).toBe(s);
  });

  it('does not touch the other folders', () => {
    const two = subject([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', color: '#111111' }]);
    expect(setFolderColor(two, 'a', '#222222').folders![1]).toBe(two.folders![1]);
  });
});

describe('getCourseEffectiveColor', () => {
  const s = setFolderColor(subject([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]), 'b', '#059669');
  const course = (over: Partial<Course>) => ({ id: 'c', subjectId: 's1', ...over }) as Course;

  it('prefers the course colour, then its folder, then the discipline', () => {
    expect(getCourseEffectiveColor(course({ customColor: '#ff0000', folderId: 'b' }), s)).toBe('#ff0000');
    expect(getCourseEffectiveColor(course({ folderId: 'b' }), s)).toBe('#059669');
    expect(getCourseEffectiveColor(course({ folderId: 'a' }), s)).toBe(getFolderColor(s, 'a'));
    expect(getCourseEffectiveColor(course({}), s)).toBe('#2563eb');
  });

  it('falls back to the discipline for a dangling folder', () => {
    expect(getCourseEffectiveColor(course({ folderId: 'gone' }), s)).toBe('#2563eb');
  });
});

describe('courses of the same folder', () => {
  const s = subject([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  const course = (id: string, folderId?: string, customColor?: string) => ({ id, subjectId: 's1', folderId, customColor }) as Course;

  it('share the colour of their folder by default, and differ from the other folders', () => {
    const inA = [course('1', 'a'), course('2', 'a'), course('3', 'a')].map((c) => getCourseEffectiveColor(c, s));
    expect(new Set(inA).size).toBe(1);
    expect(inA[0]).toBe(getFolderColor(s, 'a'));
    expect(getCourseEffectiveColor(course('4', 'b'), s)).not.toBe(inA[0]);
  });

  it('only a course with its own colour differs', () => {
    expect(getCourseEffectiveColor(course('5', 'a', '#ff0000'), s)).toBe('#ff0000');
    expect(getCourseEffectiveColor(course('6', 'a'), s)).toBe(getFolderColor(s, 'a'));
  });

  it('follow the folder when its colour changes', () => {
    const recoloured = setFolderColor(s, 'a', '#059669');
    expect(getCourseEffectiveColor(course('1', 'a'), recoloured)).toBe('#059669');
    expect(getCourseEffectiveColor(course('2', 'a'), recoloured)).toBe('#059669');
  });
});

describe('setChildFoldersColor', () => {
  const base = subject([
    { id: 'a', name: 'A' },
    { id: 'a1', name: 'A1', parentId: 'a' },
    { id: 'a2', name: 'A2', parentId: 'a' },
    { id: 'b', name: 'B' },
    { id: 'b1', name: 'B1', parentId: 'b' },
  ]);

  it('gives the same colour to the direct sub-folders only', () => {
    const next = setChildFoldersColor(base, 'a', '#E11D48');
    expect(getFolderColor(next, 'a1')).toBe('#e11d48');
    expect(getFolderColor(next, 'a2')).toBe('#e11d48');
    expect(next.folders!.find((f) => f.id === 'b1')).toBe(base.folders![4]);
    expect(next.folders!.find((f) => f.id === 'a')).toBe(base.folders![0]);
  });

  it('copies the colour the parent shows, chosen or automatic', () => {
    const shown = getFolderColor(base, 'a')!;
    const next = setChildFoldersColor(base, 'a', shown);
    expect(getFolderColor(next, 'a1')).toBe(shown);
    expect(getFolderColor(next, 'a2')).toBe(shown);
  });

  it('ignores an invalid colour or a folder without sub-folders', () => {
    expect(setChildFoldersColor(base, 'a', 'red')).toBe(base);
    expect(setChildFoldersColor(base, 'a1', '#112233')).toBe(base);
  });
});
