import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { t } from '../i18n';
import { revLabel } from './jMethod';

/** Données applicatives telles que synchronisées (même forme que AppDataState). */
export interface SyncData {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
}

/** Contenu du cloud, avec l'estampille la plus récente trouvée dans ses documents. */
export interface CloudSnapshot {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings | null;
  stamp: string | null;
  /** Jeton écrit dans le document des réglages à chaque envoi complet ou partiel (absent si jamais écrit). */
  token?: string | null;
}

/**
 * Mémoire locale, par compte, de la dernière synchronisation :
 *  - hash : empreinte des données au moment où local et cloud étaient identiques
 *  - stamp : plus récent `updatedAt` du cloud que CET appareil a lu ou écrit
 *  - syncedAt : date de cette synchro (affichage)
 */
export interface SyncMeta {
  hash?: string;
  stamp?: string;
  syncedAt?: string;
  /** Empreinte de chaque document à la dernière synchro : l'envoi automatique n'envoie que ceux qui ont changé. */
  docs?: DocHashes;
  /** Dernier jeton de synchro du cloud que CET appareil a écrit ou lu en entier. */
  token?: string;
}

/** Empreintes par document (id -> empreinte), réglages compris. */
export interface DocHashes {
  courses: Record<string, string>;
  revisions: Record<string, string>;
  subjects: Record<string, string>;
  settings: string;
}

/** Documents à envoyer : ceux qui sont nouveaux ou modifiés depuis la dernière synchro. */
export interface PendingChanges {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  /** Nombre de documents modifiés, réglages compris. */
  count: number;
}

export type ReconcileDecision = 'in-sync' | 'adopt-cloud' | 'push-local' | 'conflict';

const META_KEY = 'medj_cloud_meta_v1';
const BACKUPS_KEY = 'medj_safety_backups_v1';
const MAX_BACKUPS = 2;

// Champs techniques ajoutés par la synchro : ignorés dans les comparaisons.
const IGNORED_KEYS = new Set(['userId', 'updatedAt', 'syncToken']);

/** JSON canonique : clés triées, champs techniques retirés. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => !IGNORED_KEYS.has(k) && obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// FNV-1a 32 bits ; suffisant pour détecter un changement
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${s.length}`;
}

// JSON canonique gardé par objet et par tableau : l'état n'est jamais modifié en place (un changement crée de
// nouveaux objets), donc seuls les éléments modifiés sont resérialisés. Même texte que `canon` sur le tableau trié.
const canonCache = new WeakMap<object, string>();
function canonCached(value: object): string {
  let out = canonCache.get(value);
  if (out === undefined) {
    out = canon(value);
    canonCache.set(value, out);
  }
  return out;
}
function canonSorted<T extends { id: string }>(items: T[]): string {
  let out = canonCache.get(items);
  if (out === undefined) {
    out = `[${[...items].sort(byId).map(canonCached).join(',')}]`;
    canonCache.set(items, out);
  }
  return out;
}

/**
 * Empreinte stable des données (indépendante de l'ordre des tableaux et des clés). Le texte haché est exactement
 * `canon({ courses, revisions, settings, subjects })` (collections triées par id, clés dans l'ordre) : il ne doit
 * pas changer, sinon les empreintes déjà enregistrées feraient croire à des modifications locales.
 */
export function hashData(d: SyncData): string {
  const key = (k: string) => JSON.stringify(k);
  return fnv1a(
    `{${key('courses')}:${canonSorted(d.courses)},${key('revisions')}:${canonSorted(d.revisions)},` +
      `${key('settings')}:${canon(d.settings)},${key('subjects')}:${canonSorted(d.subjects)}}`
  );
}

const hashEach = <T extends { id: string }>(items: T[]): Record<string, string> =>
  Object.fromEntries(items.map((x) => [x.id, fnv1a(canonCached(x))]));

/** Empreinte de chaque document (mêmes règles que `hashData` : champs techniques ignorés). */
export function hashDocs(d: SyncData): DocHashes {
  return {
    courses: hashEach(d.courses),
    revisions: hashEach(d.revisions),
    subjects: hashEach(d.subjects),
    settings: fnv1a(canon(d.settings)),
  };
}

/**
 * Documents nouveaux ou modifiés par rapport aux empreintes de la dernière synchro.
 * Sans empreintes (première synchro, ancienne version de l'app), tout est à envoyer.
 * Les suppressions ne sont pas listées : elles passent par les suppressions ciblées.
 */
export function pendingChanges(data: SyncData, docs: DocHashes | undefined): PendingChanges {
  if (!docs) {
    const count = data.courses.length + data.revisions.length + data.subjects.length + 1;
    return { courses: data.courses, revisions: data.revisions, subjects: data.subjects, count };
  }
  const changed = <T extends { id: string }>(items: T[], known: Record<string, string>) =>
    items.filter((x) => known[x.id] !== fnv1a(canonCached(x)));
  const courses = changed(data.courses, docs.courses);
  const revisions = changed(data.revisions, docs.revisions);
  const subjects = changed(data.subjects, docs.subjects);
  const settingsChanged = docs.settings !== fnv1a(canon(data.settings));
  const count = courses.length + revisions.length + subjects.length + (settingsChanged ? 1 : 0);
  return { courses, revisions, subjects, count };
}

/** Transforme un instantané cloud en données utilisables (valeurs par défaut du local si absentes). */
export function cloudToData(cloud: CloudSnapshot, fallback: SyncData): SyncData {
  return {
    courses: cloud.courses,
    revisions: cloud.revisions,
    subjects: cloud.subjects.length > 0 ? cloud.subjects : fallback.subjects,
    settings: cloud.settings ?? fallback.settings,
  };
}

// ---------- Méta de synchro (localStorage) ----------

export function getSyncMeta(userId: string): SyncMeta {
  try {
    const raw = localStorage.getItem(`${META_KEY}_${userId}`);
    return raw ? (JSON.parse(raw) as SyncMeta) : {};
  } catch {
    return {};
  }
}

function setSyncMeta(userId: string, meta: SyncMeta) {
  try {
    localStorage.setItem(`${META_KEY}_${userId}`, JSON.stringify(meta));
  } catch {
    // stockage indisponible : on continue sans mémoire
  }
}

/**
 * À appeler après chaque écriture réussie vers le cloud : retient la plus récente estampille écrite
 * et, pour un envoi qui a réécrit les réglages, le jeton de synchro qu'il y a placé.
 */
export function recordCloudWrite(userId: string, stamp: string, token?: string) {
  const meta = getSyncMeta(userId);
  const next = { ...meta };
  if (!meta.stamp || stamp > meta.stamp) next.stamp = stamp;
  if (token) next.token = token;
  setSyncMeta(userId, next);
}

/** Le contenu du cloud portant ce jeton a été lu en entier et traité sur cet appareil. */
export function recordCloudToken(userId: string, token: string | null | undefined) {
  if (!token) return;
  setSyncMeta(userId, { ...getSyncMeta(userId), token });
}

/** Au-delà de ce délai sans relecture complète, on relit tout le cloud même si le jeton n'a pas bougé. */
export const FULL_READ_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Au retour sur l'app, peut-on se contenter du jeton (une lecture) au lieu de relire tout le cloud ?
 * Oui si le jeton du cloud est celui que cet appareil a écrit ou lu en dernier, et si la dernière
 * relecture complète est récente : elle rattrape les rares cas où un autre appareil a écrit juste
 * avant nous (son jeton est alors remplacé par le nôtre).
 */
export function canSkipFullRead(
  meta: SyncMeta,
  cloudToken: string | null | undefined,
  lastFullReadAt: number | null,
  now: number
): boolean {
  if (!cloudToken || !meta.token || cloudToken !== meta.token) return false;
  return lastFullReadAt !== null && now - lastFullReadAt < FULL_READ_MAX_AGE_MS;
}

/** Local et cloud sont identiques : on mémorise cet état comme référence. */
export function markSynced(userId: string, data: SyncData, cloudStamp?: string | null) {
  const meta = getSyncMeta(userId);
  const stamp = [meta.stamp, cloudStamp].filter((x): x is string => !!x).sort().pop();
  setSyncMeta(userId, { ...meta, hash: hashData(data), stamp, syncedAt: new Date().toISOString(), docs: hashDocs(data) });
}

/** Des modifications locales n'ont pas encore été envoyées au cloud. */
export function hasUnsyncedChanges(userId: string, data: SyncData): boolean {
  const meta = getSyncMeta(userId);
  return meta.hash === undefined || meta.hash !== hashData(data);
}

/**
 * Décide quoi faire en relisant le cloud :
 *  - in-sync     : rien à faire
 *  - adopt-cloud : pas de modifications locales en attente (ou première synchro) -> prendre le cloud
 *  - push-local  : modifications locales et cloud inchangé depuis la dernière synchro -> envoyer
 *  - conflict    : modifications locales ET cloud modifié ailleurs -> demander
 */
export function decideReconcile(local: SyncData, cloud: CloudSnapshot, meta: SyncMeta): ReconcileDecision {
  const localHash = hashData(local);
  if (localHash === hashData(cloudToData(cloud, local))) return 'in-sync';
  if (meta.hash === undefined) return 'adopt-cloud'; // jamais synchronisé sur cet appareil
  if (localHash === meta.hash) return 'adopt-cloud'; // rien d'en attente localement
  const cloudChanged = !!cloud.stamp && (!meta.stamp || cloud.stamp > meta.stamp);
  return cloudChanged ? 'conflict' : 'push-local';
}

// ---------- Différences (affichées dans la boîte de dialogue) ----------

export interface CollectionDiff {
  onlyLocal: number;
  onlyCloud: number;
  changed: number;
  samples: string[]; // quelques libellés pour illustrer
}

export interface DataDiff {
  courses: CollectionDiff;
  revisions: CollectionDiff;
  subjectsDiffer: boolean;
  settingsDiffer: boolean;
}

function diffCollection<T extends { id: string }>(
  local: T[],
  cloud: T[],
  label: (item: T) => string
): CollectionDiff {
  const cloudMap = new Map(cloud.map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const out: CollectionDiff = { onlyLocal: 0, onlyCloud: 0, changed: 0, samples: [] };
  const sample = (s: string) => {
    if (out.samples.length < 4) out.samples.push(s);
  };
  local.forEach((item) => {
    const other = cloudMap.get(item.id);
    if (!other) {
      out.onlyLocal++;
      sample(label(item));
    } else if (canon(item) !== canon(other)) {
      out.changed++;
      sample(label(item));
    }
  });
  cloud.forEach((item) => {
    if (!localMap.has(item.id)) {
      out.onlyCloud++;
      sample(label(item));
    }
  });
  return out;
}

export function diffData(local: SyncData, cloud: SyncData): DataDiff {
  const courseTitle = new Map([...local.courses, ...cloud.courses].map((c) => [c.id, c.title]));
  return {
    courses: diffCollection(local.courses, cloud.courses, (c) => c.title),
    revisions: diffCollection(local.revisions, cloud.revisions, (r) => `${courseTitle.get(r.courseId) ?? t('Cours')} · ${revLabel(r)}`),
    subjectsDiffer: canon([...local.subjects].sort(byId)) !== canon([...cloud.subjects].sort(byId)),
    settingsDiffer: canon(local.settings) !== canon(cloud.settings),
  };
}

// ---------- Sauvegardes de sécurité avant écrasement ----------

export interface SafetyBackup {
  at: string;
  reason: string;
  data: SyncData;
}

export function loadSafetyBackups(userId: string): SafetyBackup[] {
  try {
    const raw = localStorage.getItem(`${BACKUPS_KEY}_${userId}`);
    return raw ? (JSON.parse(raw) as SafetyBackup[]) : [];
  } catch {
    return [];
  }
}

/** Conserve les deux dernières versions écrasées, pour pouvoir revenir en arrière. */
export function saveSafetyBackup(userId: string, data: SyncData, reason: string) {
  const list = [{ at: new Date().toISOString(), reason, data }, ...loadSafetyBackups(userId)].slice(0, MAX_BACKUPS);
  try {
    localStorage.setItem(`${BACKUPS_KEY}_${userId}`, JSON.stringify(list));
  } catch {
    // quota dépassé : on garde au moins la plus récente
    try {
      localStorage.setItem(`${BACKUPS_KEY}_${userId}`, JSON.stringify(list.slice(0, 1)));
    } catch {
      console.warn('Impossible de créer la sauvegarde de sécurité (stockage plein).');
    }
  }
}
