/**
 * Images des cartes sur l'appareil, dans IndexedDB (base à part de celle des paquets). Deux magasins :
 * - `blobs` : le fichier, clé = id du média (empreinte du contenu : le même fichier sert à tous les comptes) ;
 * - `meta` : `{ key: '<compte>/<id>', scope, id, uploaded, createdAt }`, une ligne par compte qui l'utilise
 *   (`uploaded` = déjà dans Firebase Storage). On liste les lignes `meta` sans charger les fichiers.
 * Sans IndexedDB (navigation privée…), tout reste en mémoire le temps de la session.
 */

const DB_NAME = 'medj_media_v1';
const BLOBS = 'blobs';
const META = 'meta';

export interface MediaMeta {
  key: string;
  scope: string;
  id: string;
  uploaded: boolean;
  /** Date d'arrivée sur l'appareil (ms) : un média non référencé n'est effacé qu'après un délai de grâce. */
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memBlobs = new Map<string, Blob>();
const memMeta = new Map<string, MediaMeta>();

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(BLOBS);
          req.result.createObjectStore(META, { keyPath: 'key' }).createIndex('scope', 'scope');
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

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const metaKey = (scope: string, id: string) => `${scope}/${id}`;

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return memBlobs.get(id) ?? null;
  try {
    const blob = await done(db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(id) as IDBRequest<Blob | undefined>);
    return blob ?? null;
  } catch (err) {
    console.warn('Media store read error:', err);
    return null;
  }
}

export async function getMeta(scope: string, id: string): Promise<MediaMeta | null> {
  const db = await openDb();
  if (!db) return memMeta.get(metaKey(scope, id)) ?? null;
  try {
    const row = await done(db.transaction(META, 'readonly').objectStore(META).get(metaKey(scope, id)) as IDBRequest<MediaMeta | undefined>);
    return row ?? null;
  } catch (err) {
    console.warn('Media store read error:', err);
    return null;
  }
}

export async function listMeta(scope: string): Promise<MediaMeta[]> {
  const db = await openDb();
  if (!db) return [...memMeta.values()].filter((m) => m.scope === scope);
  try {
    return await done(db.transaction(META, 'readonly').objectStore(META).index('scope').getAll(scope) as IDBRequest<MediaMeta[]>);
  } catch (err) {
    console.warn('Media store read error:', err);
    return [];
  }
}

/** Enregistre des lignes `meta`, et le fichier s'il est fourni. */
export async function putMedia(rows: MediaMeta[], blob?: { id: string; blob: Blob }): Promise<void> {
  const db = await openDb();
  if (!db) {
    rows.forEach((r) => memMeta.set(r.key, r));
    if (blob) memBlobs.set(blob.id, blob.blob);
    return;
  }
  try {
    const tx = db.transaction([BLOBS, META], 'readwrite');
    if (blob) tx.objectStore(BLOBS).put(blob.blob, blob.id);
    rows.forEach((r) => tx.objectStore(META).put(r));
    await completed(tx);
  } catch (err) {
    console.warn('Media store write error:', err);
  }
}

/** Retire des lignes `meta` d'un compte, et les fichiers qu'aucun autre compte n'utilise plus. */
export async function removeMedia(scope: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  if (!db) {
    ids.forEach((id) => {
      memMeta.delete(metaKey(scope, id));
      if (![...memMeta.values()].some((m) => m.id === id)) {
        memBlobs.delete(id);
        memBlobs.delete(`draw:${id}`); // le dessin modifiable qui allait avec l'image
      }
    });
    return;
  }
  try {
    const tx = db.transaction([BLOBS, META], 'readwrite');
    const meta = tx.objectStore(META);
    ids.forEach((id) => meta.delete(metaKey(scope, id)));
    await completed(tx);
    // Les fichiers encore utilisés par un autre compte de l'appareil restent
    const all = await done(db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<MediaMeta[]>);
    const used = new Set(all.map((m) => m.id));
    const orphans = ids.filter((id) => !used.has(id));
    if (orphans.length > 0) {
      const tx2 = db.transaction(BLOBS, 'readwrite');
      orphans.forEach((id) => {
        tx2.objectStore(BLOBS).delete(id);
        tx2.objectStore(BLOBS).delete(`draw:${id}`); // le dessin modifiable qui allait avec l'image
      });
      await completed(tx2);
    }
  } catch (err) {
    console.warn('Media store delete error:', err);
  }
}
