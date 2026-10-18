import React, { useEffect, useState } from 'react';
import { HardDriveUpload, LoaderCircle } from 'lucide-react';
import { getLocale, t } from '../../i18n';
import { googleClientId } from '../../utils/firebase';
import { loadGoogleIdentity } from '../../utils/googleIdentity';
import { DRIVE_FOLDER_NAME, describeDriveError, requestDriveToken, uploadBackupToDrive } from '../../utils/googleDrive';
import type { AppSettings } from '../../types';

interface Props {
  /** E-mail du compte connecté : Google propose directement ce compte. */
  email?: string | null;
  buildBackup: () => { json: string; fileName: string };
  settings: AppSettings;
  onSaveSettings: (s: AppSettings) => void;
}

/** « Sauvegarder sur Drive » : envoie l'export JSON dans un dossier de l'application sur le Google Drive (un fichier par jour). */
export const DriveBackupButton: React.FC<Props> = ({ email, buildBackup, settings, onSaveSettings }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Le script d'autorisation Google est chargé d'avance : la fenêtre doit s'ouvrir directement au clic
  useEffect(() => {
    if (googleClientId) loadGoogleIdentity().catch(() => undefined);
  }, []);

  if (!googleClientId) return null;

  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    // Appelé tout de suite (avant tout await) pour que le navigateur accepte d'ouvrir la fenêtre Google
    const tokenPromise = requestDriveToken(googleClientId, email ?? undefined);
    (async () => {
      try {
        const token = await tokenPromise;
        const { json, fileName } = buildBackup();
        const result = await uploadBackupToDrive({ token, folderId: settings.googleDriveFolderId, fileName, json });
        onSaveSettings({ ...settings, googleDriveFolderId: result.folderId, googleDriveSavedAt: new Date().toISOString() });
        setMessage({
          type: 'ok',
          text: result.replaced
            ? t('Sauvegarde du jour mise à jour dans Drive › {folder} › {file}.', { folder: DRIVE_FOLDER_NAME, file: fileName })
            : t('Sauvegardé dans Drive › {folder} › {file}.', { folder: DRIVE_FOLDER_NAME, file: fileName }),
        });
      } catch (err) {
        setMessage({ type: 'error', text: describeDriveError(err) });
      } finally {
        setBusy(false);
      }
    })();
  };

  const lastSaved = settings.googleDriveSavedAt ? new Date(settings.googleDriveSavedAt) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs disabled:opacity-60"
      >
        {busy ? <LoaderCircle className="w-3.5 h-3.5 text-teal-600 animate-spin" /> : <HardDriveUpload className="w-3.5 h-3.5 text-teal-600" />}
        <span>{busy ? t('Envoi vers Drive…') : t('Sauvegarder sur Drive')}</span>
      </button>
      {(message || lastSaved) && (
        <p
          className={`basis-full text-[11px] ${
            message?.type === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
          }`}
          role={message ? 'status' : undefined}
        >
          {message
            ? message.text
            : t('Dernière sauvegarde sur Drive : {date}', {
                date: lastSaved!.toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
              })}
        </p>
      )}
    </>
  );
};
