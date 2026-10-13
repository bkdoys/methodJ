// Détection de ce que l'appareil permet pour le rappel du matin (pur, testé ; sans Firebase).

/** Ce que l'appareil permet : `install-ios` = iPad / iPhone hors de l'app installée sur l'écran d'accueil. */
export type ReminderSupport = 'ok' | 'install-ios' | 'unsupported' | 'denied';

export interface ReminderEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Ouverte depuis l'écran d'accueil (app installée). */
  standalone: boolean;
  hasNotification: boolean;
  hasPush: boolean;
  hasServiceWorker: boolean;
  permission?: string;
}

/** iPad récent : se présente comme un Mac, mais tactile. */
const isAppleMobile = (env: ReminderEnv) =>
  /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);

export function reminderSupport(env: ReminderEnv): ReminderSupport {
  // Sur iPadOS / iOS, les notifications web n'existent que dans l'app ajoutée à l'écran d'accueil (16.4 et plus)
  if (isAppleMobile(env) && !env.standalone) return 'install-ios';
  if (!env.hasNotification || !env.hasPush || !env.hasServiceWorker) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ok';
}

export function currentReminderEnv(): ReminderEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    hasNotification: 'Notification' in window,
    hasPush: 'PushManager' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    permission: 'Notification' in window ? Notification.permission : undefined,
  };
}
