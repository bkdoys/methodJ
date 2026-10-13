import { CardReview, Course, Deck, Flashcard, FlashcardKind, OcclusionMask, OcclusionMode, Subject } from '../types';
import { maskGroups, normalizeMasks } from './occlusion';
import { foldText } from './courseTree';
import { courseInNode, formatCoursePath } from './folders';
import { getFolderColor } from './folderColors';
import { getCourseEffectiveColor } from './colorUtils';

/** Un paquet = un document Firestore (1 Mo max) : 1 000 cartes de 2 × 2 000 caractères au pire restent en dessous. */
export const MAX_CARDS_PER_DECK = 1000;
export const MAX_CARD_TEXT = 2000;
/** Durée de vie d'une pierre tombale : le temps que les autres appareils l'aient reçue. */
export const TOMBSTONE_TTL_DAYS = 30;

// Assez d'aléa pour un import de 1 000 cartes créées dans la même milliseconde
export function newCardId(): string {
  return `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDeck(courseId: string): Deck {
  return { id: courseId, cards: [], review: {} };
}

// ---------------------------------------------------------------------------
// Texte à trous : {{c1::réponse}} ou {{c1::réponse::indice}}

export type ClozePart =
  | { kind: 'text'; text: string }
  | { kind: 'cloze'; n: number; answer: string; hint?: string };

// Réponse et indice ne traversent pas d'autres accolades : un trou mal fermé reste du texte
const CLOZE_RE = /\{\{c(\d{1,2})::((?:(?!\{\{|\}\})[\s\S])*?)(?:::((?:(?!\{\{|\}\})[\s\S])*?))?\}\}/g;

export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE_RE)) {
    const n = Number(m[1]);
    const answer = m[2];
    if (n < 1 || !answer.trim()) continue; // laissé tel quel, comme du texte
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    const hint = m[3]?.trim();
    parts.push({ kind: 'cloze', n, answer, ...(hint ? { hint } : {}) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** Numéros de trous présents, triés et sans doublon. */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>();
  parseCloze(text).forEach((p) => p.kind === 'cloze' && set.add(p.n));
  return [...set].sort((a, b) => a - b);
}

export type ClozeSegment = { text: string; role: 'plain' | 'mask' | 'answer' };

/**
 * Texte d'une sous-carte : le trou `n` est masqué (`mask`, l'indice ou « … ») ou révélé (`answer`) ;
 * les autres trous s'affichent en clair.
 */
export function renderCloze(text: string, n: number, revealed: boolean): ClozeSegment[] {
  const out: ClozeSegment[] = [];
  const push = (seg: ClozeSegment) => {
    const prev = out[out.length - 1];
    if (prev && prev.role === 'plain' && seg.role === 'plain') prev.text += seg.text;
    else out.push(seg);
  };
  parseCloze(text).forEach((p) => {
    if (p.kind === 'text') push({ text: p.text, role: 'plain' });
    else if (p.n !== n) push({ text: p.answer, role: 'plain' });
    else if (revealed) push({ text: p.answer, role: 'answer' });
    else push({ text: p.hint ?? '…', role: 'mask' });
  });
  return out;
}

/**
 * Entoure la sélection `[start, end)` d'un nouveau trou (numéro suivant le plus grand présent).
 * Renvoie le texte et la position du curseur après le trou ; `null` si la sélection est vide.
 */
export function wrapCloze(text: string, start: number, end: number): { text: string; cursor: number } | null {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(text.length, Math.max(start, end));
  const selected = text.slice(a, b);
  if (!selected.trim()) return null;
  const n = Math.max(0, ...clozeNumbers(text)) + 1;
  const wrapped = `{{c${n}::${selected}}}`;
  return { text: text.slice(0, a) + wrapped + text.slice(b), cursor: a + wrapped.length };
}

// ---------------------------------------------------------------------------
// Cartes et sous-cartes

export function liveCards(deck: Deck | undefined): Flashcard[] {
  return deck ? deck.cards.filter((c) => !c.deleted) : [];
}

/** Clés de programmation d'une carte : une pour un recto/verso, une par numéro de trou ou par groupe de masques. */
export function subCardKeys(card: Flashcard): string[] {
  if (card.deleted) return [];
  if (card.kind === 'basic') return [card.id];
  if (card.kind === 'occlusion') return maskGroups(card.masks ?? []).map((g) => `${card.id}:m${g}`);
  return clozeNumbers(card.front).map((n) => `${card.id}:c${n}`);
}

/** Nombre de sous-cartes jouables d'un paquet. */
export function countSubCards(deck: Deck | undefined): number {
  return liveCards(deck).reduce((sum, c) => sum + subCardKeys(c).length, 0);
}

export interface CardInput {
  kind: FlashcardKind;
  front: string;
  back?: string;
  frontImage?: string;
  backImage?: string;
  masks?: OcclusionMask[];
  occlusionMode?: OcclusionMode;
}

export type CardError = 'empty-front' | 'empty-back' | 'no-cloze' | 'no-image' | 'no-mask';

function cleanText(s: string | undefined): string {
  return (s ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_CARD_TEXT);
}

/** Id de média valide (empreinte SHA-256 en hexadécimal, voir utils/media). */
export function isMediaId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
}

/** Erreur de saisie à afficher, ou null si la carte est valide. */
export function validateCard(input: CardInput): CardError | null {
  const front = cleanText(input.front);
  if (input.kind === 'occlusion') {
    if (!isMediaId(input.frontImage)) return 'no-image';
    return normalizeMasks(input.masks ?? []).length > 0 ? null : 'no-mask';
  }
  if (input.kind === 'cloze') {
    if (!front) return 'empty-front';
    return clozeNumbers(front).length > 0 ? null : 'no-cloze';
  }
  if (!front && !isMediaId(input.frontImage)) return 'empty-front';
  return cleanText(input.back) || isMediaId(input.backImage) ? null : 'empty-back';
}

/** Contenu d'une carte tel qu'enregistré (texte nettoyé, champs inutiles au type retirés). */
function cardContent(input: CardInput): Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'> {
  const back = cleanText(input.back);
  const occlusion = input.kind === 'occlusion';
  return {
    kind: input.kind,
    front: cleanText(input.front),
    ...(back ? { back } : {}),
    ...(isMediaId(input.frontImage) ? { frontImage: input.frontImage } : {}),
    ...(!occlusion && isMediaId(input.backImage) ? { backImage: input.backImage } : {}),
    ...(occlusion ? { masks: normalizeMasks(input.masks ?? []) } : {}),
    ...(occlusion && input.occlusionMode === 'hide-one' ? { occlusionMode: 'hide-one' as const } : {}),
  };
}

/** Ajoute une carte ; paquet inchangé si elle est invalide ou si le paquet est plein. */
export function addCard(deck: Deck, input: CardInput, now: string, id: string = newCardId()): Deck {
  if (validateCard(input) || liveCards(deck).length >= MAX_CARDS_PER_DECK) return deck;
  const card: Flashcard = { id, ...cardContent(input), createdAt: now, updatedAt: now };
  return { ...deck, cards: [...deck.cards, card] };
}

/** Modifie une carte (les états de programmation des trous ou masques disparus sont retirés). */
export function updateCard(deck: Deck, id: string, input: CardInput, now: string): Deck {
  const current = deck.cards.find((c) => c.id === id && !c.deleted);
  if (!current || validateCard(input)) return deck;
  const content = cardContent(input);
  // Comparaison dans l'ordre canonique des champs (Firestore renvoie les clés dans un autre ordre)
  if (JSON.stringify(content) === JSON.stringify(cardContent(current))) return deck;
  const next: Flashcard = { id, ...content, createdAt: current.createdAt, updatedAt: now };
  return pruneReview({ ...deck, cards: deck.cards.map((c) => (c.id === id ? next : c)) });
}

/** Texte d'une carte pour la recherche : recto (réponses des trous comprises) puis verso, accents et casse ignorés. */
export function cardSearchText(card: Flashcard): string {
  const front = card.kind === 'cloze' ? parseCloze(card.front).map((p) => (p.kind === 'text' ? p.text : p.answer)).join('') : card.front;
  return foldText(`${front}\n${card.back ?? ''}`);
}

/**
 * Cartes vivantes dont le recto ou le verso contient tous les mots de `query` (ordre et casse libres), par cours,
 * dans l'ordre du paquet. Cours sans résultat omis ; requête vide : aucun résultat.
 */
export function searchCards(decks: Record<string, Deck>, query: string, courseIds?: Iterable<string>): Record<string, Flashcard[]> {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const out: Record<string, Flashcard[]> = {};
  if (words.length === 0) return out;
  for (const courseId of courseIds ?? Object.keys(decks)) {
    const found = liveCards(decks[courseId]).filter((c) => {
      const text = cardSearchText(c);
      return words.every((w) => text.includes(w));
    });
    if (found.length > 0) out[courseId] = found;
  }
  return out;
}

/** Médias référencés par les cartes vivantes des paquets (les autres peuvent être effacés). */
export function collectMediaIds(decks: Iterable<Deck>): Set<string> {
  const ids = new Set<string>();
  for (const deck of decks) {
    liveCards(deck).forEach((c) => {
      if (c.frontImage) ids.add(c.frontImage);
      if (c.backImage) ids.add(c.backImage);
    });
  }
  return ids;
}

/** Supprime une carte : pierre tombale vidée de son texte, et sans état de programmation. */
export function deleteCard(deck: Deck, id: string, now: string): Deck {
  const current = deck.cards.find((c) => c.id === id && !c.deleted);
  if (!current) return deck;
  const tomb: Flashcard = { id, kind: current.kind, front: '', createdAt: current.createdAt, updatedAt: now, deleted: true };
  return pruneReview({ ...deck, cards: deck.cards.map((c) => (c.id === id ? tomb : c)) });
}

/**
 * Déplace des cartes d'un paquet à un autre, historique de révision compris : même id (les clés de programmation
 * restent valables), pierre tombale dans le paquet d'origine pour que les autres appareils suivent. `null` si le
 * paquet d'arrivée n'a pas la place.
 */
export function moveCards(from: Deck, to: Deck, ids: string[], now: string): { from: Deck; to: Deck; moved: number } | null {
  const wanted = new Set(ids);
  const moving = from.cards.filter((c) => wanted.has(c.id) && !c.deleted);
  if (moving.length === 0 || from.id === to.id) return { from, to, moved: 0 };
  if (liveCards(to).length + moving.length > MAX_CARDS_PER_DECK) return null;

  const review: Record<string, CardReview> = { ...to.review };
  moving.forEach((c) =>
    subCardKeys(c).forEach((k) => {
      if (from.review[k]) review[k] = from.review[k];
    })
  );
  const arriving = new Map(moving.map((c) => [c.id, { ...c, updatedAt: now }]));
  // Une carte revenue dans un paquet qu'elle avait quitté remplace sa pierre tombale
  const kept = to.cards.filter((c) => !arriving.has(c.id));
  const nextTo: Deck = { ...to, cards: [...kept, ...arriving.values()], review };
  const nextFrom = moving.reduce((d, c) => deleteCard(d, c.id, now), from);
  return { from: nextFrom, to: nextTo, moved: moving.length };
}

/** Retire les états de programmation qui ne correspondent plus à une sous-carte. */
function pruneReview(deck: Deck): Deck {
  const keys = new Set(deck.cards.flatMap(subCardKeys));
  const review: Record<string, CardReview> = {};
  let dropped = false;
  Object.entries(deck.review).forEach(([k, v]) => {
    if (keys.has(k)) review[k] = v;
    else dropped = true;
  });
  return dropped ? { ...deck, review } : deck;
}

/** Purge les pierres tombales plus vieilles que `TOMBSTONE_TTL_DAYS` et les états orphelins. */
export function normalizeDeck(deck: Deck, now: string): Deck {
  const limit = new Date(new Date(now).getTime() - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
  const cards = deck.cards.filter((c) => !c.deleted || c.updatedAt >= limit);
  return pruneReview(cards.length === deck.cards.length ? deck : { ...deck, cards });
}

// ---------------------------------------------------------------------------
// Fusion entre appareils (sans dialogue de conflit : une carte se fusionne naturellement)

function newerCard(a: Flashcard, b: Flashcard): Flashcard {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  // À égalité, la suppression l'emporte (elle a été voulue) ; sinon on garde `a`
  return b.deleted && !a.deleted ? b : a;
}

function newerReview(a: CardReview, b: CardReview): CardReview {
  const la = a.lastReview ?? '';
  const lb = b.lastReview ?? '';
  if (la !== lb) return la > lb ? a : b;
  return b.reps > a.reps ? b : a;
}

/**
 * Fusion de deux versions d'un même paquet : union des cartes par id (la plus récente gagne, pierres tombales
 * comprises), et pour chaque sous-carte l'état noté le plus récemment. Résultat en ordre canonique (cartes par date
 * de création, états par clé) : deux appareils obtiennent exactement le même paquet.
 */
export function mergeDecks(a: Deck, b: Deck): Deck {
  const cards = new Map<string, Flashcard>();
  [...a.cards, ...b.cards].forEach((c) => {
    const prev = cards.get(c.id);
    cards.set(c.id, prev ? newerCard(prev, c) : c);
  });
  const sorted = [...cards.values()].sort((x, y) =>
    x.createdAt === y.createdAt ? (x.id < y.id ? -1 : x.id > y.id ? 1 : 0) : x.createdAt < y.createdAt ? -1 : 1
  );

  const review: Record<string, CardReview> = {};
  const keys = [...new Set([...Object.keys(a.review), ...Object.keys(b.review)])].sort();
  keys.forEach((k) => {
    const ra = a.review[k];
    const rb = b.review[k];
    review[k] = ra && rb ? newerReview(ra, rb) : (ra ?? rb);
  });
  return pruneReview({ id: a.id, cards: sorted, review });
}

/** Même contenu (après fusion, l'ordre est canonique : une comparaison texte suffit). */
export function sameDeck(a: Deck | undefined, b: Deck | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(mergeDecks(a, a)) === JSON.stringify(mergeDecks(b, b));
}

// ---------------------------------------------------------------------------
// Périmètres : tout, une discipline, un dossier (et ses sous-dossiers), un cours

export type DeckScope =
  | { kind: 'all' }
  | { kind: 'subject'; subjectId: string; folderId?: string }
  | { kind: 'course'; courseId: string };

export function courseIdsInScope(scope: DeckScope, courses: Course[], subjects: Subject[]): Set<string> {
  if (scope.kind === 'course') {
    return new Set(courses.some((c) => c.id === scope.courseId) ? [scope.courseId] : []);
  }
  if (scope.kind === 'all') return new Set(courses.map((c) => c.id));
  const node = { subjectId: scope.subjectId, folderId: scope.folderId };
  return new Set(courses.filter((c) => courseInNode(c, node, subjects)).map((c) => c.id));
}

/** Titre et couleur d'une séance sur ce périmètre (`allLabel` : titre quand on prend tout). */
export function describeScope(
  scope: DeckScope,
  courses: Course[],
  subjects: Subject[],
  allLabel: string
): { title: string; color: string } {
  if (scope.kind === 'all') return { title: allLabel, color: '#0d9488' };
  if (scope.kind === 'course') {
    const course = courses.find((c) => c.id === scope.courseId);
    const subject = subjects.find((s) => s.id === course?.subjectId);
    return { title: course?.title ?? allLabel, color: getCourseEffectiveColor(course, subject) };
  }
  const subject = subjects.find((s) => s.id === scope.subjectId);
  return {
    title: formatCoursePath(subject, scope.folderId, 80).full || allLabel,
    color: getFolderColor(subject, scope.folderId) ?? subject?.color ?? '#0d9488',
  };
}
