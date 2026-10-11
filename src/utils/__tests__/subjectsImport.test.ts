import { describe, expect, it } from 'vitest';
import { Subject } from '../../types';
import { parseSubjectsImport } from '../subjectsImport';

const existing: Subject = {
  id: 'sub_icm', name: 'ICM', code: 'ICM', color: '#111111',
  bgColor: '', textColor: '', borderColor: '', accentBg: '',
};

describe('parseSubjectsImport with folders', () => {
  it('reads indented lines as folders and sub-folders', () => {
    const text = ['Cardio;CARD;#e11d48', '  Rythmologie', '    ECG', '    Fibrillation', '  Insuffisance', 'Pneumo'].join('\n');
    const r = parseSubjectsImport(text, []);
    expect(r.added.map((s) => s.name)).toEqual(['Cardio', 'Pneumo']);
    const cardio = r.added[0];
    const names = (parentId?: string) => (cardio.folders ?? []).filter((f) => f.parentId === parentId).map((f) => f.name);
    expect(cardio.folders?.filter((f) => !f.parentId).map((f) => f.name)).toEqual(['Rythmologie', 'Insuffisance']);
    const ryth = cardio.folders!.find((f) => f.name === 'Rythmologie')!;
    expect(names(ryth.id)).toEqual(['ECG', 'Fibrillation']);
    expect(r.foldersAdded).toBe(4);
    expect(r.added[1].folders).toBeUndefined();
  });

  it('adds folders to an existing discipline without duplicating it', () => {
    const r = parseSubjectsImport('ICM\n\tIntro Médicaments\n\t\tPharmacocinétique', [existing]);
    expect(r.added).toHaveLength(0);
    expect(r.updated).toHaveLength(1);
    expect(r.updated[0].id).toBe('sub_icm');
    expect(r.updated[0].folders).toHaveLength(2);
    expect(r.duplicates).toBe(0);
  });

  it('still counts a plain duplicate', () => {
    const r = parseSubjectsImport('ICM\n', [existing]);
    expect(r.duplicates).toBe(1);
  });

  it('reads nested folders from JSON', () => {
    const r = parseSubjectsImport(JSON.stringify([{ name: 'Neuro', folders: ['A', { name: 'B', children: ['B1'] }] }]), []);
    expect(r.added[0].folders).toHaveLength(3);
  });
});
