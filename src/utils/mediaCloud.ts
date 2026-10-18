import { app } from './firebase';

/**
 * Images des cartes dans Firebase Storage, sous `users/{uid}/media/{id}` (voir storage.rules). `firebase/storage`
 * est chargé à la première utilisation, hors du morceau de démarrage. Un média est immuable (id = empreinte du
 * contenu) : on l'envoie une fois, on le relit au besoin, on l'efface quand plus aucune carte ne l'utilise.
 */

const path = (uid: string, id: string) => `users/${uid}/media/${id}`;
// Dessins modifiables (drawingSource.ts) : un fichier gzip par image, sous l'id de cette image
const drawingPath = (uid: string, imageId: string) => `users/${uid}/drawings/${imageId}`;

async function storage() {
  const mod = await import('firebase/storage');
  return { mod, st: mod.getStorage(app) };
}

export async function uploadMedia(uid: string, id: string, blob: Blob): Promise<void> {
  const { mod, st } = await storage();
  await mod.uploadBytes(mod.ref(st, path(uid, id)), blob, {
    contentType: blob.type,
    cacheControl: 'private, max-age=31536000, immutable',
  });
}

/** Le fichier, ou null s'il n'existe pas (pas encore envoyé par l'autre appareil, ou effacé). */
export async function downloadMedia(uid: string, id: string): Promise<Blob | null> {
  const { mod, st } = await storage();
  try {
    return await mod.getBlob(mod.ref(st, path(uid, id)));
  } catch (err) {
    if ((err as { code?: string }).code === 'storage/object-not-found') return null;
    throw err;
  }
}

export async function deleteMedia(uid: string, id: string): Promise<void> {
  const { mod, st } = await storage();
  try {
    await mod.deleteObject(mod.ref(st, path(uid, id)));
  } catch (err) {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err;
  }
}

export async function uploadDrawing(uid: string, imageId: string, blob: Blob): Promise<void> {
  const { mod, st } = await storage();
  await mod.uploadBytes(mod.ref(st, drawingPath(uid, imageId)), blob, {
    contentType: blob.type,
    cacheControl: 'private, max-age=31536000, immutable',
  });
}

export async function downloadDrawing(uid: string, imageId: string): Promise<Blob | null> {
  const { mod, st } = await storage();
  try {
    return await mod.getBlob(mod.ref(st, drawingPath(uid, imageId)));
  } catch (err) {
    if ((err as { code?: string }).code === 'storage/object-not-found') return null;
    throw err;
  }
}

export async function deleteDrawing(uid: string, imageId: string): Promise<void> {
  const { mod, st } = await storage();
  try {
    await mod.deleteObject(mod.ref(st, drawingPath(uid, imageId)));
  } catch (err) {
    if ((err as { code?: string }).code !== 'storage/object-not-found') throw err;
  }
}
