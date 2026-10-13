import { deckScope } from './deckStore';
import { ReviewLogDay } from './reviewLog';

/**
 * Journal des notes de cartes sur l'appareil (IndexedDB `medj_cardlog_v1`), sur le modèle de `deckStore.ts` : un
 * enregistrement par jour `{ key: '<compte>/<jour>', scope, day, dirty }`, `dirty` = pas encore envoyé au cloud.
 * Sans IndexedDB, tout reste en mémoire le temps de la session.
 */

const DB_NAME = 'medj_cardlog_v1';
const STORE = 'days';
const LOCAL_SCOPE = 'local';

export interface StoredLogDay {
  day: ReviewLogDay;
  dirty: boolean;
}

interface Row extends StoredLogDay {
  key: string;
  scope: string;
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
    console.warn('Review log read error:', err);
    return [];
  }
}

async function writeRows(rows: Row[], removeKeys: string[] = []): Promise<void> {
  if (rows.length === 0 && removeKeys.length === 0) return;
  const db = await openDb();
  if (!db) {
    rows.forEach((r) => memory.set(r.key, r));
    removeKeys.forEach((k) => memory.delete(k));
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    rows.forEach((r) => store.put(r));
    removeKeys.forEach((k) => store.delete(k));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Review log write error:', err);
  }
}

/** Jours d'un compte. À la première connexion, ceux de l'usage sans compte sont recopiés (marqués à envoyer). */
export async function loadLogDays(uid: string | null | undefined): Promise<Record<string, StoredLogDay>> {
  const scope = deckScope(uid);
  let rows = await rowsOf(scope);
  if (rows.length === 0 && scope !== LOCAL_SCOPE) {
    const local = await rowsOf(LOCAL_SCOPE);
    rows = local.map((r) => ({ ...r, key: `${scope}/${r.day.id}`, scope, dirty: true }));
    await writeRows(rows);
  }
  const out: Record<string, StoredLogDay> = {};
  rows.forEach((r) => {
    out[r.day.id] = { day: r.day, dirty: r.dirty };
  });
  return out;
}

/** Enregistre ces jours et supprime ceux de `removed` (jour vidé par une annulation). */
export async function saveLogDays(uid: string | null | undefined, days: StoredLogDay[], removed: string[] = []): Promise<void> {
  const scope = deckScope(uid);
  await writeRows(
    days.map((d) => ({ key: `${scope}/${d.day.id}`, scope, day: d.day, dirty: d.dirty })),
    removed.map((id) => `${scope}/${id}`)
  );
}

// Dernière synchro avec le cloud (horodatage serveur, en ms) : on ne relit que les jours modifiés depuis.
const PULL_KEY = 'medj_cardlog_pulled_v1';

export function getLogLastPull(uid: string): number {
  try {
    return Number(localStorage.getItem(`${PULL_KEY}_${uid}`)) || 0;
  } catch {
    return 0;
  }
}

export function setLogLastPull(uid: string, millis: number): void {
  try {
    localStorage.setItem(`${PULL_KEY}_${uid}`, String(millis));
  } catch {
    // sans stockage, on relira tout la prochaine fois
  }
}
