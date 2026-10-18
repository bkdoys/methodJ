import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { t } from '../../i18n';
import { TimeSelect } from '../TimeSelect';
import {
  ReminderError,
  currentReminderEnv,
  disableReminder,
  enableReminder,
  loadReminderTime,
  reminderSupport,
} from '../../utils/reminders';

interface ReminderSectionProps {
  uid: string;
  lang: 'fr' | 'en';
}

const DEFAULT_TIME = '07:30';

/** Réglage « Rappel du matin » de cet appareil (onglet Cloud). */
export const ReminderSection: React.FC<ReminderSectionProps> = ({ uid, lang }) => {
  const [support, setSupport] = useState(() => reminderSupport(currentReminderEnv()));
  // undefined = en cours de lecture ; null = pas abonné
  const [subscribedTime, setSubscribedTime] = useState<string | null | undefined>(undefined);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'ok') return;
    let cancelled = false;
    loadReminderTime(uid)
      .then((saved) => {
        if (cancelled) return;
        setSubscribedTime(saved);
        if (saved) setTime(saved);
      })
      .catch(() => !cancelled && setSubscribedTime(null));
    return () => {
      cancelled = true;
    };
  }, [uid, support]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ReminderError) {
        setSupport(err.reason);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  // Pas d'await avant enableReminder : la demande de permission doit partir pendant le clic
  const subscribe = (at: string) =>
    run(async () => {
      await enableReminder(uid, at, lang);
      setSubscribedTime(at);
    });
  const unsubscribe = () =>
    run(async () => {
      await disableReminder(uid);
      setSubscribedTime(null);
    });

  const note = (text: string) => <p className="text-[0.6875rem] text-slate-600 dark:text-slate-400 leading-relaxed">{text}</p>;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
        <Bell className="w-4 h-4 text-teal-600" />
        <span>{t('Rappel du matin')}</span>
      </span>
      {note(t('Chaque matin, une notification sur cet appareil : créneaux du jour, durée prévue et retards. Rien n\'est envoyé un jour sans créneau ni retard.'))}

      {support === 'install-ios' &&
        note(t('Sur iPad et iPhone, ajoutez d\'abord l\'application à l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), puis ouvrez-la depuis son icône pour activer le rappel.'))}
      {support === 'unsupported' && note(t('Ce navigateur ne permet pas les notifications.'))}
      {support === 'denied' &&
        note(t('Les notifications sont bloquées pour cette application : autorisez-les dans les réglages du navigateur ou de l\'appareil, puis rouvrez cette page.'))}

      {support === 'ok' && subscribedTime === undefined && note(t('Chargement...'))}

      {support === 'ok' && subscribedTime !== undefined && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <TimeSelect
            ariaLabel={t('Heure du rappel')}
            value={time}
            stepMinutes={15}
            onChange={(v) => {
              setTime(v);
              // Déjà abonné : la nouvelle heure est enregistrée aussitôt
              if (subscribedTime) subscribe(v);
            }}
          />
          {subscribedTime ? (
            <>
              <span className="text-[0.6875rem] font-semibold text-emerald-700 dark:text-emerald-400">
                {t('Activé sur cet appareil')}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={unsubscribe}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl disabled:opacity-50"
              >
                <BellOff className="w-3.5 h-3.5" />
                <span>{t('Désactiver')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => subscribe(time)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{busy ? t('Activation...') : t('Activer le rappel')}</span>
            </button>
          )}
        </div>
      )}
      {error && <p className="text-[0.6875rem] text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
    </div>
  );
};
