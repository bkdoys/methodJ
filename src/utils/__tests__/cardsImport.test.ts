import { describe, expect, it } from 'vitest';
import { Course } from '../../types';
import { addCard, emptyDeck } from '../flashcards';
import { decodeFile, findCourse, guessMapping, htmlToText, parseDelimited, planCardsImport } from '../cardsImport';

const courses = [
  { id: 'c1', title: 'Insuffisance cardiaque', itemCode: 'EDN-228' },
  { id: 'c2', title: 'AVC', itemCode: 'EDN-335' },
] as Course[];

describe('parseDelimited', () => {
  it('reads a spreadsheet CSV with quotes, separators and line breaks inside quotes', () => {
    const t = parseDelimited('Recto;Verso;Cours\n"Mécanisme ; des IEC ?";"Inhibition\nde l\'ECA";EDN-228\n\nQ2;"Dit ""oui""";AVC\n');
    expect(t.separator).toBe(';');
    expect(t.rows).toEqual([
      ['Recto', 'Verso', 'Cours'],
      ['Mécanisme ; des IEC ?', 'Inhibition\nde l\'ECA', 'EDN-228'],
      ['Q2', 'Dit "oui"', 'AVC'],
    ]);
    expect(t.lines).toEqual([1, 2, 5]);
  });

  it('reads an Anki plain-text export with its header lines', () => {
    const t = parseDelimited('#separator:tab\n#html:true\n#deck column:3\nQuestion<br>ici\tRéponse &amp; plus\tCardio\n');
    expect(t.separator).toBe('\t');
    expect(t.html).toBe(true);
    expect(t.ankiColumns.deck).toBe(2);
    expect(t.rows).toEqual([['Question<br>ici', 'Réponse &amp; plus', 'Cardio']]);
    expect(t.lines).toEqual([4]);
  });

  it('detects comma and tab separators and drops a BOM', () => {
    expect(parseDelimited('﻿a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseDelimited('a\tb, c\nd\te').separator).toBe('\t');
  });
});

describe('htmlToText', () => {
  it('keeps line breaks and decodes entities', () => {
    expect(htmlToText('<div>Ligne 1</div><div>Ligne&nbsp;2 &lt;3&gt; &#233;</div>[sound:a.mp3]<img src="x.png">')).toBe(
      'Ligne 1\nLigne 2 <3> é'
    );
  });
});

describe('guessMapping', () => {
  it('uses a title row when there is one', () => {
    expect(guessMapping(parseDelimited('Cours;Question;Réponse\nEDN-228;q;r'))).toEqual({ front: 1, back: 2, course: 0, hasHeader: true });
  });

  it('skips Anki deck columns and defaults to the first two others', () => {
    expect(guessMapping(parseDelimited('#separator:tab\n#deck column:1\nDeck\tq\tr'))).toEqual({ front: 1, back: 2, course: -1, hasHeader: false });
  });
});

describe('planCardsImport', () => {
  it('sends rows to the course of their column, or to the chosen course', () => {
    const t = parseDelimited('Recto;Verso;Cours\nq1;r1;edn-228\nq2;r2;AVC\nq3;r3;\nq4;r4;Inconnu');
    const plan = planCardsImport(t, guessMapping(t), { courses, decks: {}, defaultCourseId: 'c2' });
    expect(plan.byCourse.c1).toEqual([{ kind: 'basic', front: 'q1', back: 'r1' }]);
    expect(plan.byCourse.c2.map((c) => c.front)).toEqual(['q2', 'q3']);
    expect(plan.rejected).toEqual([{ line: 5, reason: 'unknown-course', course: 'Inconnu' }]);
    expect(plan.added).toBe(3);
  });

  it('detects cloze cards, skips duplicates and reports incomplete rows', () => {
    const deck = addCard(emptyDeck('c1'), { kind: 'basic', front: 'Déjà là', back: 'x' }, '2026-10-01T00:00:00Z');
    const t = parseDelimited('Les {{c1::IEC}} toussent\tremarque\nDéjà  là\tx\nq\t\n\tr\nq2\tr2\nq2\tr2');
    const plan = planCardsImport(t, guessMapping(t), { courses, decks: { c1: deck }, defaultCourseId: 'c1' });
    expect(plan.byCourse.c1).toEqual([
      { kind: 'cloze', front: 'Les {{c1::IEC}} toussent', back: 'remarque' },
      { kind: 'basic', front: 'q2', back: 'r2' },
    ]);
    expect(plan.duplicates).toBe(2);
    expect(plan.rejected.map((r) => [r.line, r.reason])).toEqual([[3, 'no-back'], [4, 'empty']]);
  });

  it('needs a course for every row', () => {
    const t = parseDelimited('q,r');
    expect(planCardsImport(t, guessMapping(t), { courses, decks: {} }).rejected).toEqual([{ line: 1, reason: 'no-course' }]);
  });

  it('turns Anki HTML into text', () => {
    const t = parseDelimited('#html:true\n#separator:tab\nA<br>B\t<b>C</b>');
    const plan = planCardsImport(t, guessMapping(t), { courses, decks: {}, defaultCourseId: 'c1' });
    expect(plan.byCourse.c1).toEqual([{ kind: 'basic', front: 'A\nB', back: 'C' }]);
  });
});

describe('helpers', () => {
  it('finds a course by code or title', () => {
    expect(findCourse(' edn-335 ', courses)?.id).toBe('c2');
    expect(findCourse('insuffisance  CARDIAQUE', courses)?.id).toBe('c1');
    expect(findCourse('', courses)).toBeUndefined();
  });

  it('decodes UTF-8, else Windows-1252', () => {
    expect(decodeFile(new TextEncoder().encode('été').buffer)).toBe('été');
    expect(decodeFile(new Uint8Array([0x65, 0x74, 0xe9]).buffer)).toBe('eté');
  });
});
