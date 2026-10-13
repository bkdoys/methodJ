import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { app, db, pushVapidKey } from './firebase';

export { currentReminderEnv, reminderSupport } from './reminderSupport';
export type { ReminderEnv, ReminderSupport } from './reminderSupport';

// Rappel du matin : abonnement de CET appareil (`users/<uid>/devices/<deviceId>`). L'envoi est fait chaque matin
// par la Cloud Function `morningReminder` ; le service worker (public/sw.js) affiche la notification.

const DEVICE_KEY = 'medj_device_id_v1';

/** Identifiant stable de cet appareil (un document d'abonnement par appareil). */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{1,128}$/.test(existing)) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'unknown-device';
  }
}

const deviceRef = (uid: string) => doc(db, 'users', uid, 'devices', getDeviceId());

/** Heure du rappel de cet appareil, ou null s'il n'est pas abonné. */
export async function loadReminderTime(uid: string): Promise<string | null> {
  const snap = await getDoc(deviceRef(uid));
  const time = snap.exists() ? snap.data().time : null;
  return typeof time === 'string' ? time : null;
}

export class ReminderError extends Error {
  constructor(public reason: 'denied' | 'unsupported') {
    super(reason);
  }
}

/**
 * Abonne cet appareil (ou change l'heure). À appeler directement depuis un clic : Safari n'accepte la demande
 * de permission que pendant un geste de l'utilisateur, d'où l'appel à `requestPermission` avant tout `await`.
 */
export async function enableReminder(uid: string, time: string, lang: 'fr' | 'en'): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new ReminderError('denied');
  // Cloud Messaging n'est chargé qu'ici : il ne pèse pas sur le démarrage de l'application
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw new ReminderError('unsupported');
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: pushVapidKey, serviceWorkerRegistration: registration });
  await setDoc(deviceRef(uid), {
    userId: uid,
    token,
    time,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    lang,
    updatedAt: new Date().toISOString(),
  });
}

/** Désabonne cet appareil (le document puis, si possible, le jeton Cloud Messaging). */
export async function disableReminder(uid: string): Promise<void> {
  await deleteDoc(deviceRef(uid));
  try {
    const { deleteToken, getMessaging } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch {
    // Sans jeton (ou hors ligne) : le document supprimé suffit, plus rien n'est envoyé
  }
}
