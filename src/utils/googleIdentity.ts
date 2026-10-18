import { t } from '../i18n';

// Google Identity Services : jeton d'accès valable une heure, demandé à la demande depuis un clic.
// Partagé par l'envoi vers Google Agenda et la sauvegarde sur Google Drive (un droit étroit par usage).

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface GisWindow {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: {
          client_id: string;
          scope: string;
          login_hint?: string;
          callback: (r: TokenResponse) => void;
          error_callback: (e: { type?: string }) => void;
        }) => { requestAccessToken: (o?: { prompt?: string }) => void };
      };
    };
  };
}

let gisLoading: Promise<void> | null = null;

/** Charge le script Google une seule fois. À appeler tôt : la fenêtre d'autorisation doit s'ouvrir juste après le clic. */
export function loadGoogleIdentity(): Promise<void> {
  if ((window as GisWindow).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisLoading = null;
        reject(new Error(t('Impossible de charger le service d\'autorisation Google.')));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

/**
 * Ouvre la fenêtre d'autorisation Google pour un droit donné. À appeler directement depuis un clic
 * (sinon le navigateur la bloque). `loginHint` (e-mail) propose directement ce compte Google.
 */
export function requestGoogleToken(clientId: string, scope: string, loginHint?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as GisWindow).google;
    if (!g?.accounts?.oauth2) {
      reject(new Error(t('Le service d\'autorisation Google n\'est pas encore chargé : réessayez dans un instant.')));
      return;
    }
    g.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope,
        ...(loginHint ? { login_hint: loginHint } : {}),
        callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error || 'token'))),
        error_callback: (e) =>
          reject(new Error(e.type === 'popup_closed' ? t('Autorisation annulée.') : t('Autorisation refusée ou fenêtre bloquée par le navigateur.'))),
      })
      .requestAccessToken();
  });
}
