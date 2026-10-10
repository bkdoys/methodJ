import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { t } from '../i18n';

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
}

export type ReconcileDecision = 'in-sync' | 'adopt-cloud' | 'push-local' | 'conflict';

const META_KEY = 'medj_cloud_meta_v1';
const BACKUPS_KEY = 'medj_safety_backups_v1';
const MAX_BACKUPS = 2;

// Champs techniques ajoutés par la synchro : ignorés dans les comparaisons.
const IGNORED_KEYS = new Set(['userId', 'updatedAt']);

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

/** Empreinte stable des données (indépendante de l'ordre des tableaux et des clés). */
export function hashData(d: SyncData): string {
  const s = canon({
    courses: [...d.courses].sort(byId),
    revisions: [...d.revisions].sort(byId),
    subjects: [...d.subjects].sort(byId),
    settings: d.settings,
  });
  // FNV-1a 32 bits ; suffisant pour détecter un changement
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${s.length}`;
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

/** À appeler après chaque écriture réussie vers le cloud : retient la plus récente estampille écrite. */
export function recordCloudWrite(userId: string, stamp: string) {
  const meta = getSyncMeta(userId);
  if (!meta.stamp || stamp > meta.stamp) setSyncMeta(userId, { ...meta, stamp });
}

/** Local et cloud sont identiques : on mémorise cet état comme référence. */
export function markSynced(userId: string, data: SyncData, cloudStamp?: string | null) {
  const meta = getSyncMeta(userId);
  const stamp = [meta.stamp, cloudStamp].filter((x): x is string => !!x).sort().pop();
  setSyncMeta(userId, { hash: hashData(data), stamp, syncedAt: new Date().toISOString() });
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
    revisions: diffCollection(local.revisions, cloud.revisions, (r) => `${courseTitle.get(r.courseId) ?? t('Cours')} · J${r.jIndex}`),
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
