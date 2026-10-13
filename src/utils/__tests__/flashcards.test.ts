import { describe, expect, it } from 'vitest';
import { CardReview, Course, Deck, Subject } from '../../types';
import {
  addCard,
  cardSearchText,
  clozeNumbers,
  collectMediaIds,
  countSubCards,
  courseIdsInScope,
  deleteCard,
  emptyDeck,
  liveCards,
  mergeDecks,
  moveCards,
  normalizeDeck,
  parseCloze,
  renderCloze,
  sameDeck,
  searchCards,
  subCardKeys,
  updateCard,
  validateCard,
  wrapCloze,
} from '../flashcards';
import { addFolder } from '../folders';

const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';
const T2 = '2026-10-03T10:00:00.000Z';

function review(lastReview: string | undefined, reps = 1): CardReview {
  return { due: T2, stability: 1, difficulty: 5, reps, lapses: 0, state: 2, scheduledDays: 1, step: 0, ...(lastReview ? { lastReview } : {}) };
}

describe('cloze', () => {
  it('parses numbered gaps with an optional hint', () => {
    const parts = parseCloze('Les {{c1::IEC}} donnent une {{c2::toux::effet}}.');
    expect(parts).toEqual([
      { kind: 'text', text: 'Les ' },
      { kind: 'cloze', n: 1, answer: 'IEC' },
      { kind: 'text', text: ' donnent une ' },
      { kind: 'cloze', n: 2, answer: 'toux', hint: 'effet' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps malformed or empty gaps as text', () => {
    expect(clozeNumbers('a {{c1::}} b {{c1::x} c {{c0::y}}')).toEqual([]);
    expect(parseCloze('a {{c1::x} b')).toEqual([{ kind: 'text', text: 'a {{c1::x} b' }]);
  });

  it('lists each number once, sorted', () => {
    expect(clozeNumbers('{{c3::a}} {{c1::b}} {{c3::c}}')).toEqual([1, 3]);
  });

  it('masks only the asked gap', () => {
    const text = 'A {{c1::x}} B {{c2::y::indice}}';
    expect(renderCloze(text, 2, false)).toEqual([
      { text: 'A x B ', role: 'plain' },
      { text: 'indice', role: 'mask' },
    ]);
    expect(renderCloze(text, 1, false)[1]).toEqual({ text: '…', role: 'mask' });
    expect(renderCloze(text, 1, true)[1]).toEqual({ text: 'x', role: 'answer' });
  });

  it('wraps a selection with the next number', () => {
    expect(wrapCloze('IEC et toux', 7, 11)).toEqual({ text: 'IEC et {{c1::toux}}', cursor: 19 });
    expect(wrapCloze('{{c1::IEC}} et toux', 15, 19)?.text).toBe('{{c1::IEC}} et {{c2::toux}}');
    expect(wrapCloze('abc', 1, 1)).toBeNull();
  });
});

describe('cards', () => {
  it('validates input', () => {
    expect(validateCard({ kind: 'basic', front: ' ', back: 'x' })).toBe('empty-front');
    expect(validateCard({ kind: 'basic', front: 'q', back: '' })).toBe('empty-back');
    expect(validateCard({ kind: 'cloze', front: 'pas de trou' })).toBe('no-cloze');
    expect(validateCard({ kind: 'cloze', front: '{{c1::a}}' })).toBeNull();
  });

  it('adds, updates and deletes with a tombstone', () => {
    let d = addCard(emptyDeck('c1'), { kind: 'cloze', front: '{{c1::a}} {{c2::b}}' }, T0, 'k1');
    expect(subCardKeys(d.cards[0])).toEqual(['k1:c1', 'k1:c2']);
    d = { ...d, review: { 'k1:c1': review(T0), 'k1:c2': review(T0) } };

    d = updateCard(d, 'k1', { kind: 'cloze', front: '{{c1::a}} b' }, T1);
    expect(d.cards[0].updatedAt).toBe(T1);
    expect(Object.keys(d.review)).toEqual(['k1:c1']);

    d = deleteCard(d, 'k1', T2);
    expect(d.cards[0]).toMatchObject({ id: 'k1', deleted: true, front: '', updatedAt: T2 });
    expect(d.review).toEqual({});
    expect(liveCards(d)).toEqual([]);
    expect(countSubCards(d)).toBe(0);
  });

  it('ignores an unchanged update and an invalid add', () => {
    const d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r' }, T0, 'k1');
    expect(updateCard(d, 'k1', { kind: 'basic', front: ' q ', back: 'r' }, T1)).toBe(d);
    expect(addCard(d, { kind: 'basic', front: 'q' }, T1)).toBe(d);
  });

  it('purges old tombstones only', () => {
    let d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r' }, T0, 'k1');
    d = deleteCard(d, 'k1', T0);
    expect(normalizeDeck(d, T2).cards).toHaveLength(1);
    expect(normalizeDeck(d, '2026-11-15T00:00:00.000Z').cards).toHaveLength(0);
  });
});

describe('mergeDecks', () => {
  const base = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r' }, T0, 'k1');

  it('keeps cards added on both sides, in creation order', () => {
    const a = addCard(base, { kind: 'basic', front: 'a', back: 'a' }, T2, 'ka');
    const b = addCard(base, { kind: 'basic', front: 'b', back: 'b' }, T1, 'kb');
    const m = mergeDecks(a, b);
    expect(m.cards.map((c) => c.id)).toEqual(['k1', 'kb', 'ka']);
    expect(sameDeck(m, mergeDecks(b, a))).toBe(true);
  });

  it('takes the latest edit, and a later deletion beats an edit', () => {
    const edited = updateCard(base, 'k1', { kind: 'basic', front: 'q2', back: 'r' }, T1);
    const deleted = deleteCard(base, 'k1', T2);
    expect(mergeDecks(edited, base).cards[0].front).toBe('q2');
    expect(mergeDecks(edited, deleted).cards[0].deleted).toBe(true);
    // une modification postérieure à la suppression fait revivre la carte
    const revived = updateCard(base, 'k1', { kind: 'basic', front: 'q3', back: 'r' }, '2026-10-04T00:00:00.000Z');
    expect(mergeDecks(deleted, revived).cards[0].front).toBe('q3');
  });

  it('keeps the most recently graded state of each sub-card', () => {
    const a: Deck = { ...base, review: { k1: review(T1, 2) } };
    const b: Deck = { ...base, review: { k1: review(T2, 1) } };
    expect(mergeDecks(a, b).review.k1.lastReview).toBe(T2);
    expect(mergeDecks(b, a).review.k1.lastReview).toBe(T2);
    expect(mergeDecks(a, base).review.k1.reps).toBe(2);
  });

  it('drops the state of a card deleted elsewhere', () => {
    const graded: Deck = { ...base, review: { k1: review(T1) } };
    expect(mergeDecks(graded, deleteCard(base, 'k1', T2)).review).toEqual({});
  });
});

describe('courseIdsInScope', () => {
  let subject: Subject = {
    id: 's1', name: 'ICM', code: 'ICM', color: '#000000', bgColor: '', textColor: '', borderColor: '', accentBg: '',
  };
  subject = addFolder(subject, 'A', undefined, 'fa');
  subject = addFolder(subject, 'A1', 'fa', 'fa1');
  const course = (id: string, subjectId: string, folderId?: string) =>
    ({ id, subjectId, folderId }) as Course;
  const courses = [course('c1', 's1'), course('c2', 's1', 'fa'), course('c3', 's1', 'fa1'), course('c4', 's2'), course('c5', 's1', 'gone')];

  it('selects a discipline, a folder with its sub-folders, a course or everything', () => {
    const ids = (s: Parameters<typeof courseIdsInScope>[0]) => [...courseIdsInScope(s, courses, [subject])].sort();
    expect(ids({ kind: 'all' })).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(ids({ kind: 'subject', subjectId: 's1' })).toEqual(['c1', 'c2', 'c3', 'c5']);
    expect(ids({ kind: 'subject', subjectId: 's1', folderId: 'fa' })).toEqual(['c2', 'c3']);
    expect(ids({ kind: 'course', courseId: 'c4' })).toEqual(['c4']);
    expect(ids({ kind: 'course', courseId: 'zz' })).toEqual([]);
  });
});

describe('moveCards', () => {
  it('moves cards with their history and leaves a tombstone behind', () => {
    let from = addCard(emptyDeck('c1'), { kind: 'cloze', front: '{{c1::a}} {{c2::b}}' }, T0, 'k1');
    from = addCard(from, { kind: 'basic', front: 'q', back: 'r' }, T0, 'k2');
    from = { ...from, review: { 'k1:c1': review(T1), k2: review(T1) } };
    const res = moveCards(from, emptyDeck('c2'), ['k1'], T2)!;
    expect(res.moved).toBe(1);
    expect(res.to.cards).toEqual([{ ...from.cards[0], updatedAt: T2 }]);
    expect(res.to.review).toEqual({ 'k1:c1': review(T1) });
    expect(res.from.cards[0]).toMatchObject({ id: 'k1', deleted: true });
    expect(Object.keys(res.from.review)).toEqual(['k2']);

    // et retour : la carte remplace sa pierre tombale
    const back = moveCards(res.to, res.from, ['k1'], '2026-10-04T00:00:00.000Z')!;
    expect(liveCards(back.to).map((c) => c.id).sort()).toEqual(['k1', 'k2']);
    expect(back.to.cards.filter((c) => c.id === 'k1')).toHaveLength(1);
    expect(back.to.review['k1:c1']).toEqual(review(T1));
  });

  it('does nothing within the same deck and refuses a full deck', () => {
    const d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r' }, T0, 'k1');
    expect(moveCards(d, d, ['k1'], T1)).toEqual({ from: d, to: d, moved: 0 });
    let full = emptyDeck('c2');
    for (let i = 0; i < 1000; i++) full = addCard(full, { kind: 'basic', front: `q${i}`, back: 'r' }, T0, `f${i}`);
    expect(moveCards(d, full, ['k1'], T1)).toBeNull();
  });
});

describe('images and occlusion cards', () => {
  const IMG = 'a'.repeat(64);
  const IMG2 = 'b'.repeat(64);
  const masks = [
    { id: 'm1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, group: 1 },
    { id: 'm2', x: 0.5, y: 0.1, w: 0.2, h: 0.2, group: 2 },
    { id: 'm3', x: 0.5, y: 0.5, w: 0.2, h: 0.2, group: 2 },
  ];

  it('accepts an image instead of text on either side of a basic card', () => {
    expect(validateCard({ kind: 'basic', front: '', frontImage: IMG, back: 'r' })).toBeNull();
    expect(validateCard({ kind: 'basic', front: 'q', backImage: IMG })).toBeNull();
    expect(validateCard({ kind: 'basic', front: '', frontImage: 'pas-un-id', back: 'r' })).toBe('empty-front');
    expect(validateCard({ kind: 'basic', front: 'q', back: '' })).toBe('empty-back');
  });

  it('needs an image and at least one mask for an occlusion card', () => {
    expect(validateCard({ kind: 'occlusion', front: '', masks })).toBe('no-image');
    expect(validateCard({ kind: 'occlusion', front: '', frontImage: IMG, masks: [] })).toBe('no-mask');
    expect(validateCard({ kind: 'occlusion', front: '', frontImage: IMG, masks })).toBeNull();
  });

  it('makes one sub-card per mask group and prunes reviews of removed groups', () => {
    let d = addCard(emptyDeck('c1'), { kind: 'occlusion', front: '', frontImage: IMG, backImage: IMG2, masks }, T0, 'k1');
    const card = d.cards[0];
    expect(card.backImage).toBeUndefined(); // pas de verso illustré pour des masques
    expect(card.occlusionMode).toBeUndefined(); // « tout masquer » par défaut
    expect(subCardKeys(card)).toEqual(['k1:m1', 'k1:m2']);
    expect(countSubCards(d)).toBe(2);
    d = { ...d, review: { 'k1:m1': review(T0), 'k1:m2': review(T0) } };
    d = updateCard(d, 'k1', { kind: 'occlusion', front: '', frontImage: IMG, masks: masks.slice(0, 1), occlusionMode: 'hide-one' }, T1);
    expect(Object.keys(d.review)).toEqual(['k1:m1']);
    expect(d.cards[0].occlusionMode).toBe('hide-one');
  });

  it('does not touch a card saved again unchanged, whatever the key order', () => {
    const d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r', frontImage: IMG }, T0, 'k1');
    // Firestore renvoie les champs dans l'ordre alphabétique
    const c = d.cards[0];
    const reordered: Deck = { ...d, cards: [{ updatedAt: c.updatedAt, kind: c.kind, id: c.id, frontImage: IMG, front: 'q', createdAt: c.createdAt, back: 'r' }] };
    expect(updateCard(reordered, 'k1', { kind: 'basic', front: 'q', back: 'r', frontImage: IMG }, T1)).toBe(reordered);
  });

  it('collects the images used by live cards only', () => {
    let d = addCard(emptyDeck('c1'), { kind: 'basic', front: 'q', back: 'r', frontImage: IMG }, T0, 'k1');
    d = addCard(d, { kind: 'basic', front: 'q2', back: 'r', backImage: IMG2 }, T0, 'k2');
    expect([...collectMediaIds([d])].sort()).toEqual([IMG, IMG2]);
    d = deleteCard(d, 'k2', T1);
    expect([...collectMediaIds([d])]).toEqual([IMG]);
  });
});

describe('searchCards', () => {
  let d1 = addCard(emptyDeck('c1'), { kind: 'basic', front: 'Mécanisme des IEC ?', back: 'Inhibition de l\'enzyme de conversion' }, T0, 'k1');
  d1 = addCard(d1, { kind: 'cloze', front: 'Les {{c1::sartans}} bloquent le récepteur {{c2::AT1}}' }, T0, 'k2');
  const d2 = addCard(emptyDeck('c2'), { kind: 'basic', front: 'Autre', back: 'Effet secondaire : TOUX' }, T0, 'k3');
  const decks = { c1: d1, c2: d2 };

  it('searches fronts, backs and cloze answers, ignoring case and accents', () => {
    expect(cardSearchText(d1.cards[1])).toBe('les sartans bloquent le recepteur at1');
    expect(Object.keys(searchCards(decks, 'MECANISME'))).toEqual(['c1']);
    expect(searchCards(decks, 'toux').c2.map((c) => c.id)).toEqual(['k3']);
    expect(searchCards(decks, 'at1')['c1'].map((c) => c.id)).toEqual(['k2']);
  });

  it('needs every word, in any order, and ignores braces of cloze markup', () => {
    expect(searchCards(decks, 'conversion enzyme').c1.map((c) => c.id)).toEqual(['k1']);
    expect(searchCards(decks, 'enzyme sartans')).toEqual({});
    expect(searchCards(decks, 'c1::')).toEqual({});
  });

  it('returns nothing for an empty query, skips deleted cards, and can be limited to some courses', () => {
    expect(searchCards(decks, '  ')).toEqual({});
    expect(searchCards({ c1: deleteCard(d1, 'k1', T1) }, 'mecanisme')).toEqual({});
    expect(searchCards(decks, 'a', ['c2'])).toHaveProperty('c2');
    expect(searchCards(decks, 'a', ['c2'])).not.toHaveProperty('c1');
  });
});
