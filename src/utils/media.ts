import { mediaCloudAvailable } from './firebase';
import { getBlob, getMeta, listMeta, MediaMeta, metaKey, putMedia, removeMedia } from './mediaStore';

/**
 * Images des cartes : ajout (après compression), lecture et synchro avec Firebase Storage. Les paquets ne portent
 * que l'id du média ; le fichier vit dans IndexedDB (`mediaStore`) et, connecté, dans Storage. Une image ajoutée
 * hors ligne part au retour du réseau ; un autre appareil la télécharge à la première lecture puis la garde.
 * Le compte en cours est fixé par `useDecks` (`setMediaAccount`), comme pour les paquets.
 */

const LOCAL_SCOPE = 'local';
/** Un média que plus aucune carte n'utilise n'est effacé qu'après ce délai (annulations, autres appareils). */
export const MEDIA_GRACE_MS = 7 * 86_400_000;
const UPLOAD_DELAY_MS = 1000;

let scope = LOCAL_SCOPE;
let cloudUid: string | undefined;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;
let uploading = false;
/** URLs d'objet déjà créées (une par média et par session : le contenu ne change jamais). */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Empreinte SHA-256 du fichier ; aléatoire hors contexte sécurisé (iPad en http sur le réseau local). */
async function mediaIdOf(blob: Blob): Promise<string> {
  if (globalThis.crypto?.subtle) return toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

/**
 * Compte dont on lit et envoie les images (null = usage sans compte). À la première connexion, les images de
 * l'usage sans compte sont reprises (et envoyées), comme les paquets.
 */
export async function setMediaAccount(storageUid: string | null, uid: string | undefined): Promise<void> {
  scope = storageUid || LOCAL_SCOPE;
  cloudUid = mediaCloudAvailable && uid && uid === storageUid ? uid : undefined;
  if (scope !== LOCAL_SCOPE) {
    const mine = await listMeta(scope);
    if (mine.length === 0) {
      const local = await listMeta(LOCAL_SCOPE);
      await putMedia(local.map((m) => ({ ...m, key: metaKey(scope, m.id), scope, uploaded: false })));
    }
  }
  scheduleUpload(0);
}

/** Ajoute une image (déjà compressée) et renvoie son id ; elle part vers le cloud peu après. */
export async function addMedia(blob: Blob): Promise<string> {
  const id = await mediaIdOf(blob);
  const existing = await getMeta(scope, id);
  const row: MediaMeta = existing ?? { key: metaKey(scope, id), scope, id, uploaded: false, createdAt: Date.now() };
  await putMedia([{ ...row, createdAt: Date.now() }], { id, blob });
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
  if (!row.uploaded) scheduleUpload(UPLOAD_DELAY_MS);
  return id;
}

/** URL affichable d'un média : appareil d'abord, sinon le cloud (puis gardé sur l'appareil). */
export function getMediaUrl(id: string): Promise<string | null> {
  const known = urls.get(id);
  if (known) return Promise.resolve(known);
  const running = pending.get(id);
  if (running) return running;
  const job = (async () => {
    let blob = await getBlob(id);
    if (blob) {
      // Fichier présent pour un autre compte de l'appareil : on le rattache à celui-ci
      if (!(await getMeta(scope, id))) {
        await putMedia([{ key: metaKey(scope, id), scope, id, uploaded: false, createdAt: Date.now() }]);
        scheduleUpload(UPLOAD_DELAY_MS);
      }
    } else if (cloudUid && navigator.onLine) {
      try {
        blob = await (await import('./mediaCloud')).downloadMedia(cloudUid, id);
      } catch (err) {
        console.warn('Media download error:', err);
      }
      if (blob) await putMedia([{ key: metaKey(scope, id), scope, id, uploaded: true, createdAt: Date.now() }], { id, blob });
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  })().finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

function scheduleUpload(delay: number) {
  if (!cloudUid) return;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    flushMediaUploads();
  }, delay);
}

/** Envoie les images pas encore dans le cloud (au retour du réseau, après un ajout…). */
export async function flushMediaUploads(): Promise<void> {
  const uid = cloudUid;
  if (!uid || uploading || !navigator.onLine) return;
  uploading = true;
  try {
    const { uploadMedia } = await import('./mediaCloud');
    for (const m of await listMeta(uid)) {
      if (m.uploaded || cloudUid !== uid) continue;
      const blob = await getBlob(m.id);
      if (!blob) continue;
      await uploadMedia(uid, m.id, blob);
      await putMedia([{ ...m, uploaded: true }]);
    }
  } catch (err) {
    console.warn('Media upload error:', err);
  } finally {
    uploading = false;
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', () => scheduleUpload(0));

/**
 * Efface (appareil et cloud) les images qu'aucune carte n'utilise plus depuis `MEDIA_GRACE_MS`. À n'appeler
 * qu'une fois les paquets à jour (après la relecture du cloud), sinon une carte venue d'ailleurs perdrait son image.
 */
export async function pruneMedia(referenced: Set<string>, now: number = Date.now()): Promise<void> {
  const current = scope;
  const uid = cloudUid;
  const stale = (await listMeta(current)).filter((m) => !referenced.has(m.id) && now - m.createdAt > MEDIA_GRACE_MS);
  if (stale.length === 0) return;
  if (uid) {
    const { deleteMedia } = await import('./mediaCloud');
    for (const m of stale) {
      try {
        await deleteMedia(uid, m.id);
      } catch (err) {
        console.warn('Media delete error:', err);
        return; // on réessaiera à la prochaine ouverture
      }
    }
  }
  await removeMedia(current, stale.map((m) => m.id));
  stale.forEach((m) => {
    const url = urls.get(m.id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(m.id);
  });
}
