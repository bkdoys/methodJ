import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User,
} from 'firebase/auth';
import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  getDocFromServer,
  writeBatch,
  WriteBatch,
  initializeFirestore,
  deleteDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { AppSettings, Course, Deck, RevisionItem, Subject } from '../types';
import { mergeDecks, normalizeDeck } from './flashcards';
import { mergeLogDays, parseEntries, ReviewLogDay } from './reviewLog';
import { CloudSnapshot, recordCloudWrite, SyncData } from './cloudSync';
import { t } from '../i18n';

interface FirebaseWebConfig {
  apiKey?: string;
  projectId?: string;
  appId?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
  /** ID client OAuth (Web) pour l'envoi vers Google Agenda ; facultatif, public comme le reste de ce fichier. */
  googleClientId?: string;
  /** Vrai une fois la Cloud Function `morningReminder` déployée : le réglage « Rappel du matin » apparaît. */
  remindersEnabled?: boolean;
  /** Clé publique Web Push (Console Firebase > Cloud Messaging) ; facultative, la clé par défaut de Firebase sinon. */
  vapidKey?: string;
}

// La config Firebase est un fichier facultatif (firebase-applet-config.json, voir docs/CLOUD_SETUP.md) :
// sans lui l'app fonctionne entièrement en local, sans compte ni synchronisation.
const configModules = import.meta.glob('../../firebase-applet-config.json', {
  eager: true,
  import: 'default',
}) as Record<string, FirebaseWebConfig>;
const loadedConfig: FirebaseWebConfig | undefined = Object.values(configModules)[0];

/** Vide = l'envoi direct vers Google Agenda n'est pas proposé (l'export .ics reste disponible). */
export const googleClientId = loadedConfig?.googleClientId?.trim() || '';

export const isCloudConfigured = !!loadedConfig?.apiKey && !!loadedConfig?.projectId;

/** Rappel du matin proposé : Cloud configuré, fonction déployée et expéditeur Cloud Messaging connu. */
export const remindersAvailable =
  isCloudConfigured && loadedConfig?.remindersEnabled === true && !!loadedConfig?.messagingSenderId;
export const pushVapidKey = loadedConfig?.vapidKey?.trim() || undefined;

/** Images des cartes dans Firebase Storage : Cloud configuré et bucket connu (sinon elles restent sur l'appareil). */
export const mediaCloudAvailable = isCloudConfigured && !!loadedConfig?.storageBucket;

// Sans config, un projet factice permet de créer `auth` et `db` (ils ne contactent rien tant qu'on ne les utilise
// pas, et plus rien ne les utilise : tout passe par `isCloudConfigured`).
const firebaseConfig: FirebaseWebConfig = isCloudConfigured
  ? loadedConfig!
  : { apiKey: 'not-configured', projectId: 'medj-local', appId: 'not-configured' };

/** Erreur quand on tente de se connecter sans config. */
const assertCloudConfigured = () => {
  if (!isCloudConfigured) {
    throw new Error(t('Le Cloud n\'est pas configuré : voir docs/CLOUD_SETUP.md. L\'application fonctionne en local.'));
  }
};

// Initialize Firebase
// Safari (iPad) bloque le stockage entre domaines : la connexion Google par redirection échoue silencieusement
// si `authDomain` n'est pas celui de l'app. Sur Firebase Hosting, on prend donc le domaine courant
// (Hosting y sert lui-même /__/auth/handler) ; ailleurs (localhost…), la valeur du fichier de config.
const isHostingDomain =
  typeof window !== 'undefined' && /\.(web\.app|firebaseapp\.com)$/.test(window.location.hostname);
export const app = initializeApp({
  ...firebaseConfig,
  authDomain: isHostingDomain ? window.location.hostname : firebaseConfig.authDomain,
});

//export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const db = initializeFirestore(
  app,
  { ignoreUndefinedProperties: true },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  if (import.meta.env.DEV) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', errInfo.error, errInfo.operationType, errInfo.path);
  }
  throw new Error(errInfo.error);
}

// Test connection on boot as mandated by the skill
async function testConnection() {
  if (!isCloudConfigured) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline, using local cache.');
    }
  }
}
testConnection();

// Sign in with Google Popup
export async function signInWithGoogle(): Promise<User> {
  assertCloudConfigured();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    console.error('Google sign-in error:', err);
    throw err;
  }
}

// Email & Password login (no popup needed, multi-device friendly)
export async function loginWithEmail(email: string, pass: string): Promise<User> {
  assertCloudConfigured();
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return result.user;
  } catch (err) {
    console.error('Email sign-in error:', err);
    throw err;
  }
}

// Email & Password registration
export async function registerWithEmail(email: string, pass: string): Promise<User> {
  assertCloudConfigured();
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    return result.user;
  } catch (err) {
    console.error('Email register error:', err);
    throw err;
  }
}

// Fallback: Sign in with Redirect (useful for iPad Safari when popups are blocked)
export async function signInWithGoogleRedirect(): Promise<void> {
  assertCloudConfigured();
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    console.error('Google redirect sign-in error:', err);
    throw err;
  }
}

// Check redirect login on page reload
export async function checkRedirectResult(): Promise<User | null> {
  if (!isCloudConfigured) return null;
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err) {
    console.error('Redirect result error:', err);
    return null;
  }
}

// Sign out
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign-out error:', err);
    throw err;
  }
}

/**
 * Commits a sequence of Firestore operations in chunks of at most batchSize (default: 400).
 * Prevents Firestore's "maximum of 500 writes allowed per batch" error.
 */
export async function commitBatchOperations(
  ops: ((batch: WriteBatch) => void)[],
  batchSize: number = 400
): Promise<void> {
  for (let i = 0; i < ops.length; i += batchSize) {
    const chunk = ops.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const op of chunk) {
      op(batch);
    }
    await batch.commit();
  }
}

export async function syncLocalDataToCloud(
  userId: string,
  courses: Course[],
  revisions: RevisionItem[],
  subjects: Subject[],
  settings: AppSettings
): Promise<string> {
  const ops: ((batch: WriteBatch) => void)[] = [];
  const now = new Date().toISOString();
  // Nouveau jeton à chaque envoi : les autres appareils le comparent au leur pour savoir s'il faut tout relire
  const token = newSyncToken();

  // Settings
  const settingsRef = doc(db, 'users', userId, 'settings', 'config');
  ops.push((batch) => {
    batch.set(settingsRef, {
      ...settings,
      userId,
      updatedAt: now,
      syncToken: token,
    });
  });

  // Subjects
  subjects.forEach((sub) => {
    const subRef = doc(db, 'users', userId, 'subjects', sub.id);
    ops.push((batch) => {
      batch.set(subRef, {
        ...sub,
        userId,
      });
    });
  });

  // Courses
  courses.forEach((c) => {
    const courseRef = doc(db, 'users', userId, 'courses', c.id);
    ops.push((batch) => {
      batch.set(courseRef, {
        ...c,
        userId,
        updatedAt: now,
      });
    });
  });

  // Revisions
  revisions.forEach((rev) => {
    const revRef = doc(db, 'users', userId, 'revisions', rev.id);
    ops.push((batch) => {
      batch.set(revRef, {
        ...rev,
        userId,
        updatedAt: now,
      });
    });
  });

  try {
    await commitBatchOperations(ops, 400);
    recordCloudWrite(userId, now, token);
    return now;
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

/**
 * Remplace le contenu du cloud par les données locales : écrit tout, puis supprime
 * les documents du cloud qui n'existent plus en local (évite les cours « fantômes »).
 * Retourne l'estampille écrite.
 */
export async function mirrorLocalToCloud(userId: string, data: SyncData): Promise<string> {
  try {
    const stamp = await syncLocalDataToCloud(userId, data.courses, data.revisions, data.subjects, data.settings);
    const keep: Record<string, Set<string>> = {
      courses: new Set(data.courses.map((c) => c.id)),
      revisions: new Set(data.revisions.map((r) => r.id)),
      subjects: new Set(data.subjects.map((s) => s.id)),
    };
    const ops: ((batch: WriteBatch) => void)[] = [];
    for (const name of Object.keys(keep)) {
      const snap = await getDocs(collection(db, 'users', userId, name));
      snap.docs.forEach((d) => {
        if (!keep[name].has(d.id)) ops.push((batch) => batch.delete(d.ref));
      });
    }
    await commitBatchOperations(ops, 400);
    return stamp;
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

// Targeted sync for a single revision
export async function syncRevisionToCloud(userId: string, rev: RevisionItem): Promise<void> {
  try {
    const revRef = doc(db, 'users', userId, 'revisions', rev.id);
    const stamp = new Date().toISOString();
    await setDoc(revRef, {
      ...rev,
      userId,
      updatedAt: stamp,
    });
    recordCloudWrite(userId, stamp);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/revisions/${rev.id}`);
  }
}

// Targeted sync for a list of revisions (e.g. cascade shifts)
export async function syncRevisionsBatchToCloud(userId: string, revs: RevisionItem[]): Promise<void> {
  if (revs.length === 0) return;
  const now = new Date().toISOString();
  const ops: ((batch: WriteBatch) => void)[] = revs.map((rev) => (batch) => {
    const revRef = doc(db, 'users', userId, 'revisions', rev.id);
    batch.set(revRef, {
      ...rev,
      userId,
      updatedAt: now,
    });
  });

  try {
    await commitBatchOperations(ops, 400);
    recordCloudWrite(userId, now);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/revisions`);
  }
}

// Targeted sync for a course
export async function syncCourseToCloud(userId: string, course: Course): Promise<void> {
  try {
    const courseRef = doc(db, 'users', userId, 'courses', course.id);
    const stamp = new Date().toISOString();
    await setDoc(courseRef, {
      ...course,
      userId,
      updatedAt: stamp,
    });
    recordCloudWrite(userId, stamp);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/courses/${course.id}`);
  }
}

export async function deleteCourseFromCloud(
  userId: string,
  courseId: string,
  revisionIds: string[]
): Promise<void> {
  const ops: ((batch: WriteBatch) => void)[] = [
    (batch) => batch.delete(doc(db, 'users', userId, 'courses', courseId)),
  ];
  revisionIds.forEach((id) => {
    ops.push((batch) => batch.delete(doc(db, 'users', userId, 'revisions', id)));
  });
  try {
    await commitBatchOperations(ops, 400);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/courses/${courseId}`);
  }
}

export async function deleteSubjectsFromCloud(
  userId: string,
  subjectIds: string[]
): Promise<void> {
  if (subjectIds.length === 0) return;
  const ops: ((batch: WriteBatch) => void)[] = subjectIds.map((id) => (batch) =>
    batch.delete(doc(db, 'users', userId, 'subjects', id))
  );
  try {
    await commitBatchOperations(ops, 400);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/subjects`);
  }
}

function isValidCourse(d: unknown): d is Course {
  const o = d as Record<string, unknown>;
  return !!o && typeof o.id === 'string' && typeof o.title === 'string' && typeof o.j0Date === 'string'
    && typeof o.subjectId === 'string' && Array.isArray(o.activeJList);
}

function isValidRevision(d: unknown): d is RevisionItem {
  const o = d as Record<string, unknown>;
  return !!o && typeof o.id === 'string' && typeof o.courseId === 'string'
    && typeof o.jIndex === 'number' && typeof o.completed === 'boolean';
}

function isValidSubject(d: unknown): d is Subject {
  const o = d as Record<string, unknown>;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.color === 'string';
}

// ---------------------------------------------------------------------------
// Paquets de cartes : `users/{uid}/decks/{courseId}`, hors de la synchro principale (lus seulement quand ils ont
// changé, grâce à l'horodatage serveur `syncedAt`)

function toDeck(id: string, d: Record<string, unknown>): Deck | null {
  if (!Array.isArray(d.cards) || typeof d.review !== 'object' || d.review === null) return null;
  return { id, cards: d.cards as Deck['cards'], review: d.review as Deck['review'] };
}

/** Paquets modifiés après `sinceMillis` (0 = tous), et le plus récent horodatage serveur vu. */
export async function fetchDecksSince(
  userId: string,
  sinceMillis: number
): Promise<{ decks: Deck[]; latest: number }> {
  try {
    const col = collection(db, 'users', userId, 'decks');
    const snap = await getDocs(sinceMillis > 0 ? query(col, where('syncedAt', '>', Timestamp.fromMillis(sinceMillis))) : col);
    let latest = sinceMillis;
    const decks: Deck[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const deck = toDeck(d.id, data);
      if (deck) decks.push(deck);
      const at = data.syncedAt;
      if (at instanceof Timestamp) latest = Math.max(latest, at.toMillis());
    });
    return { decks, latest };
  } catch (error) {
    return handleFirestoreError(error, OperationType.LIST, `users/${userId}/decks`);
  }
}

/**
 * Envoie un paquet en le fusionnant avec la version du cloud dans une transaction : une modification faite entre-temps
 * sur un autre appareil n'est jamais écrasée. Renvoie le paquet fusionné, à garder sur l'appareil.
 */
export async function pushDeckToCloud(userId: string, deck: Deck): Promise<Deck> {
  const ref = doc(db, 'users', userId, 'decks', deck.id);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? toDeck(deck.id, snap.data()) : null;
      const merged = normalizeDeck(remote ? mergeDecks(deck, remote) : deck, new Date().toISOString());
      tx.set(ref, { id: deck.id, userId, cards: merged.cards, review: merged.review, syncedAt: serverTimestamp() });
      return merged;
    });
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `users/${userId}/decks/${deck.id}`);
  }
}

export async function deleteDeckFromCloud(userId: string, courseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', userId, 'decks', courseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/decks/${courseId}`);
  }
}

// ---------------------------------------------------------------------------
// Journal des notes de cartes : `users/{uid}/cardLogs/{jour}`, un document par jour local, lu seulement quand il a
// changé (horodatage serveur `syncedAt`), fusionné par union à l'envoi

function toLogDay(id: string, d: Record<string, unknown>): ReviewLogDay | null {
  const entries = parseEntries(d.entries);
  return entries.length > 0 ? { id, entries } : null;
}

/** Jours modifiés après `sinceMillis` (0 = tous), et le plus récent horodatage serveur vu. */
export async function fetchLogDaysSince(
  userId: string,
  sinceMillis: number
): Promise<{ days: ReviewLogDay[]; latest: number }> {
  try {
    const col = collection(db, 'users', userId, 'cardLogs');
    const snap = await getDocs(sinceMillis > 0 ? query(col, where('syncedAt', '>', Timestamp.fromMillis(sinceMillis))) : col);
    let latest = sinceMillis;
    const days: ReviewLogDay[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const day = toLogDay(d.id, data);
      if (day) days.push(day);
      const at = data.syncedAt;
      if (at instanceof Timestamp) latest = Math.max(latest, at.toMillis());
    });
    return { days, latest };
  } catch (error) {
    return handleFirestoreError(error, OperationType.LIST, `users/${userId}/cardLogs`);
  }
}

/** Envoie un jour en l'unissant à la version du cloud (transaction) ; renvoie le jour fusionné. */
export async function pushLogDayToCloud(userId: string, day: ReviewLogDay): Promise<ReviewLogDay> {
  const ref = doc(db, 'users', userId, 'cardLogs', day.id);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? toLogDay(day.id, snap.data()) : null;
      const merged = remote ? mergeLogDays(day, remote) : day;
      tx.set(ref, { id: day.id, userId, entries: merged.entries, syncedAt: serverTimestamp() });
      return merged;
    });
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `users/${userId}/cardLogs/${day.id}`);
  }
}

function newSyncToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Jeton de synchro du cloud : une seule lecture (le document des réglages). Null si absent. */
export async function fetchCloudSyncToken(userId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
    const token = snap.exists() ? snap.data().syncToken : null;
    return typeof token === 'string' ? token : null;
  } catch (error) {
    return handleFirestoreError(error, OperationType.GET, `users/${userId}/settings/config`);
  }
}

export async function fetchCloudData(userId: string): Promise<CloudSnapshot | null> {
  try {
    const [coursesSnap, revisionsSnap, subjectsSnap, settingsSnap] = await Promise.all([
      getDocs(collection(db, 'users', userId, 'courses')),
      getDocs(collection(db, 'users', userId, 'revisions')),
      getDocs(collection(db, 'users', userId, 'subjects')),
      getDocs(collection(db, 'users', userId, 'settings')),
    ]);

    // Estampille la plus récente écrite par n'importe quel appareil
    let stamp: string | null = null;
    [coursesSnap, revisionsSnap, settingsSnap].forEach((snap) =>
      snap.docs.forEach((d) => {
        const u = d.data().updatedAt;
        if (typeof u === 'string' && (!stamp || u > stamp)) stamp = u;
      })
    );

    const courses = coursesSnap.docs
      .map((d) => d.data())
      .filter(isValidCourse);
    const revisions = revisionsSnap.docs
      .map((d) => d.data())
      .filter(isValidRevision);
    const subjects = subjectsSnap.docs
      .map((d) => d.data())
      .filter(isValidSubject);
    let settings: AppSettings | null = null;
    let token: string | null = null;
    if (!settingsSnap.empty) {
      // Le jeton de synchro est technique : il ne fait pas partie des réglages de l'application
      const { syncToken, ...rest } = settingsSnap.docs[0].data();
      settings = rest as AppSettings;
      token = typeof syncToken === 'string' ? syncToken : null;
    }

    return { courses, revisions, subjects, settings, stamp, token };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
}
