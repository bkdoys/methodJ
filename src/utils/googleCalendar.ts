import { SlotEvent, localIsoDateTime } from './ics';
import { t } from '../i18n';
import { loadGoogleIdentity, requestGoogleToken } from './googleIdentity';

/** Droit le plus étroit : l'application ne voit que l'agenda qu'elle a créé elle-même, jamais les autres. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
/** Marque posée sur chaque événement créé ici : seuls ceux-là sont mis à jour ou retirés. */
/** Couleur d'événement Google « graphite ». */
const DONE_COLOR_ID = '8';
const MANAGED = { key: 'medj', value: '1' };

export class GoogleCalendarError extends Error {
  constructor(public status: number, message: string, public reason = '') {
    super(message);
  }
}

/** Limite de débit (ou panne passagère) : Google demande d'attendre puis de réessayer avec un délai croissant. */
export function isRetryable(status: number, reason: string): boolean {
  return status === 429 || status >= 500 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|backendError/i.test(reason));
}

/** Délai avant la nouvelle tentative n (0, 1, 2…) : 1 s, 2 s, 4 s… plus un peu de hasard, plafonné à 30 s. */
export function backoffDelayMs(attempt: number, random: number = Math.random()): number {
  return Math.min(30_000, 1000 * 2 ** attempt + Math.floor(random * 500));
}

const MAX_RETRIES = 6;
const PAUSE_BETWEEN_REQUESTS_MS = 150;
const CONCURRENCY = 2;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// Identifiants d'événements : fixes pour un créneau donné, donc renvoyer met à jour au lieu de dupliquer.
// Google impose des caractères base32hex minuscules (a-v, 0-9), 5 à 1024 caractères.
// ---------------------------------------------------------------------------------------------

const B32 = '0123456789abcdefghijklmnopqrstuv';

export async function eventIdForRevision(revisionId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revisionId))).slice(0, 20);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `mj${out}`;
}

/** Événements présents dans l'agenda mais absents de la liste voulue : à retirer (créneau supprimé, déplacé hors période, validé…). */
export function idsToDelete(existingIds: string[], desiredIds: Set<string>): string[] {
  return existingIds.filter((id) => !desiredIds.has(id));
}

// ---------------------------------------------------------------------------------------------
// Autorisation (jeton d'accès valable une heure : suffisant, l'envoi se fait à la demande)
// ---------------------------------------------------------------------------------------------

export { loadGoogleIdentity };

/** Ouvre la fenêtre d'autorisation Google. À appeler directement depuis un clic (sinon le navigateur la bloque). */
export function requestCalendarToken(clientId: string): Promise<string> {
  return requestGoogleToken(clientId, CALENDAR_SCOPE);
}

// ---------------------------------------------------------------------------------------------
// API Google Agenda
// ---------------------------------------------------------------------------------------------

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (res.status === 204) return null;
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
    throw new GoogleCalendarError(res.status, message || `HTTP ${res.status}`, reason);
  }
}

/** Message lisible pour une erreur d'envoi. */
export function describeGoogleError(err: unknown): string {
  if (err instanceof GoogleCalendarError) {
    if (err.status === 401) return t('Autorisation expirée : relancez l\'envoi.');
    if (err.status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(err.reason)) {
      return t('Google limite le nombre de requêtes : patientez quelques minutes puis relancez. Ce qui est déjà envoyé est conservé, le nouvel envoi reprend où il s\'est arrêté.');
    }
    if (err.status === 403 && /not been used|disabled|accessNotConfigured/i.test(err.message)) {
      return t('L\'API Google Agenda n\'est pas activée pour ce projet.');
    }
    if (err.status === 403) return t('Accès refusé par Google : {msg}', { msg: err.message });
    return t('Erreur Google Agenda ({status}) : {msg}', { status: err.status, msg: err.message });
  }
  return err instanceof Error ? err.message : t('Envoi impossible.');
}

/** Agenda dédié : réutilise celui déjà créé s'il existe encore (même compte Google), sinon en crée un. */
export async function ensureCalendar(token: string, calendarId: string | undefined, name: string, timeZone: string): Promise<string> {
  if (calendarId) {
    try {
      await api(token, `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1`);
      return calendarId;
    } catch (err) {
      // Supprimé ou d'un autre compte Google : on en recrée un
      if (!(err instanceof GoogleCalendarError) || ![403, 404, 410].includes(err.status)) throw err;
    }
  }
  const created = await api<{ id: string }>(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: name, timeZone }),
  });
  if (!created?.id) throw new GoogleCalendarError(500, t('Création de l\'agenda impossible.'));
  return created.id;
}

export interface ListedEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  colorId?: string;
  transparency?: string;
  reminders?: { useDefault?: boolean; overrides?: { minutes?: number }[] };
}

/** Événements de l'application dans l'agenda, sur une période. */
export async function listManagedEvents(token: string, calendarId: string, fromIso: string, toIso?: string): Promise<ListedEvent[]> {
  const events: ListedEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: '2500',
      singleEvents: 'true',
      showDeleted: 'false',
      privateExtendedProperty: `${MANAGED.key}=${MANAGED.value}`,
      timeMin: new Date(`${fromIso}T00:00:00`).toISOString(),
    });
    if (toIso) params.set('timeMax', new Date(`${toIso}T23:59:59`).toISOString());
    if (pageToken) params.set('pageToken', pageToken);
    const page = await api<{ items?: ListedEvent[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    );
    (page?.items ?? []).forEach((e) => events.push(e));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return events;
}

export function toGoogleEvent(id: string, e: SlotEvent, timeZone: string, reminderMinutes: number) {
  return {
    id,
    summary: e.title,
    description: e.description,
    start: { dateTime: localIsoDateTime(e.date, e.start), timeZone },
    end: { dateTime: localIsoDateTime(e.date, e.end), timeZone },
    extendedProperties: { private: { [MANAGED.key]: MANAGED.value, medjRevisionId: e.revisionId } },
    // Validé : gris (graphite) et « libre », pour se distinguer des créneaux à faire sans masquer le planning
    colorId: e.completed ? DONE_COLOR_ID : undefined,
    transparency: e.completed ? 'transparent' : 'opaque',
    reminders: {
      useDefault: false,
      overrides: reminderMinutes > 0 && !e.completed ? [{ method: 'popup', minutes: reminderMinutes }] : [],
    },
  };
}

/** L'événement présent dans l'agenda est-il déjà identique à celui qu'on enverrait ? (évite des requêtes inutiles au renvoi) */
export function isUnchanged(existing: ListedEvent, wanted: ReturnType<typeof toGoogleEvent>): boolean {
  const instant = (v?: string) => (v ? new Date(v).getTime() : NaN);
  const minutes = (e: { overrides?: { minutes?: number }[] } | undefined) => (e?.overrides ?? []).map((o) => o.minutes).join(',');
  return (
    (existing.summary ?? '') === wanted.summary &&
    (existing.description ?? '') === wanted.description &&
    instant(existing.start?.dateTime) === instant(wanted.start.dateTime) &&
    instant(existing.end?.dateTime) === instant(wanted.end.dateTime) &&
    (existing.colorId ?? undefined) === wanted.colorId &&
    (existing.transparency ?? 'opaque') === wanted.transparency &&
    !existing.reminders?.useDefault &&
    minutes(existing.reminders) === minutes(wanted.reminders)
  );
}

/** Crée ou met à jour un événement (même identifiant = même créneau). */
async function upsertEvent(token: string, calendarId: string, body: ReturnType<typeof toGoogleEvent>): Promise<'created' | 'updated'> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    await api(token, `${base}/${body.id}`, { method: 'PUT', body: JSON.stringify(body) });
    return 'updated';
  } catch (err) {
    if (!(err instanceof GoogleCalendarError) || err.status !== 404) throw err;
  }
  await api(token, base, { method: 'POST', body: JSON.stringify(body) });
  return 'created';
}

async function deleteEvent(token: string, calendarId: string, id: string): Promise<void> {
  try {
    await api(token, `/calendars/${encodeURIComponent(calendarId)}/events/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof GoogleCalendarError && (err.status === 404 || err.status === 410)) return; // déjà supprimé
    throw err;
  }
}

/** Exécute `fn` sur chaque élément, quelques requêtes à la fois. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
      await sleep(PAUSE_BETWEEN_REQUESTS_MS); // étale les requêtes : Google refuse les rafales
    }
  });
  await Promise.all(workers);
}

export interface SyncResult {
  calendarId: string;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
}

/** Aligne l'agenda dédié sur la liste de créneaux : crée, met à jour, retire ce qui n'existe plus sur la période. */
export async function syncToGoogleCalendar(opts: {
  token: string;
  calendarId?: string;
  calendarName: string;
  events: SlotEvent[];
  fromIso: string;
  toIso?: string;
  reminderMinutes: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<SyncResult> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  const calendarId = await ensureCalendar(opts.token, opts.calendarId, opts.calendarName, timeZone);

  const withIds = await Promise.all(opts.events.map(async (e) => ({ e, id: await eventIdForRevision(e.revisionId) })));
  const existing = await listManagedEvents(opts.token, calendarId, opts.fromIso, opts.toIso);
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const stale = idsToDelete(existing.map((e) => e.id), new Set(withIds.map((x) => x.id)));

  const total = withIds.length + stale.length;
  let done = 0;
  const tick = () => opts.onProgress?.(++done, total);
  const result: SyncResult = { calendarId, created: 0, updated: 0, unchanged: 0, removed: 0 };

  await pool(withIds, CONCURRENCY, async ({ e, id }) => {
    const body = toGoogleEvent(id, e, timeZone, opts.reminderMinutes);
    const current = existingById.get(id);
    if (current && isUnchanged(current, body)) {
      result.unchanged++;
    } else {
      result[await upsertEvent(opts.token, calendarId, body)]++;
    }
    tick();
  });
  await pool(stale, CONCURRENCY, async (id) => {
    await deleteEvent(opts.token, calendarId, id);
    result.removed++;
    tick();
  });
  return result;
}
