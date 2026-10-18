import React, { useRef, useState } from 'react';
import { getLang, getLocale, t } from '../../i18n';
import { useConfirm } from '../ConfirmDialog';
import { remindersAvailable } from '../../utils/firebase';
import { ReminderSection } from './ReminderSection';
import { CalendarExportSection } from '../CalendarExportSection';
import { DriveBackupButton } from './DriveBackupButton';
import { Download, Upload, RotateCcw, X, AlertTriangle, Cloud, LogOut, LogIn, RefreshCw } from 'lucide-react';
import type { SettingsModalProps } from '../SettingsModal';

/** Formulaire de connexion par e-mail (gardé dans la fenêtre des réglages pour survivre à un changement d'onglet). */
export function useEmailLoginForm() {
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  return {
    showEmailLogin, setShowEmailLogin, emailInput, setEmailInput, passwordInput, setPasswordInput,
    emailMode, setEmailMode, emailError, setEmailError, emailLoading, setEmailLoading,
  };
}

export type EmailLoginForm = ReturnType<typeof useEmailLoginForm>;

type CloudTabProps = Pick<
  SettingsModalProps,
  | 'currentUser'
  | 'authError'
  | 'onClearAuthError'
  | 'onSyncCloudNow'
  | 'onLogout'
  | 'onLoginWithGoogle'
  | 'onLoginWithGoogleRedirect'
  | 'onLoginWithEmail'
  | 'onRegisterWithEmail'
  | 'onExportBackup'
  | 'onBuildBackup'
  | 'onImportBackup'
  | 'onClose'
  | 'courses'
  | 'revisions'
  | 'subjects'
  | 'settings'
  | 'onSaveSettings'
  | 'onRestoreSafetyBackup'
> & {
  cloudAvailable: boolean;
  isSyncing: boolean;
  safetyBackups: NonNullable<SettingsModalProps['safetyBackups']>;
  login: EmailLoginForm;
};

/** Onglet Cloud : compte et synchronisation, sauvegarde JSON, export agenda, versions mises de côté. */
export const CloudTab: React.FC<CloudTabProps> = (props) => {
  const confirm = useConfirm();
  const { cloudAvailable, currentUser, authError, onClearAuthError, onSyncCloudNow, isSyncing, onLogout, onLoginWithGoogle, onLoginWithGoogleRedirect, onLoginWithEmail, onRegisterWithEmail, onExportBackup, onBuildBackup, onImportBackup, onClose, courses, revisions, subjects, settings, onSaveSettings, safetyBackups, onRestoreSafetyBackup } = props;
  const { showEmailLogin, setShowEmailLogin, emailInput, setEmailInput, passwordInput, setPasswordInput, emailMode, setEmailMode, emailError, setEmailError, emailLoading, setEmailLoading } = props.login;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Vide le champ pour pouvoir choisir à nouveau le même fichier après une annulation
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content && (await onImportBackup(content))) onClose();
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* Cloud Firebase Firestore Sync Section */}
      {!cloudAvailable ? (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">{t('Cloud non configuré')}</span>
          </div>
          <p className="text-[0.6875rem] text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('Cette installation fonctionne en local : vos données restent dans ce navigateur. Pour les synchroniser entre vos appareils, branchez votre propre projet Firebase en suivant')}{' '}
            <code className="font-mono text-[0.625rem]">docs/CLOUD_SETUP.md</code>{t('. En attendant, la sauvegarde JSON ci-dessous permet de transférer vos données.')}
          </p>
        </div>
      ) : (
        <>
      <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-teal-600 text-white shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                {t('Synchronisation Cloud')}
              </span>
              <span className="text-[0.6875rem] text-teal-700 dark:text-teal-400 font-medium">
                {t('Retrouvez vos cours sur tous vos appareils')}
              </span>
            </div>
          </div>

          {currentUser ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('Connecté au Cloud')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
              <span>{t('Local uniquement')}</span>
            </span>
          )}
        </div>

        {/* Erreur de connexion : message simple, détails techniques repliés */}
        {authError && (
          <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="text-xs font-bold">{t('Connexion impossible, réessayez.')}</span>
              </div>
              {onClearAuthError && (
                <button
                  aria-label={t('Masquer l\'erreur')}
                  type="button"
                  onClick={onClearAuthError}
                  className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <details className="text-[0.6875rem] text-rose-700 dark:text-rose-300">
              <summary className="cursor-pointer font-semibold">{t('Détails')}</summary>
              <p className="mt-1 leading-relaxed">
                {authError.code ? `${authError.code} : ` : ''}
                {authError.message}
              </p>
              {authError.resolution && <p className="mt-1 leading-relaxed">{authError.resolution}</p>}
              <p className="mt-1">
                {t('Domaine :')}{' '}<span className="font-mono select-all">{window.location.hostname}</span>
              </p>
            </details>
          </div>
        )}

        {currentUser ? (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-teal-200 dark:border-teal-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {currentUser.isAnonymous
                    ? t('Session temporaire (non liée à un compte)')
                    : t('Compte : {name}', { name: currentUser.email || currentUser.displayName || t('Utilisateur Cloud') })}
                </span>
              </div>
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {currentUser.isAnonymous
                  ? t('Cette session n\'existe que sur cet appareil. Déconnectez-vous puis connectez-vous avec Google pour synchroniser vos appareils.')
                  : t('Synchronisation automatique en temps réel active avec votre compte.')}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onSyncCloudNow && (
                <button
                  type="button"
                  onClick={onSyncCloudNow}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-300 dark:border-teal-700 rounded-xl transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? t('Synchronisation...') : t('Synchroniser')}</span>
                </button>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t('Déconnexion')}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-teal-100 dark:border-teal-900 space-y-3 shadow-2xs">
            <p className="text-[0.6875rem] text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('Connectez-vous pour retrouver vos cours sur tous vos appareils. Sans connexion, tout reste sur cet appareil.')}
            </p>

            {(onLoginWithGoogle || onLoginWithGoogleRedirect) && (
              <button
                type="button"
                onClick={() => {
                  // Sur tablette / app installée, la fenêtre pop-up est souvent bloquée : on passe par la redirection
                  const useRedirect =
                    !onLoginWithGoogle ||
                    (!!onLoginWithGoogleRedirect &&
                      (window.matchMedia('(pointer: coarse)').matches ||
                        window.matchMedia('(display-mode: standalone)').matches));
                  (useRedirect ? onLoginWithGoogleRedirect : onLoginWithGoogle)?.();
                }}
                className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>{t('Continuer avec Google')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowEmailLogin((v) => !v)}
              aria-expanded={showEmailLogin}
              className="text-[0.6875rem] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
            >
              {showEmailLogin ? t('Masquer') : t('Utiliser un e-mail à la place')}
            </button>

            {showEmailLogin && (
              <div className="space-y-2 pt-1">
                <input
                  type="email"
                  aria-label={t('Adresse e-mail')}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t('Adresse e-mail')}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="password"
                  aria-label={t('Mot de passe')}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={t('Mot de passe (6 caractères min.)')}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                />

                {emailError && (
                  <p className="text-[0.6875rem] text-rose-600 dark:text-rose-400 font-medium">{emailError}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={emailLoading || !emailInput.trim() || passwordInput.length < 6}
                    onClick={async () => {
                      setEmailError(null);
                      setEmailLoading(true);
                      try {
                        if (emailMode === 'login' && onLoginWithEmail) {
                          await onLoginWithEmail(emailInput, passwordInput);
                        } else if (emailMode === 'register' && onRegisterWithEmail) {
                          await onRegisterWithEmail(emailInput, passwordInput);
                        }
                      } catch (err: any) {
                        setEmailError(err?.message || t('Connexion impossible, réessayez.'));
                      } finally {
                        setEmailLoading(false);
                      }
                    }}
                    className="flex-1 py-2 px-3 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
                  >
                    {emailLoading ? t('Chargement...') : emailMode === 'login' ? t('Se connecter') : t('Créer le compte')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailError(null);
                      setEmailMode(emailMode === 'login' ? 'register' : 'login');
                    }}
                    className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline px-2"
                  >
                    {emailMode === 'login' ? t('Créer un compte ?') : t('Déjà un compte ?')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
          {/* Rappel du matin : par appareil, une fois la Cloud Function déployée (remindersEnabled dans la config) */}
          {currentUser?.uid && remindersAvailable && (
            <ReminderSection uid={currentUser.uid} lang={(settings.language ?? getLang()) === 'en' ? 'en' : 'fr'} />
          )}
        </>
      )}

      {/* Backup JSON */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Download className="w-4 h-4 text-teal-600" />
            <span>{t('Sauvegarde de secours JSON (Fichier local)')}</span>
          </span>
          <span className="text-[0.625rem] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 font-medium">
            {t('Sécurité 100% Hors-Ligne')}
          </span>
        </div>
        <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
          {t('Même avec le Cloud actif, vous pouvez exporter ou importer à tout moment un fichier JSON complet de votre base de révision.')}
        </p>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button
            type="button"
            onClick={onExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-teal-600" />
            <span>{t('Exporter sauvegarde JSON')}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-teal-600" />
            <span>{t('Importer un fichier JSON')}</span>
          </button>
          {currentUser && !currentUser.isAnonymous && (
            <DriveBackupButton email={currentUser.email} buildBackup={onBuildBackup} settings={settings} onSaveSettings={onSaveSettings} />
          )}
          {/* Bouton désactivé. Pour le réactiver, reprendre `onResetSeedData` dans les props déstructurées.
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ title: t('Réinitialiser toutes les données avec les cours d’exemple ?'), tone: 'danger' })) {
                onResetSeedData();
                onClose();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('Réinitialiser les exemples')}</span>
          </button>
          */}
        </div>
      </div>

      {/* Export des créneaux vers un agenda externe */}
      <CalendarExportSection courses={courses} revisions={revisions} subjects={subjects} settings={settings} onSaveSettings={onSaveSettings} />

      {/* Sauvegardes de sécurité créées avant un écrasement local/cloud */}
      {safetyBackups.length > 0 && onRestoreSafetyBackup && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 space-y-2">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <span>{t('Versions mises de côté (annuler un écrasement)')}</span>
          </span>
          <p className="text-[0.6875rem] text-slate-600 dark:text-slate-400">
            {t('Avant de remplacer vos données par celles du cloud (ou l\'inverse), la version écrasée est conservée ici.')}
          </p>
          <ul className="space-y-1.5">
            {safetyBackups.map((b, i) => (
              <li key={b.at} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">{t(b.reason)}</span>
                  <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                    {new Date(b.at).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{t('{courses} cours · {slots} créneaux', { courses: b.courses, slots: b.revisions })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: t('Restaurer cette version ?'),
                      message: t('Vos données actuelles seront à leur tour mises de côté.'),
                      confirmLabel: t('Restaurer'),
                    });
                    if (ok) onRestoreSafetyBackup(i);
                  }}
                  className="shrink-0 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  {t('Restaurer')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
