import { useEffect, useState } from 'react';
import {
  signInWithGoogle,
  signInWithGoogleRedirect,
  loginWithEmail,
  registerWithEmail,
  checkRedirectResult,
  isSignInBlocked,
  logoutUser,
} from '../utils/firebase';
import { ToastMessage } from '../types';
import { t } from '../i18n';

export interface AuthError {
  code?: string;
  message: string;
  resolution?: string;
}

interface UseAuthActionsOptions {
  /** Affiche l'indicateur de synchro pendant une connexion (réinitialisé par le hook de synchro). */
  setIsSyncing: (v: boolean) => void;
  notify: (toast: ToastMessage) => void;
}

/**
 * Actions de connexion / déconnexion Firebase et erreur d'authentification à afficher.
 * L'utilisateur courant est suivi par useCloudSync (onAuthStateChanged).
 */
/** Compte absent de la liste d'accès de cette installation (voir functions/README.md). */
const notAllowedError = (): AuthError => ({
  code: 'medj/not-allowed',
  message: t('Ce compte n\'est pas autorisé à se connecter à cette application.'),
  resolution: t('Demandez à l\'administrateur de l\'ajouter, ou continuez sans compte : vos données restent sur cet appareil.'),
});

export function useAuthActions({ setIsSyncing, notify }: UseAuthActionsOptions) {
  const [authError, setAuthError] = useState<AuthError | null>(null);

  /** Erreur de connexion due à la liste d'accès : message dédié et toast. Faux pour toute autre erreur. */
  const reportBlocked = (err: unknown): boolean => {
    if (!isSignInBlocked(err)) return false;
    const blocked = notAllowedError();
    setAuthError(blocked);
    notify({ title: t('Compte non autorisé'), description: blocked.message, type: 'error' });
    return true;
  };

  // Check redirect login on page load (iPad / Safari fallback)
  useEffect(() => {
    checkRedirectResult()
      .then((user) => {
        if (user) {
          notify({
            title: t('Connexion Google réussie'),
            description: t('Connecté en tant que {email}.', { email: user.email ?? '' }),
            type: 'success',
          });
        }
      })
      .catch((err) => {
        console.error('Redirect result check error:', err);
        reportBlocked(err);
      });
  }, []);

  // Handler: Login with Google (Popup)
  const handleLoginGoogle = async () => {
    setAuthError(null);
    try {
      // Direct call preserves user gesture token for Safari/iPad popups
      await signInWithGoogle();
      setIsSyncing(true);
    } catch (err: any) {
      setIsSyncing(false);
      if (reportBlocked(err)) return;
      const code = err?.code || '';
      const rawMessage = err?.message || String(err);

      let friendlyMessage = rawMessage;
      let resolution = '';

      if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
        friendlyMessage = t('Le domaine « {domain} » n\'est pas encore autorisé dans Firebase Authentication.', { domain });
        resolution = t('Ouvrez la console Firebase du projet > Authentication > Paramètres > Domaines autorisés, et ajoutez « {domain} ».', { domain });
      } else if (code === 'auth/popup-blocked') {
        friendlyMessage = t('La fenêtre pop-up Google a été bloquée par Safari ou votre navigateur.');
        resolution = t('Réessayez : sur tablette, la connexion passe par une redirection, sans fenêtre pop-up.');
      } else if (code === 'auth/popup-closed-by-user') {
        friendlyMessage = t('La fenêtre de connexion a été fermée avant la validation.');
      } else if (code === 'auth/configuration-not-found') {
        friendlyMessage = t('L\'authentification n\'est pas encore initialisée dans ce projet Firebase.');
        resolution = t('Console Firebase > Authentication > Commencer (Get started), puis activez le fournisseur Google.');
      } else if (code === 'auth/operation-not-allowed') {
        friendlyMessage = t('L\'authentification Google n\'est pas encore activée dans la console Firebase.');
        resolution = t('Activez Google dans Firebase Console > Authentication > Mode de connexion (Sign-in method).');
      }

      setAuthError({
        code,
        message: friendlyMessage,
        resolution,
      });

      if (code !== 'auth/popup-closed-by-user') {
        notify({
          title: t('Connexion Google'),
          description: friendlyMessage,
          type: 'info',
        });
      }
    }
  };

  // Handler: Login with Google (Redirect fallback for iPad / blocked popups)
  const handleLoginGoogleRedirect = async () => {
    setAuthError(null);
    try {
      await signInWithGoogleRedirect();
    } catch (err: any) {
      setAuthError({
        code: err?.code,
        message: err?.message || t('Erreur lors de la redirection Google'),
      });
    }
  };

  // Handler: Email login
  const handleLoginEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      setIsSyncing(true);
      await loginWithEmail(email, pass);
      notify({
        title: t('Connexion réussie'),
        description: t('Connecté sous {email}. Synchronisation de vos cours en cours...', { email }),
        type: 'success',
      });
    } catch (err: any) {
      setIsSyncing(false);
      if (!reportBlocked(err)) {
        setAuthError({
          code: err?.code,
          message: err?.message || t('Identifiants incorrects'),
        });
      }
      throw err;
    }
  };

  // Handler: Email registration
  const handleRegisterEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      setIsSyncing(true);
      await registerWithEmail(email, pass);
      notify({
        title: t('Compte créé avec succès'),
        description: t('Compte {email} actif. Synchronisation de vos révisions...', { email }),
        type: 'success',
      });
    } catch (err: any) {
      setIsSyncing(false);
      if (!reportBlocked(err)) {
        setAuthError({
          code: err?.code,
          message: err?.message || t('Impossible de créer le compte'),
        });
      }
      throw err;
    }
  };

  // Handler: Logout
  const handleLogout = async () => {
    try {
      await logoutUser();
      notify({
        title: t('Mode local actif'),
        description: t('Vous êtes déconnecté. Vos données restent enregistrées localement sur cet appareil.'),
        type: 'info',
      });
    } catch (err) {
      console.error(err);
    }
  };

  return {
    authError,
    clearAuthError: () => setAuthError(null),
    handleLoginGoogle,
    handleLoginGoogleRedirect,
    handleLoginEmail,
    handleRegisterEmail,
    handleLogout,
  };
}
