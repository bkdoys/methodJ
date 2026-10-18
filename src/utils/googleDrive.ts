import { t } from '../i18n';
import { APP_NAME } from '../appInfo';
import { backoffDelayMs, isRetryable } from './googleCalendar';
import { requestGoogleToken } from './googleIdentity';

/** Droit le plus étroit : l'application ne voit que les fichiers qu'elle a créés elle-même, jamais le reste du Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** Dossier créé dans le Drive : porte le nom de l'application. */
export const DRIVE_FOLDER_NAME = APP_NAME;

const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GoogleDriveError extends Error {
  constructor(public status: number, message: string, public reason = '') {
    super(message);
  }
}

/** Ouvre la fenêtre d'autorisation Google Drive. À appeler directement depuis un clic. */
export function requestDriveToken(clientId: string, loginHint?: string): Promise<string> {
  return requestGoogleToken(clientId, DRIVE_SCOPE, loginHint);
}

// ---------------------------------------------------------------------------------------------
// Parties pures (testées)
// ---------------------------------------------------------------------------------------------

/** Littéral de chaîne pour le paramètre `q` de Drive : `\` et `'` sont échappés par une barre oblique inverse. */
export function driveQueryString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Requête qui retrouve un fichier non supprimé de ce nom dans ce dossier. */
export function fileInFolderQuery(folderId: string, fileName: string): string {
  return `name = ${driveQueryString(fileName)} and ${driveQueryString(folderId)} in parents and trashed = false`;
}

/** Corps `multipart/related` d'un envoi Drive : métadonnées JSON puis contenu. */
export function buildMultipartBody(metadata: Record<string, unknown>, content: string, contentType: string, boundary: string): string {
  return (
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`
  );
}

// ---------------------------------------------------------------------------------------------
// API Google Drive
// ---------------------------------------------------------------------------------------------

async function api<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    if (res.ok) return (await res.json()) as T;

    let reason = '';
    let message = '';
    try {
      const err = (await res.json())?.error;
      message = err?.message ?? '';
      reason = err?.errors?.[0]?.reason ?? '';
    } catch {
      // corps non JSON : on garde le code HTTP
    }
    if (isRetryable(res.status, reason) && attempt < MAX_RETRIES) {
      await sleep(backoffDelayMs(attempt));
      continue;
    }
    throw new GoogleDriveError(res.status, message || `HTTP ${res.status}`, reason);
  }
}

/** Dossier de l'application : réutilise celui déjà créé s'il existe encore (pas à la corbeille), sinon en crée un. */
export async function ensureFolder(token: string, folderId: string | undefined, name = DRIVE_FOLDER_NAME): Promise<string> {
  if (folderId) {
    try {
      const f = await api<{ id: string; trashed?: boolean }>(token, `${API}/files/${encodeURIComponent(folderId)}?fields=id,trashed`);
      if (!f.trashed) return f.id;
    } catch (err) {
      // Supprimé ou d'un autre compte Google : on en recrée un
      if (!(err instanceof GoogleDriveError) || ![403, 404].includes(err.status)) throw err;
    }
  }
  const created = await api<{ id: string }>(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  return created.id;
}

async function findFile(token: string, folderId: string, fileName: string): Promise<string | null> {
  const q = encodeURIComponent(fileInFolderQuery(folderId, fileName));
  const res = await api<{ files?: { id: string }[] }>(token, `${API}/files?q=${q}&fields=files(id)&pageSize=1&spaces=drive`);
  return res.files?.[0]?.id ?? null;
}

export interface DriveBackupResult {
  folderId: string;
  fileId: string;
  /** Un fichier du même nom (même jour) existait et a été remplacé. */
  replaced: boolean;
}

/** Envoie la sauvegarde JSON dans le dossier de l'application ; un fichier du même nom est remplacé, pas dupliqué. */
export async function uploadBackupToDrive(opts: { token: string; folderId?: string; fileName: string; json: string }): Promise<DriveBackupResult> {
  const { token, fileName, json } = opts;
  const folderId = await ensureFolder(token, opts.folderId);
  const existing = await findFile(token, folderId, fileName);
  const boundary = `medj${Math.random().toString(36).slice(2)}`;
  const metadata = existing ? { name: fileName } : { name: fileName, parents: [folderId], mimeType: 'application/json' };
  const url = existing
    ? `${UPLOAD_API}/files/${encodeURIComponent(existing)}?uploadType=multipart&fields=id`
    : `${UPLOAD_API}/files?uploadType=multipart&fields=id`;
  const file = await api<{ id: string }>(token, url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: buildMultipartBody(metadata, json, 'application/json', boundary),
  });
  return { folderId, fileId: file.id, replaced: existing !== null };
}

/** Message lisible pour une erreur d'envoi vers Drive. */
export function describeDriveError(err: unknown): string {
  if (err instanceof GoogleDriveError) {
    if (err.status === 401) return t('Autorisation expirée : relancez la sauvegarde.');
    if (err.status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(err.reason)) {
      return t('Google limite le nombre de requêtes : patientez quelques minutes puis relancez.');
    }
    if (/storageQuotaExceeded/i.test(err.reason)) return t('Votre Google Drive est plein.');
    if (err.status === 403 && /not been used|disabled|accessNotConfigured/i.test(err.message)) {
      return t('L\'API Google Drive n\'est pas activée pour ce projet.');
    }
    if (err.status === 403) return t('Accès refusé par Google : {msg}', { msg: err.message });
    return t('Erreur Google Drive ({status}) : {msg}', { status: err.status, msg: err.message });
  }
  return err instanceof Error ? err.message : t('Sauvegarde impossible.');
}
