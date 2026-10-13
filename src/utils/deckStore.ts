import { Deck } from '../types';

/**
 * Paquets de cartes sur l'appareil, dans IndexedDB (localStorage, limité à environ 5 Mo, porte déjà le planning).
 * Un enregistrement par paquet : `{ key: '<compte>/<coursId>', scope, deck, dirty }` ; `scope` = uid connecté, ou
 * `local` sans compte (comme les clés suffixées de `storage.ts`). `dirty` = modifié ici, pas encore envoyé au cloud.
 * Si IndexedDB est indisponible (navigation privée…), on garde tout en mémoire le temps de la session.
 */

const DB_NAME = 'medj_decks_v1';
const STORE = 'decks';
const LOCAL_SCOPE = 'local';

export interface StoredDeck {
  deck: Deck;
  dirty: boolean;
}

interface Row extends StoredDeck {
  key: string;
  scope: string;
}

export function deckScope(uid: string | null | undefined): string {
  return uid || LOCAL_SCOPE;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Row>();

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('scope', 'scope');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rowsOf(scope: string): Promise<Row[]> {
  const db = await openDb();
  if (!db) return [...memory.values()].filter((r) => r.scope === scope);
  try {
    const tx = db.transaction(STORE, 'readonly');
    return await done(tx.objectStore(STORE).index('scope').getAll(scope) as IDBRequest<Row[]>);
  } catch (err) {
    console.warn('Deck store read error:', err);
    return [];
  }
}

async function putRows(rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  if (!db) {
    rows.forEach((r) => memory.set(r.key, r));
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    rows.forEach((r) => store.put(r));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Deck store write error:', err);
  }
}

/**
 * Paquets d'un compte. À la première connexion, ceux de l'usage sans compte sont recopiés (marqués à envoyer),
 * comme le fait `loadStoredData` pour le planning.
 */
export async function loadDecks(uid: string | null | undefined): Promise<Record<string, StoredDeck>> {
  const scope = deckScope(uid);
  let rows = await rowsOf(scope);
  if (rows.length === 0 && scope !== LOCAL_SCOPE) {
    const local = await rowsOf(LOCAL_SCOPE);
    rows = local.map((r) => ({ ...r, key: `${scope}/${r.deck.id}`, scope, dirty: true }));
    await putRows(rows);
  }
  const out: Record<string, StoredDeck> = {};
  rows.forEach((r) => {
    out[r.deck.id] = { deck: r.deck, dirty: r.dirty };
  });
  return out;
}

export async function saveDecks(uid: string | null | undefined, decks: StoredDeck[]): Promise<void> {
  const scope = deckScope(uid);
  await putRows(decks.map((d) => ({ key: `${scope}/${d.deck.id}`, scope, deck: d.deck, dirty: d.dirty })));
}

export async function removeDecks(uid: string | null | undefined, courseIds: string[]): Promise<void> {
  if (courseIds.length === 0) return;
  const scope = deckScope(uid);
  const keys = courseIds.map((id) => `${scope}/${id}`);
  const db = await openDb();
  if (!db) {
    keys.forEach((k) => memory.delete(k));
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    keys.forEach((k) => tx.objectStore(STORE).delete(k));
  } catch (err) {
    console.warn('Deck store delete error:', err);
  }
}

// Dernière synchro avec le cloud (horodatage serveur, en ms) : on ne relit que les paquets modifiés depuis.
const PULL_KEY = 'medj_decks_pulled_v1';

export function getLastPull(uid: string): number {
  try {
    return Number(localStorage.getItem(`${PULL_KEY}_${uid}`)) || 0;
  } catch {
    return 0;
  }
}

export function setLastPull(uid: string, millis: number): void {
  try {
    localStorage.setItem(`${PULL_KEY}_${uid}`, String(millis));
  } catch {
    // sans stockage, on relira tout la prochaine fois
  }
}
