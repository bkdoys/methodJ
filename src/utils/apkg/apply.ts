import { Course, Deck, Flashcard, Subject } from '../../types';
import { PRESET_COURSE_COLORS } from '../colorUtils';
import { foldText } from '../courseTree';
import { addCard, CardInput, emptyDeck, liveCards, MAX_CARDS_PER_DECK, newCardId, subCardKeys, validateCard } from '../flashcards';
import { addFolder, getFolders, newFolderId } from '../folders';
import { isInboxCourse } from '../inbox';
import { deriveCode } from '../subjectsImport';
import type { ApkgPlan, PlannedCard } from './convert';

// Du plan (pur, issu du paquet) aux changements de l'appli : disciplines et dossiers retrouvés ou créés, cours en
// révision libre retrouvés ou créés, cartes ajoutées sans doublon. Aucun effet de bord : l'appelant enregistre le résultat.

export interface ApplyContext {
  subjects: Subject[];
  courses: Course[];
  decks: Record<string, Deck>;
  todayIso: string;
  nowIso: string;
  /** Nom de fichier du paquet → id de média ; une image absente de la table est laissée de côté. */
  mediaIds: ReadonlyMap<string, string>;
  /** Cours du plan à importer (`PlannedCourse.key`). */
  selected: ReadonlySet<string>;
}

export interface CourseOutcome {
  key: string;
  courseId: string;
  title: string;
  /** Cours créé par l'import (sinon un cours existant a reçu les cartes). */
  created: boolean;
  added: number;
  duplicates: number;
  /** Cartes refusées : le paquet du cours est plein (1 000 cartes). */
  full: number;
  /** Cartes invalides une fois les images résolues. */
  skipped: number;
}

export interface ApplyResult {
  /** Liste complète des disciplines après l'import. */
  subjects: Subject[];
  createdSubjectIds: string[];
  createdFolders: { subjectId: string; folderId: string }[];
  newCourses: Course[];
  /** Paquets modifiés ou créés, par id de cours (paquet complet). */
  decks: Record<string, Deck>;
  /** Cartes ajoutées à des cours déjà présents, pour pouvoir les retirer (annulation). */
  addedToExisting: Record<string, string[]>;
  outcomes: CourseOutcome[];
  totals: { courses: number; cards: number; duplicates: number; full: number; skipped: number };
}

const norm = (s: string | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Clé de comparaison pour ne pas importer deux fois la même carte (même contenu et mêmes images). */
function dedupKey(c: Pick<Flashcard, 'kind' | 'front' | 'back' | 'frontImage' | 'backImage'>): string {
  return [c.kind, norm(c.front), norm(c.back), c.frontImage ?? '', c.backImage ?? ''].join('|');
}

function makeSubject(name: string, index: number): Subject {
  const color = PRESET_COURSE_COLORS[index % PRESET_COURSE_COLORS.length].hex;
  return {
    id: `sub_${Date.now().toString(36)}_${index}${Math.random().toString(36).slice(2, 5)}`,
    name,
    code: deriveCode(name),
    color,
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-800',
    borderColor: 'border-slate-200',
    accentBg: `${color}15`,
  };
}

/** Carte prête à ajouter, ou null si une image indispensable manque. */
function toInput(pc: PlannedCard, mediaIds: ReadonlyMap<string, string>): CardInput | null {
  const frontImage = pc.frontImageRef ? mediaIds.get(pc.frontImageRef) : undefined;
  const backImage = pc.backImageRef ? mediaIds.get(pc.backImageRef) : undefined;
  if (pc.kind === 'occlusion') {
    return frontImage
      ? { kind: 'occlusion', front: pc.front, back: pc.back, frontImage, masks: pc.masks, occlusionMode: pc.occlusionMode }
      : null;
  }
  if (pc.kind === 'cloze') return { kind: 'cloze', front: pc.front, back: pc.back };
  return { kind: 'basic', front: pc.front, back: pc.back, frontImage, backImage };
}

export function applyApkgPlan(plan: ApkgPlan, ctx: ApplyContext): ApplyResult {
  let subjects = [...ctx.subjects];
  const createdSubjectIds: string[] = [];
  const createdFolders: ApplyResult['createdFolders'] = [];
  const newCourses: Course[] = [];
  const decks: Record<string, Deck> = {};
  const addedToExisting: Record<string, string[]> = {};
  const outcomes: CourseOutcome[] = [];
  const known: Course[] = [...ctx.courses];

  const replaceSubject = (next: Subject) => {
    subjects = subjects.map((s) => (s.id === next.id ? next : s));
    return next;
  };

  for (const cp of plan.courses) {
    if (!ctx.selected.has(cp.key)) continue;

    // Discipline : retrouvée par son nom, sinon créée
    let subject = subjects.find((s) => foldText(s.name) === foldText(cp.subjectName));
    if (!subject) {
      subject = makeSubject(cp.subjectName, subjects.length);
      subjects = [...subjects, subject];
      createdSubjectIds.push(subject.id);
    }

    // Dossiers : un par niveau, retrouvés par leur nom sous le même parent, sinon créés
    let folderId: string | undefined;
    for (const name of cp.folderNames) {
      const found = getFolders(subject).find((f) => f.parentId === folderId && foldText(f.name) === foldText(name));
      if (found) {
        folderId = found.id;
        continue;
      }
      const id = newFolderId();
      const next = addFolder(subject, name, folderId, id);
      if (next === subject) break; // plus de place (200 dossiers, 2 niveaux) : le cours reste au niveau atteint
      subject = replaceSubject(next);
      createdFolders.push({ subjectId: subject.id, folderId: id });
      folderId = id;
    }

    // Cours : retrouvé (même discipline, même dossier, même titre) ou créé en révision libre
    const subjectId = subject.id;
    const sameTitle = (c: Course) => !isInboxCourse(c) && c.subjectId === subjectId && foldText(c.title) === foldText(cp.title);
    // Même discipline, même dossier, même titre ; à défaut, le seul cours de ce titre dans la discipline (rangé ailleurs :
    // on le réutilise plutôt que d'en créer un second ; s'il y en a plusieurs, on ne devine pas)
    let course = known.find((c) => sameTitle(c) && c.folderId === folderId);
    if (!course) {
      const candidates = known.filter(sameTitle);
      if (candidates.length === 1) course = candidates[0];
    }
    const created = !course;
    if (!course) {
      course = {
        id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: cp.title,
        itemCode: '',
        subjectId,
        ...(folderId ? { folderId } : {}),
        j0Date: ctx.todayIso,
        activeJList: [],
        mode: 'free',
        mastery: 0,
        createdAt: ctx.todayIso,
      };
      newCourses.push(course);
      known.push(course);
    }

    let deck = ctx.decks[course.id] ?? emptyDeck(course.id);
    const seen = new Set(liveCards(deck).map(dedupKey));
    let live = liveCards(deck).length;
    const outcome: CourseOutcome = { key: cp.key, courseId: course.id, title: course.title, created, added: 0, duplicates: 0, full: 0, skipped: 0 };
    const reviews: Deck['review'] = {};
    const ids: string[] = [];

    for (const pc of cp.cards) {
      const input = toInput(pc, ctx.mediaIds);
      if (!input || validateCard(input)) {
        outcome.skipped++;
        continue;
      }
      const key = dedupKey(input);
      if (seen.has(key)) {
        outcome.duplicates++;
        continue;
      }
      if (live >= MAX_CARDS_PER_DECK) {
        outcome.full++;
        continue;
      }
      const id = newCardId();
      const next = addCard(deck, input, ctx.nowIso, id);
      if (next === deck) {
        outcome.skipped++;
        continue;
      }
      deck = next;
      const card = deck.cards[deck.cards.length - 1];
      const valid = new Set(subCardKeys(card));
      for (const [suffix, state] of Object.entries(pc.reviews)) {
        if (valid.has(`${id}${suffix}`)) reviews[`${id}${suffix}`] = state;
      }
      seen.add(key);
      live++;
      ids.push(id);
      outcome.added++;
    }

    if (ids.length > 0) {
      decks[course.id] = { ...deck, review: { ...deck.review, ...reviews } };
      if (!created) addedToExisting[course.id] = [...(addedToExisting[course.id] ?? []), ...ids];
    } else if (created) {
      decks[course.id] = deck; // un cours créé reste en place même sans carte (ses sous-paquets peuvent en avoir)
    }
    outcomes.push(outcome);
  }

  const sum = (f: (o: CourseOutcome) => number) => outcomes.reduce((n, o) => n + f(o), 0);
  return {
    subjects,
    createdSubjectIds,
    createdFolders,
    newCourses,
    decks,
    addedToExisting,
    outcomes,
    totals: {
      courses: newCourses.length,
      cards: sum((o) => o.added),
      duplicates: sum((o) => o.duplicates),
      full: sum((o) => o.full),
      skipped: sum((o) => o.skipped),
    },
  };
}
