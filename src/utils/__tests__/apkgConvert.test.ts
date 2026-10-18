import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { readApkg } from '../apkg/reader';
import { ApkgPlan, planApkgImport, placeDeck, PlanOptions } from '../apkg/convert';
import { extractImages, parseField } from '../apkg/fields';
import { hasOcclusion, parseAnkiOcclusion } from '../apkg/occlusion';
import { ankiCardToReview, difficultyFromEase, parseFsrsData } from '../apkg/schedule';
import type { AnkiCard } from '../apkg/reader';
import { MAX_CARDS_PER_DECK } from '../flashcards';

const NOW = new Date('2027-01-01T12:00:00Z');
const opts: PlanOptions = { keepProgress: true, recreateTree: true, fallbackSubject: 'Import Anki', now: NOW };

async function plan(name: string, over: Partial<PlanOptions> = {}): Promise<{ plan: ApkgPlan; crt: number }> {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'src/utils/__tests__/fixtures', `${name}.apkg`)));
  const pkg = await readApkg(bytes, () => initSqlJs());
  const result = planApkgImport(pkg, { ...opts, ...over });
  const crt = pkg.crt;
  pkg.close();
  return { plan: result, crt };
}

describe.each(['sm2-legacy', 'sm2-latest'])('planApkgImport(%s)', (name) => {
  it('turns decks and sub-decks into courses with the tree above them', async () => {
    const { plan: p } = await plan(name);
    expect(p.courses.map((c) => [c.subjectName, c.folderNames, c.title, c.cards.length])).toEqual([
      ['Anatomie', [], 'Anatomie', 1],
      ['Biologie', [], 'Cellule', 5],
      ['Par défaut', [], 'Par défaut', 1],
    ]);
  });

  it('counts what it keeps and what it leaves aside', async () => {
    const { plan: p } = await plan(name);
    expect(p.stats).toMatchObject({
      notes: 6,
      cards: 7,
      suspended: 1,
      skipped: 0,
      images: 3,
      missingImages: 0,
      droppedImages: 0,
      ignoredShapes: 0,
      sounds: 1,
      withProgress: 4,
    });
  });

  it('converts basic, reversed, cloze and image occlusion notes', async () => {
    const { plan: p } = await plan(name);
    const cellule = p.courses.find((c) => c.title === 'Cellule')!;
    const [basic, withImages, forward, reversed, cloze] = cellule.cards;
    expect(basic).toMatchObject({ kind: 'basic', front: "Quelle organelle produit l'ATP ?", back: 'La mitochondrie' });
    expect(withImages).toMatchObject({ kind: 'basic', front: 'Légender :', back: 'Noyau', frontImageRef: 'cell.png', backImageRef: 'extra.png' });
    expect(forward).toMatchObject({ kind: 'basic', front: 'ATP', back: 'Adénosine triphosphate' });
    expect(reversed).toMatchObject({ kind: 'basic', front: 'Adénosine triphosphate', back: 'ATP', reviews: {} });
    expect(cloze).toMatchObject({ kind: 'cloze', front: "La {{c1::mitochondrie}} produit l'{{c2::ATP::molécule}}", back: 'Voir le cours' });
    expect(Object.keys(cloze.reviews)).toEqual([':c1']);

    const io = p.courses.find((c) => c.title === 'Par défaut')!.cards[0];
    expect(io).toMatchObject({ kind: 'occlusion', front: 'Schéma de la cellule', back: 'Rappel', frontImageRef: 'diagram.png' });
    expect(io.masks!.map((m) => [m.group, m.shape ?? 'rect'])).toEqual([[1, 'rect'], [2, 'ellipse'], [3, 'polygon']]);
    expect(io.occlusionMode).toBeUndefined(); // oi=1 : on masque tout, c'est le mode par défaut

    const anatomie = p.courses.find((c) => c.title === 'Anatomie')!;
    expect(anatomie.cards.map((c) => c.front)).toEqual(['Os du bras']); // la carte suspendue n'est pas reprise
    expect(anatomie.cards[0].back).toBe('Humérus');
  });

  it('converts the SM-2 progress into an FSRS state', async () => {
    const { plan: p, crt } = await plan(name);
    const cards = p.courses.find((c) => c.title === 'Cellule')!.cards;
    const day = 86400;
    const basic = cards[0].reviews[''];
    expect(basic).toMatchObject({ state: 2, stability: 21, scheduledDays: 21, reps: 6, lapses: 1, difficulty: 5.91 });
    expect(basic.due).toBe(new Date((crt + 5 * day) * 1000).toISOString());
    expect(basic.lastReview).toBe(new Date((crt + (5 - 21) * day) * 1000).toISOString());
    // Carte en retard et difficile (facilité 150 %) : intervalle 3 jours, échéance passée
    const late = cards[1].reviews[''];
    expect(late).toMatchObject({ state: 2, scheduledDays: 3, lapses: 3, difficulty: 9.18 });
    expect(late.due).toBe(new Date((crt - 2 * day) * 1000).toISOString());
    expect(cards[2].reviews['']).toMatchObject({ state: 2, stability: 90, difficulty: 3.05 });
    expect(cards[4].reviews[':c1']).toMatchObject({ state: 2, stability: 10 });
  });

  it('imports everything as new cards when progress is not kept', async () => {
    const { plan: p } = await plan(name, { keepProgress: false });
    expect(p.courses.flatMap((c) => c.cards).every((c) => Object.keys(c.reviews).length === 0)).toBe(true);
    expect(p.stats.withProgress).toBe(0);
  });

  it('puts every deck in one discipline when the tree is not recreated', async () => {
    const { plan: p } = await plan(name, { recreateTree: false });
    expect(p.courses.map((c) => [c.subjectName, c.title])).toEqual([
      ['Import Anki', 'Anatomie'],
      ['Import Anki', 'Biologie › Cellule'],
      ['Import Anki', 'Par défaut'],
    ]);
  });
});

describe('planApkgImport(fsrs-latest)', () => {
  it('takes the exact FSRS memory state stored by Anki', async () => {
    const { plan: p } = await plan('fsrs-latest');
    const states = p.courses.flatMap((c) => c.cards).flatMap((c) => Object.values(c.reviews));
    expect(states.length).toBeGreaterThan(0);
    // Valeurs écrites par Anki dans cards.data pour la première carte répondue (voir make_fixtures.py)
    expect(states.some((s) => s.stability === 2.3065 && s.difficulty === 2.111)).toBe(true);
    expect(states.every((s) => s.lastReview && s.firstReview)).toBe(true);
  });
});

describe('placeDeck', () => {
  const o = { recreateTree: true, fallbackSubject: 'Import' };
  it('maps the deck path to discipline, folders and course', () => {
    expect(placeDeck(['ICM'], o)).toEqual({ subjectName: 'ICM', folderNames: [], title: 'ICM' });
    expect(placeDeck(['UE1', 'Chimie'], o)).toEqual({ subjectName: 'UE1', folderNames: [], title: 'Chimie' });
    expect(placeDeck(['UE1', 'Chimie', 'Atomes'], o)).toEqual({ subjectName: 'UE1', folderNames: ['Chimie'], title: 'Atomes' });
    expect(placeDeck(['A', 'B', 'C', 'D'], o)).toEqual({ subjectName: 'A', folderNames: ['B', 'C'], title: 'D' });
  });

  it('folds the levels beyond two folders into the course title', () => {
    expect(placeDeck(['A', 'B', 'C', 'D', 'E'], o)).toEqual({ subjectName: 'A', folderNames: ['B', 'C'], title: 'D › E' });
  });

  it('cleans spaces and clips very long names', () => {
    expect(placeDeck(['  UE1   Bio ', ' Cours  '], o)).toEqual({ subjectName: 'UE1 Bio', folderNames: [], title: 'Cours' });
    expect(placeDeck(['x'.repeat(400)], o).title.length).toBeLessThanOrEqual(150);
  });
});

describe('fields', () => {
  it('finds images in every quoting style, decoded, and skips web images', () => {
    expect(extractImages('<img src="a.png"> <img src=\'b c.jpg\'> <img src=c.gif> <img src="x%20y.png"> <img src="https://x/y.png"> <img alt="z">')).toEqual([
      'a.png',
      'b c.jpg',
      'c.gif',
      'x y.png',
    ]);
    expect(extractImages('<img src="a&amp;b.png">')).toEqual(['a&b.png']);
  });

  it('returns the text without images and counts the sounds', () => {
    expect(parseField('Bonjour<br><img src="a.png"> monde [sound:x.mp3]')).toEqual({ text: 'Bonjour\n monde', images: ['a.png'], sounds: 1 });
  });
});

describe('Image Occlusion parsing', () => {
  it('reads rectangles, ellipses and polygons as fractions of the image', () => {
    const field =
      '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}' +
      '{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2:oi=1}}' +
      '{{c3::image-occlusion:polygon:points=0.1,0.6 0.3,0.6 0.2,0.8:oi=1}}';
    expect(hasOcclusion(field)).toBe(true);
    const r = parseAnkiOcclusion(field);
    expect(r.mode).toBe('hide-all');
    expect(r.ignored).toBe(0);
    expect(r.masks[0]).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.4, group: 1 });
    expect(r.masks[1]).toMatchObject({ shape: 'ellipse', x: 0.5, y: 0.5, w: 0.2, h: 0.4, group: 2 });
    expect(r.masks[2]).toMatchObject({ shape: 'polygon', group: 3, x: 0.1, y: 0.6 });
    expect(r.masks[2].points).toHaveLength(3);
  });

  it('keeps shapes of the same number in one group, and hides one at a time without oi', () => {
    const r = parseAnkiOcclusion(
      '{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1}}{{c1::image-occlusion:rect:left=.5:top=.5:width=.1:height=.1}}'
    );
    expect(r.mode).toBe('hide-one');
    expect(r.masks.map((m) => m.group)).toEqual([1, 1]);
  });

  it('leaves text shapes and broken shapes aside, and clips shapes to the image', () => {
    const r = parseAnkiOcclusion(
      '{{c1::image-occlusion:text:left=.1:top=.1:text=Titre:scale=1}}{{c2::image-occlusion:rect:left=.9:top=.9:width=.5:height=.5}}{{c3::image-occlusion:rect:left=x}}{{c0::image-occlusion:rect:left=0:top=0:width=.1:height=.1}}'
    );
    expect(r.masks).toHaveLength(1);
    expect(r.masks[0]).toMatchObject({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
    expect(r.ignored).toBe(3);
  });
});

describe('ankiCardToReview', () => {
  const crt = 1_800_000_000;
  const base: AnkiCard = { id: 1, nid: 1, did: 1, ord: 0, type: 2, queue: 2, due: 10, ivl: 30, factor: 2500, reps: 5, lapses: 0, left: 0, data: '{}' };

  it('has nothing to carry over for a new card', () => {
    expect(ankiCardToReview({ ...base, type: 0, queue: 0 }, crt, NOW)).toBeNull();
  });

  it('turns a review card into a review state with stability = interval', () => {
    const r = ankiCardToReview(base, crt, new Date((crt + 20 * 86400) * 1000))!;
    expect(r).toMatchObject({ state: 2, stability: 30, scheduledDays: 30, reps: 5, difficulty: 5.09 });
    expect(r.due).toBe(new Date((crt + 10 * 86400) * 1000).toISOString());
  });

  it('reads a learning card due at a precise time', () => {
    const due = crt + 3600;
    const r = ankiCardToReview({ ...base, type: 1, queue: 1, due, ivl: 0, factor: 0 }, crt, new Date((crt + 100) * 1000))!;
    expect(r).toMatchObject({ state: 1, scheduledDays: 0, stability: 0.5, difficulty: 5 });
    expect(r.due).toBe(new Date(due * 1000).toISOString());
  });

  it('never puts the last review in the future', () => {
    const r = ankiCardToReview({ ...base, due: 100, ivl: 5 }, crt, new Date((crt - 50 * 86400) * 1000))!;
    expect(r.lastReview).toBeUndefined();
  });

  it('reads the FSRS memory state when Anki has one, and ignores a broken one', () => {
    expect(parseFsrsData('{"pos":3,"s":12.5,"d":4.2,"dr":0.9,"lrt":1790000000}')).toEqual({ s: 12.5, d: 4.2, lrt: 1790000000 });
    expect(parseFsrsData('{}')).toBeNull();
    expect(parseFsrsData('nope')).toBeNull();
    expect(parseFsrsData('{"s":-1,"d":3}')).toBeNull();
    const r = ankiCardToReview({ ...base, data: '{"s":12.5,"d":4.2,"lrt":1790000000}' }, crt, new Date((crt + 20 * 86400) * 1000))!;
    expect(r).toMatchObject({ stability: 12.5, difficulty: 4.2 });
    expect(r.lastReview).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it('maps the ease factor to a difficulty between 1 and 10', () => {
    expect(difficultyFromEase(2500)).toBe(5.09);
    expect(difficultyFromEase(1300)).toBe(10);
    expect(difficultyFromEase(3500)).toBe(1);
    expect(difficultyFromEase(900)).toBe(10);
    expect(difficultyFromEase(0)).toBe(5);
  });
});

describe('big decks', () => {
  it('splits a deck of more than 1000 cards into several courses', async () => {
    // Paquet synthétique : mêmes structures que celles lues dans un vrai paquet
    const cards = Array.from({ length: MAX_CARDS_PER_DECK + 5 }, (_, i) => i + 1);
    const pkg = {
      format: 'latest' as const,
      crt: 1_800_000_000,
      decks: new Map([[7, { id: 7, name: 'Gros::Paquet' }]]),
      notetypes: new Map(),
      notes: cards.map((id) => ({ id, mid: 1, fields: [`Question ${id}`, `Réponse ${id}`], tags: '' })),
      cards: cards.map((id) => ({ id, nid: id, did: 7, ord: 0, type: 0, queue: 0, due: id, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, data: '' })),
      mediaNames: [],
      readMedia: () => null,
      close: () => undefined,
    };
    const p = planApkgImport(pkg, opts);
    expect(p.courses.map((c) => [c.title, c.cards.length, c.key])).toEqual([
      ['Paquet (1)', MAX_CARDS_PER_DECK, '7#1'],
      ['Paquet (2)', 5, '7#2'],
    ]);
    expect(p.courses[0].subjectName).toBe('Gros');
  });
});
