import React from 'react';
import { AlertTriangle, Cloud, HardDrive, Loader2 } from 'lucide-react';
import { CollectionDiff, SyncData, diffData } from '../utils/cloudSync';
import { getLocale, plural, t } from '../i18n';

interface SyncConflictModalProps {
  local: SyncData;
  cloud: SyncData;
  /** Date de la dernière synchro réussie de cet appareil. */
  localSyncedAt?: string;
  /** Dernière modification du cloud par un autre appareil. */
  cloudStamp?: string | null;
  busy?: boolean;
  onKeepCloud: () => void;
  onKeepLocal: () => void;
  onDefer: () => void;
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : t('inconnue');

const DiffLine: React.FC<{ label: string; diff: CollectionDiff }> = ({ label, diff }) => {
  const parts = [
    diff.onlyLocal > 0 && t('{n} uniquement sur cet appareil', { n: diff.onlyLocal }),
    diff.onlyCloud > 0 && t('{n} uniquement dans le cloud', { n: diff.onlyCloud }),
    diff.changed > 0 && plural(diff.changed, '{n} modifié différemment', '{n} modifiés différemment'),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <li className="text-xs text-slate-700 dark:text-slate-300">
      <span className="font-bold">{label} :</span> {parts.join(' · ')}
      {diff.samples.length > 0 && (
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {t('ex.')} {diff.samples.join(', ')}
        </span>
      )}
    </li>
  );
};

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  local,
  cloud,
  localSyncedAt,
  cloudStamp,
  busy = false,
  onKeepCloud,
  onKeepLocal,
  onDefer,
}) => {
  const diff = diffData(local, cloud);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sync-conflict-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-300 dark:border-amber-700 w-full max-w-lg max-h-[92vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h2 id="sync-conflict-title" className="text-base font-bold text-slate-900 dark:text-white">
              {t('Deux versions de vos données')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('Cet appareil a des modifications non synchronisées, et le cloud a aussi été modifié depuis un autre appareil. Choisissez la version à conserver : l\'autre sera mise de côté dans une sauvegarde de sécurité.')}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-teal-600" />{' '}{t('Cet appareil')}
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {plural(local.courses.length, '{n} cours', '{n} cours')} · {plural(local.revisions.length, '{n} créneau', '{n} créneaux')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-500">{t('Dernière synchro :')} {fmt(localSyncedAt)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 mb-1">
                <Cloud className="w-3.5 h-3.5 text-sky-600" />{' '}{t('Cloud')}
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {plural(cloud.courses.length, '{n} cours', '{n} cours')} · {plural(cloud.revisions.length, '{n} créneau', '{n} créneaux')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-500">{t('Modifié le :')} {fmt(cloudStamp)}</div>
            </div>
          </div>

          <ul className="space-y-1.5">
            <DiffLine label={t('Cours')} diff={diff.courses} />
            <DiffLine label={t('Créneaux')} diff={diff.revisions} />
            {diff.subjectsDiffer && <li className="text-xs text-slate-700 dark:text-slate-300"><span className="font-bold">{t('Matières :')}</span>{' '}{t('différentes')}</li>}
            {diff.settingsDiffer && <li className="text-xs text-slate-700 dark:text-slate-300"><span className="font-bold">{t('Réglages :')}</span>{' '}{t('différents')}</li>}
          </ul>
        </div>

        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            onClick={onDefer}
            disabled={busy}
            className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
          >
            {t('Décider plus tard')}
          </button>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onKeepCloud}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {t('Garder le cloud')}
            </button>
            <button
              type="button"
              onClick={onKeepLocal}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('Écrire mon appareil sur le cloud')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
