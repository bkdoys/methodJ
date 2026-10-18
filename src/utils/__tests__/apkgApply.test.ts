import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { Course, Deck, Flashcard, Subject } from '../../types';
import { applyApkgPlan, ApplyContext, ApplyResult } from '../apkg/apply';
import { ApkgPlan, planApkgImport, PlannedCard, PlannedCourse } from '../apkg/convert';
import { imageMime, imagesOfPlan, storePackageImages } from '../apkg/media';
import { readApkg } from '../apkg/reader';
import { liveCards, MAX_CARDS_PER_DECK, subCardKeys } from '../flashcards';
import { getFolders } from '../folders';

const hex = (n: number) => n.toString(16).padStart(2, '0').repeat(32);
const MEDIA = new Map([
  ['cell.png', hex(1)],
  ['extra.png', hex(2)],
  ['diagram.png', hex(3)],
]);

const subject = (id: string, name: string): Subject => ({ id, name, code: name.slice(0, 3).toUpperCase(), color: '#0d9488', bgColor: '', textColor: '', borderColor: '', accentBg: '' });

async function fixturePlan(): Promise<ApkgPlan> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'src/utils/__tests__/fixtures/sm2-latest.apkg')));
  const pkg = await readApkg(bytes, () => initSqlJs());
  const plan = planApkgImport(pkg, { keepProgress: true, recreateTree: true, fallbackSubject: 'Import Anki', now: new Date('2027-01-01T12:00:00Z') });
  pkg.close();
  return plan;
}

const ctxFor = (plan: ApkgPlan, over: Partial<ApplyContext> = {}): ApplyContext => ({
  subjects: [],
  courses: [],
  decks: {},
  todayIso: '2027-01-01',
  nowIso: '2027-01-01T12:00:00.000Z',
  mediaIds: MEDIA,
  selected: new Set(plan.courses.map((c) => c.key)),
  ...over,
});

/** Contexte après un import : ce que l'appli aurait enregistré. */
const after = (ctx: ApplyContext, r: ApplyResult): ApplyContext => ({
  ...ctx,
  subjects: r.subjects,
  courses: [...r.newCourses, ...ctx.courses],
  decks: { ...ctx.decks, ...r.decks },
});

const card = (front: string, back = 'r', over: Partial<PlannedCard> = {}): PlannedCard => ({ kind: 'basic', front, back, reviews: {}, ...over });
const course = (over: Partial<PlannedCourse> & { cards: PlannedCard[] }): PlannedCourse => ({
  key: '1',
  deckId: 1,
  path: ['A'],
  subjectName: 'A',
  folderNames: [],
  title: 'A',
  ...over,
});
const planOf = (...courses: PlannedCourse[]): ApkgPlan => ({
  courses,
  stats: { notes: 0, cards: 0, withProgress: 0, suspended: 0, skipped: 0, images: 0, missingImages: 0, droppedImages: 0, ignoredShapes: 0, sounds: 0 },
});

describe('applyApkgPlan on a real package', () => {
  it('creates the missing disciplines and the courses in free mode, with their cards and progress', async () => {
    const plan = await fixturePlan();
    const ctx = ctxFor(plan, { subjects: [subject('s_bio', 'Biologie')] });
    const r = applyApkgPlan(plan, ctx);

    expect(r.subjects.map((s) => s.name)).toEqual(['Biologie', 'Anatomie', 'Par défaut']);
    expect(r.createdSubjectIds).toHaveLength(2);
    expect(r.newCourses.map((c) => [c.title, c.subjectId === 's_bio' ? 'Biologie' : 'autre'])).toEqual([
      ['Anatomie', 'autre'],
      ['Cellule', 'Biologie'],
      ['Par défaut', 'autre'],
    ]);
    expect(r.newCourses.every((c) => c.mode === 'free' && c.activeJList.length === 0 && c.mastery === 0 && c.j0Date === '2027-01-01')).toBe(true);
    expect(r.totals).toMatchObject({ courses: 3, cards: 7, duplicates: 0, full: 0, skipped: 0 });

    const cellule = r.newCourses.find((c) => c.title === 'Cellule')!;
    const deck = r.decks[cellule.id];
    expect(liveCards(deck)).toHaveLength(5);
    const [basic, withImages, , , cloze] = deck.cards;
    expect(deck.review[basic.id]).toMatchObject({ state: 2, stability: 21 });
    expect(deck.review[`${cloze.id}:c1`]).toMatchObject({ state: 2, stability: 10 });
    expect(deck.review[`${cloze.id}:c2`]).toBeUndefined(); // carte nouvelle : rien à reprendre
    expect(withImages).toMatchObject({ frontImage: hex(1), backImage: hex(2) });
    // Tout état repris correspond à une sous-carte qui existe
    const keys = new Set(deck.cards.flatMap(subCardKeys));
    expect(Object.keys(deck.review).every((k) => keys.has(k))).toBe(true);

    const par = r.newCourses.find((c) => c.title === 'Par défaut')!;
    expect(r.decks[par.id].cards[0]).toMatchObject({ kind: 'occlusion', frontImage: hex(3) });
    expect(r.decks[par.id].cards[0].masks).toHaveLength(3);
  });

  it('adds nothing when the same package is imported again', async () => {
    const plan = await fixturePlan();
    const ctx = ctxFor(plan);
    const first = applyApkgPlan(plan, ctx);
    const again = applyApkgPlan(plan, after(ctx, first));
    expect(again.newCourses).toHaveLength(0);
    expect(again.createdSubjectIds).toHaveLength(0);
    expect(again.totals).toMatchObject({ courses: 0, cards: 0, duplicates: 7 });
    expect(Object.keys(again.decks)).toHaveLength(0);
  });

  it('imports only the chosen courses', async () => {
    const plan = await fixturePlan();
    const r = applyApkgPlan(plan, ctxFor(plan, { selected: new Set([plan.courses[1].key]) }));
    expect(r.newCourses.map((c) => c.title)).toEqual(['Cellule']);
    expect(r.subjects.map((s) => s.name)).toEqual(['Biologie']);
  });
});

describe('applyApkgPlan hierarchy and existing data', () => {
  it('creates the folders and reuses them on the next import', () => {
    const plan = planOf(course({ subjectName: 'UE1', folderNames: ['Chimie', 'Atomes'], title: 'Cours 1', cards: [card('q')] }));
    const ctx = ctxFor(plan);
    const r = applyApkgPlan(plan, ctx);
    const s = r.subjects[0];
    expect(getFolders(s).map((f) => [f.name, f.parentId ? 'enfant' : 'racine'])).toEqual([['Chimie', 'racine'], ['Atomes', 'enfant']]);
    expect(r.newCourses[0].folderId).toBe(getFolders(s)[1].id);
    expect(r.createdFolders).toHaveLength(2);

    const plan2 = planOf(course({ key: '2', subjectName: 'ue1', folderNames: ['chimie', 'atomes'], title: 'Cours 2', cards: [card('q2')] }));
    const next = applyApkgPlan(plan2, { ...after(ctx, r), selected: new Set(['2']) });
    expect(next.createdFolders).toHaveLength(0);
    expect(next.createdSubjectIds).toHaveLength(0);
    expect(next.newCourses[0].folderId).toBe(r.newCourses[0].folderId);
  });

  it('adds the cards to an existing course of the same name, without duplicates', () => {
    const existing: Course = { id: 'c1', title: 'Cellule', itemCode: 'X', subjectId: 's1', j0Date: '2026-01-01', activeJList: [0, 1], mastery: 2, createdAt: '2026-01-01' };
    const old: Flashcard = { id: 'k0', kind: 'basic', front: 'Déjà là', back: 'r', createdAt: 'x', updatedAt: 'x' };
    const plan = planOf(course({ subjectName: 'Biologie', title: 'cellule', cards: [card('Déjà là'), card('Nouvelle')] }));
    const ctx = ctxFor(plan, {
      subjects: [subject('s1', 'Biologie')],
      courses: [existing],
      decks: { c1: { id: 'c1', cards: [old], review: {} } },
    });
    const r = applyApkgPlan(plan, ctx);
    expect(r.newCourses).toHaveLength(0);
    expect(r.outcomes[0]).toMatchObject({ created: false, added: 1, duplicates: 1 });
    expect(r.decks['c1'].cards.map((c) => c.front)).toEqual(['Déjà là', 'Nouvelle']);
    expect(r.addedToExisting['c1']).toHaveLength(1);
  });

  it('reuses the only course of that title in the discipline even if it sits in another folder', () => {
    const elsewhere: Course = { id: 'c9', title: 'Atomes', itemCode: '', subjectId: 's1', folderId: 'f_autre', j0Date: '2026-01-01', activeJList: [], mode: 'free', mastery: 0, createdAt: '2026-01-01' };
    const plan = planOf(course({ subjectName: 'UE1', folderNames: ['Chimie'], title: 'Atomes', cards: [card('q')] }));
    const ctx = ctxFor(plan, { subjects: [subject('s1', 'UE1')], courses: [elsewhere] });
    const r = applyApkgPlan(plan, ctx);
    expect(r.newCourses).toHaveLength(0);
    expect(r.outcomes[0]).toMatchObject({ courseId: 'c9', created: false, added: 1 });

    // Deux cours de ce titre : on ne devine pas lequel, un nouveau est créé dans le bon dossier
    const twin: Course = { ...elsewhere, id: 'c10', folderId: 'f_autre2' };
    const r2 = applyApkgPlan(plan, ctxFor(plan, { subjects: [subject('s1', 'UE1')], courses: [elsewhere, twin] }));
    expect(r2.newCourses).toHaveLength(1);
  });

  it('refuses the cards that do not fit in a full deck', () => {
    const full: Deck = {
      id: 'c1',
      review: {},
      cards: Array.from({ length: MAX_CARDS_PER_DECK }, (_, i) => ({ id: `k${i}`, kind: 'basic' as const, front: `q${i}`, back: 'r', createdAt: 'x', updatedAt: 'x' })),
    };
    const existing: Course = { id: 'c1', title: 'A', itemCode: '', subjectId: 's1', j0Date: '2026-01-01', activeJList: [], mode: 'free', mastery: 0, createdAt: '2026-01-01' };
    const plan = planOf(course({ subjectName: 'A', title: 'A', cards: [card('nouvelle')] }));
    const r = applyApkgPlan(plan, ctxFor(plan, { subjects: [subject('s1', 'A')], courses: [existing], decks: { c1: full } }));
    expect(r.outcomes[0]).toMatchObject({ added: 0, full: 1 });
  });

  it('keeps a card whose image is unavailable as text, and drops a mask card without its image', () => {
    const plan = planOf(
      course({
        cards: [
          card('Avec image', 'r', { frontImageRef: 'absente.png' }),
          card('', 'r', { frontImageRef: 'absente.png' }),
          { kind: 'occlusion', front: '', frontImageRef: 'absente.png', masks: [{ id: 'm', x: 0.1, y: 0.1, w: 0.2, h: 0.2, group: 1 }], reviews: {} },
        ],
      })
    );
    const r = applyApkgPlan(plan, ctxFor(plan));
    expect(r.outcomes[0]).toMatchObject({ added: 1, skipped: 2 });
    expect(r.decks[r.newCourses[0].id].cards[0]).toMatchObject({ front: 'Avec image' });
    expect(r.decks[r.newCourses[0].id].cards[0].frontImage).toBeUndefined();
  });
});

describe('package images', () => {
  it('knows the image types by extension', () => {
    expect(imageMime('a.PNG')).toBe('image/png');
    expect(imageMime('b.jpeg')).toBe('image/jpeg');
    expect(imageMime('c.svg')).toBe('image/svg+xml');
    expect(imageMime('d.mp3')).toBeUndefined();
    expect(imageMime('noext')).toBeUndefined();
  });

  it('lists the images of the chosen courses only, once each', () => {
    const plan = planOf(
      course({ key: 'a', cards: [card('1', 'r', { frontImageRef: 'x.png', backImageRef: 'y.png' }), card('2', 'r', { frontImageRef: 'x.png' })] }),
      course({ key: 'b', cards: [card('3', 'r', { frontImageRef: 'z.png' })] })
    );
    expect(imagesOfPlan(plan, new Set(['a'])).sort()).toEqual(['x.png', 'y.png']);
    expect(imagesOfPlan(plan, new Set(['a', 'b'])).sort()).toEqual(['x.png', 'y.png', 'z.png']);
  });

  it('stores every image through the given function and reports the failures', async () => {
    const files: Record<string, Uint8Array> = { 'a.png': new Uint8Array([1]), 'b.jpg': new Uint8Array([2]), 'c.png': new Uint8Array([3]) };
    const progress: number[] = [];
    const out = await storePackageImages(
      ['a.png', 'b.jpg', 'c.png', 'manquante.png', 'son.mp3'],
      (n) => files[n] ?? null,
      async (blob) => (blob.size === 1 && blob.type === 'image/png' && (await blob.arrayBuffer()).byteLength === 1 ? `id-${(await blob.arrayBuffer()).byteLength}` : blob.type === 'image/jpeg' ? 'id-jpg' : null),
      { onProgress: (done) => progress.push(done) }
    );
    expect(out.ids.get('b.jpg')).toBe('id-jpg');
    expect(out.ids.size).toBe(3);
    expect(out.failed.sort()).toEqual(['manquante.png', 'son.mp3']);
    expect(progress.at(-1)).toBe(5);
    expect(out.cancelled).toBe(false);
  });

  it('counts a store that throws as a failure and can be cancelled', async () => {
    const read = () => new Uint8Array([1]);
    const failing = await storePackageImages(['a.png'], read, async () => {
      throw new Error('boom');
    });
    expect(failing.failed).toEqual(['a.png']);

    let calls = 0;
    const cancelled = await storePackageImages(['a.png', 'b.png', 'c.png', 'd.png'], read, async () => `id${calls++}`, {
      concurrency: 1,
      isCancelled: () => calls >= 2,
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.ids.size).toBe(2);
  });
});
