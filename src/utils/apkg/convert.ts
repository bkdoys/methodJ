import { CardReview, OcclusionMask, OcclusionMode } from '../../types';
import { t } from '../../i18n';
import { clozeNumbers, MAX_CARD_TEXT, MAX_CARDS_PER_DECK } from '../flashcards';
import { MAX_FOLDER_DEPTH } from '../folders';
import { maskGroups } from '../occlusion';
import { parseField } from './fields';
import { hasOcclusion, parseAnkiOcclusion } from './occlusion';
import type { AnkiCard, AnkiNote, AnkiNotetype, AnkiPackage } from './reader';
import { ankiCardToReview } from './schedule';

// Conversion d'un paquet Anki en cartes et en cours : pure (aucun accès au disque ni au réseau, les images restent des
// noms de fichiers à résoudre plus tard).
//   - un paquet (ou sous-paquet) Anki devient un cours en révision libre ; « Biologie::Cellule::ADN » donne la
//     discipline « Biologie », le dossier « Cellule » et le cours « ADN » ;
//   - une note recto/verso = une carte (deux si Anki a aussi le sens inverse), une note à trous = une carte à trous
//     (même syntaxe {{c1::…}}), une note Image Occlusion = une carte à masques ;
//   - l'avancement (intervalles, échéances) est converti en état FSRS ; les cartes suspendues sont laissées de côté.

/** Une carte à créer. Les images sont des noms de fichiers du paquet. */
export interface PlannedCard {
  kind: 'basic' | 'cloze' | 'occlusion';
  front: string;
  back?: string;
  frontImageRef?: string;
  backImageRef?: string;
  masks?: OcclusionMask[];
  occlusionMode?: OcclusionMode;
  /** États repris, par suffixe de clé : '' (recto/verso), ':c2' (trou 2), ':m3' (groupe de masques 3). */
  reviews: Record<string, CardReview>;
}

export interface PlannedCourse {
  /** Stable pour ce paquet : l'id du paquet Anki, plus `#n` si le paquet est coupé en plusieurs cours. */
  key: string;
  deckId: number;
  /** Chemin du paquet Anki. */
  path: string[];
  subjectName: string;
  /** Dossiers sous la discipline (0 à 2). */
  folderNames: string[];
  title: string;
  cards: PlannedCard[];
}

export interface ApkgStats {
  /** Notes converties en au moins une carte. */
  notes: number;
  /** Cartes créées. */
  cards: number;
  /** Sous-cartes dont l'avancement est repris. */
  withProgress: number;
  /** Notes ignorées : toutes leurs cartes sont suspendues dans Anki. */
  suspended: number;
  /** Notes ignorées : vides, sans verso, trou ou masque utilisable, ou trop longues. */
  skipped: number;
  /** Images distinctes utilisées. */
  images: number;
  /** Images citées mais absentes du paquet. */
  missingImages: number;
  /** Images en trop (une par face) ou dans une carte à trous. */
  droppedImages: number;
  /** Formes d'occlusion laissées de côté (texte, forme illisible). */
  ignoredShapes: number;
  sounds: number;
}

export interface ApkgPlan {
  courses: PlannedCourse[];
  stats: ApkgStats;
}

export interface PlanOptions {
  /** Reprendre l'avancement d'Anki (sinon tout repart en cartes nouvelles). */
  keepProgress: boolean;
  /** Une discipline par paquet de premier niveau, des dossiers pour les sous-paquets (sinon tout dans `fallbackSubject`). */
  recreateTree: boolean;
  fallbackSubject: string;
  now: Date;
}

const MAX_TITLE = 150;
/** Une discipline : 100 caractères au plus (règles Firestore) ; un dossier : voir `folders.ts`. */
const MAX_SUBJECT = 100;
const MAX_FOLDER = 100;

const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n = MAX_TITLE) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Place d'un paquet Anki dans l'arborescence de l'appli. */
export function placeDeck(
  rawPath: string[],
  opts: Pick<PlanOptions, 'recreateTree' | 'fallbackSubject'>
): { subjectName: string; folderNames: string[]; title: string } {
  const parts = rawPath.map(cleanName).filter(Boolean);
  if (parts.length === 0) parts.push(t('Sans nom'));
  if (!opts.recreateTree) return { subjectName: opts.fallbackSubject, folderNames: [], title: clip(parts.join(' › ')) };
  if (parts.length === 1) return { subjectName: clip(parts[0], MAX_SUBJECT), folderNames: [], title: clip(parts[0]) };
  const [subjectName, ...rest] = parts;
  const leaf = rest[rest.length - 1];
  const middle = rest.slice(0, -1);
  // Deux niveaux de dossiers au plus : les niveaux en trop rejoignent le titre du cours
  return {
    subjectName: clip(subjectName, MAX_SUBJECT),
    folderNames: middle.slice(0, MAX_FOLDER_DEPTH).map((n) => clip(n, MAX_FOLDER)),
    title: clip([...middle.slice(MAX_FOLDER_DEPTH), leaf].join(' › ')),
  };
}

interface Ctx {
  opts: PlanOptions;
  crt: number;
  media: Set<string>;
  used: Set<string>;
  stats: ApkgStats;
}

/** Première image d'une liste qui existe dans le paquet ; les autres sont comptées en trop ou en manque. */
function pickImage(names: string[], ctx: Ctx): string | undefined {
  const present = names.filter((n) => ctx.media.has(n));
  ctx.stats.missingImages += names.length - present.length;
  ctx.stats.droppedImages += Math.max(0, present.length - 1);
  if (present[0]) ctx.used.add(present[0]);
  return present[0];
}

const stateOf = (card: AnkiCard | undefined, ctx: Ctx): CardReview | null =>
  card && ctx.opts.keepProgress ? ankiCardToReview(card, ctx.crt, ctx.opts.now) : null;

/** Texte limité à la taille d'un champ de l'appli ; `true` s'il a fallu couper. */
function fit(text: string): { text: string; cut: boolean } {
  return text.length > MAX_CARD_TEXT ? { text: text.slice(0, MAX_CARD_TEXT).trimEnd(), cut: true } : { text, cut: false };
}

function review(map: Record<string, CardReview>, key: string, r: CardReview | null) {
  if (r) map[key] = r;
}

function convertOcclusion(note: AnkiNote, usable: AnkiCard[], ctx: Ctx): PlannedCard[] {
  const occIndex = note.fields.findIndex(hasOcclusion);
  const parsed = parseAnkiOcclusion(note.fields[occIndex]);
  ctx.stats.ignoredShapes += parsed.ignored;
  const others = note.fields.map((f, i) => ({ i, f: parseField(f) })).filter((x) => x.i !== occIndex);
  const imageName = others.flatMap((x) => x.f.images)[0] ?? '';
  const image = imageName && ctx.media.has(imageName) ? imageName : undefined;
  if (imageName && !image) ctx.stats.missingImages++;
  if (!image || parsed.masks.length === 0) return [];
  ctx.used.add(image);
  others.forEach((x) => (ctx.stats.sounds += x.f.sounds));
  // Titre puis remarque : les deux premiers champs de texte non vides
  const texts = others.map((x) => x.f.text).filter(Boolean);
  const groups = new Set(maskGroups(parsed.masks));
  const reviews: Record<string, CardReview> = {};
  for (const c of usable) {
    const group = c.ord + 1;
    if (groups.has(group)) review(reviews, `:m${group}`, stateOf(c, ctx));
  }
  return [
    {
      kind: 'occlusion',
      front: fit(texts[0] ?? '').text,
      ...(texts[1] ? { back: fit(texts.slice(1).join('\n')).text } : {}),
      frontImageRef: image,
      masks: parsed.masks,
      ...(parsed.mode === 'hide-one' ? { occlusionMode: 'hide-one' as const } : {}),
      reviews,
    },
  ];
}

function convertCloze(note: AnkiNote, usable: AnkiCard[], ctx: Ctx): PlannedCard[] {
  const text = parseField(note.fields[0] ?? '');
  const extra = parseField(note.fields[1] ?? '');
  ctx.stats.sounds += text.sounds + extra.sounds;
  ctx.stats.droppedImages += text.images.length + extra.images.length;
  const numbers = clozeNumbers(text.text);
  // Un texte coupé en plein trou serait cassé : on laisse la note de côté plutôt que de la tronquer
  if (numbers.length === 0 || text.text.length > MAX_CARD_TEXT) return [];
  const reviews: Record<string, CardReview> = {};
  for (const c of usable) {
    const n = c.ord + 1;
    if (numbers.includes(n)) review(reviews, `:c${n}`, stateOf(c, ctx));
  }
  return [{ kind: 'cloze', front: text.text, ...(extra.text ? { back: fit(extra.text).text } : {}), reviews }];
}

function convertBasic(note: AnkiNote, usable: AnkiCard[], type: AnkiNotetype | undefined, ctx: Ctx): PlannedCard[] {
  const a = parseField(note.fields[0] ?? '');
  const b = parseField(note.fields[1] ?? '');
  ctx.stats.sounds += a.sounds + b.sounds;
  const imgA = pickImage(a.images, ctx);
  const imgB = pickImage(b.images, ctx);
  const hasA = !!a.text || !!imgA;
  const hasB = !!b.text || !!imgB;
  if (!hasA || !hasB) return [];

  const forward = usable.find((c) => c.ord === 0);
  const reverse = usable.find((c) => c.ord === 1);
  const out: PlannedCard[] = [];
  const side = (front: typeof a, frontImg: string | undefined, back: typeof a, backImg: string | undefined, anki: AnkiCard | undefined) => {
    const f = fit(front.text);
    const k = fit(back.text);
    const state = stateOf(anki, ctx);
    out.push({
      kind: 'basic',
      front: f.text,
      back: k.text,
      ...(frontImg ? { frontImageRef: frontImg } : {}),
      ...(backImg ? { backImageRef: backImg } : {}),
      reviews: state ? { '': state } : {},
    });
  };
  // Un type de note sans carte 0 utilisable (suspendue) mais avec le sens inverse : on ne garde que celui-ci
  if (forward || !reverse) side(a, imgA, b, imgB, forward ?? usable[0]);
  if (reverse && !type?.cloze) side(b, imgB, a, imgA, reverse);
  return out;
}

/** Cartes de l'appli pour une note ; liste vide si elle n'est pas exploitable. */
function convertNote(note: AnkiNote, usable: AnkiCard[], type: AnkiNotetype | undefined, ctx: Ctx): PlannedCard[] {
  if (note.fields.some(hasOcclusion)) return convertOcclusion(note, usable, ctx);
  if (type?.cloze || /\{\{c\d+::/.test(note.fields[0] ?? '')) return convertCloze(note, usable, ctx);
  return convertBasic(note, usable, type, ctx);
}

export function planApkgImport(pkg: AnkiPackage, opts: PlanOptions): ApkgPlan {
  const stats: ApkgStats = {
    notes: 0,
    cards: 0,
    withProgress: 0,
    suspended: 0,
    skipped: 0,
    images: 0,
    missingImages: 0,
    droppedImages: 0,
    ignoredShapes: 0,
    sounds: 0,
  };
  const ctx: Ctx = { opts, crt: pkg.crt, media: new Set(pkg.mediaNames), used: new Set(), stats };

  const cardsByNote = new Map<number, AnkiCard[]>();
  for (const c of pkg.cards) {
    const list = cardsByNote.get(c.nid);
    if (list) list.push(c);
    else cardsByNote.set(c.nid, [c]);
  }

  const byDeck = new Map<number, PlannedCard[]>();
  // Les identifiants de notes sont des dates de création : on garde l'ordre d'origine
  for (const note of [...pkg.notes].sort((x, y) => x.id - y.id)) {
    const cards = (cardsByNote.get(note.id) ?? []).sort((x, y) => x.ord - y.ord);
    // Suspendue (queue -1) : écartée ; enterrée (-2, -3) : simplement reportée par Anki, elle reste
    const usable = cards.filter((c) => c.queue !== -1);
    if (cards.length > 0 && usable.length === 0) {
      stats.suspended++;
      continue;
    }
    if (usable.length === 0) {
      stats.skipped++;
      continue;
    }
    const planned = convertNote(note, usable, pkg.notetypes.get(note.mid), ctx);
    if (planned.length === 0) {
      stats.skipped++;
      continue;
    }
    const deckId = usable[0].did;
    const list = byDeck.get(deckId);
    if (list) list.push(...planned);
    else byDeck.set(deckId, planned);
    stats.notes++;
    stats.cards += planned.length;
    stats.withProgress += planned.reduce((n, c) => n + Object.keys(c.reviews).length, 0);
  }
  stats.images = ctx.used.size;

  // Un paquet qui a des cartes ET des sous-paquets : ses cartes iraient en racine, à côté d'un dossier du même nom
  // (« C1 » cours et « C1 » dossier). Elles vont plutôt dans un cours du même nom, dans ce dossier.
  const hasChildren = (name: string) => [...byDeck.keys()].some((id) => pkg.decks.get(id)?.name.startsWith(`${name}::`));
  const courses: PlannedCourse[] = [];
  for (const [deckId, cards] of byDeck) {
    const deck = pkg.decks.get(deckId);
    const path = deck ? deck.name.split('::') : [`${t('Paquet')} ${deckId}`];
    const where = placeDeck(deckId === 1 && deck?.name === 'Default' ? [t('Par défaut')] : path, opts);
    if (opts.recreateTree && deck && path.length >= 2 && where.folderNames.length < MAX_FOLDER_DEPTH && hasChildren(deck.name)) {
      where.folderNames = [...where.folderNames, where.title];
    }
    // Un paquet de plus de 1 000 cartes devient plusieurs cours : un paquet de l'appli ne tient pas plus (1 Mo)
    const parts = Math.ceil(cards.length / MAX_CARDS_PER_DECK);
    for (let i = 0; i < parts; i++) {
      courses.push({
        key: parts > 1 ? `${deckId}#${i + 1}` : String(deckId),
        deckId,
        path,
        subjectName: where.subjectName,
        folderNames: where.folderNames,
        title: parts > 1 ? clip(`${where.title} (${i + 1})`) : where.title,
        cards: cards.slice(i * MAX_CARDS_PER_DECK, (i + 1) * MAX_CARDS_PER_DECK),
      });
    }
  }
  courses.sort((x, y) => x.path.join('::').localeCompare(y.path.join('::'), undefined, { sensitivity: 'base', numeric: true }));
  return { courses, stats };
}
