import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Loader2, Send } from 'lucide-react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { addDays, getTodayIso } from '../utils/dateUtils';
import { buildIcs, buildSlotEvents, downloadIcs } from '../utils/ics';
import {
  describeGoogleError,
  loadGoogleIdentity,
  requestCalendarToken,
  syncToGoogleCalendar,
} from '../utils/googleCalendar';
import { googleClientId } from '../utils/firebase';
import { APP_NAME } from '../appInfo';
import { plural, t } from '../i18n';

interface CalendarExportSectionProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
  /** Mémorise l'identifiant de l'agenda Google créé par l'application. */
  onSaveSettings: (settings: AppSettings) => void;
  /** Appelé quand un export a réussi (la fenêtre du planning s'en sert pour se refermer). */
  onDone?: (kind: 'ics' | 'google') => void;
}

/** L'envoi à Google remonte un peu dans le passé : un créneau validé depuis le dernier envoi passe ainsi en « fait ». */
const GOOGLE_LOOKBACK_DAYS = 30;
const PERIODS = [7, 30, 90, 0] as const; // 0 = tous les créneaux à venir
const REMINDERS = [0, 10, 30, 60] as const;

const select =
  'px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium';

/** Export des créneaux en fichier .ics (Google Agenda, Apple, Outlook…). */
export const CalendarExportSection: React.FC<CalendarExportSectionProps> = ({ courses, revisions, subjects, settings, onSaveSettings, onDone }) => {
  const [period, setPeriod] = useState<number>(30);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [reminder, setReminder] = useState<number>(0);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const calendarName = `${APP_NAME} – ${t('Révisions')}`;
  const range = useMemo(() => {
    const today = getTodayIso();
    return { fromIso: today, toIso: period > 0 ? addDays(today, period - 1) : undefined };
  }, [period]);
  const googleRange = useMemo(() => ({ fromIso: addDays(range.fromIso, -GOOGLE_LOOKBACK_DAYS), toIso: range.toIso }), [range]);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const data = useMemo(() => ({ courses, revisions, subjects, settings }), [courses, revisions, subjects, settings]);

  const build = useMemo(
    () => () => buildIcs(data, { ...range, includeCompleted, reminderMinutes: reminder, calendarName, appUrl }),
    [data, range, includeCompleted, reminder, calendarName, appUrl]
  );
  const count = useMemo(() => build().count, [build]);

  // Le script d'autorisation Google est chargé d'avance : la fenêtre doit s'ouvrir directement au clic
  useEffect(() => {
    if (googleClientId) loadGoogleIdentity().catch(() => undefined);
  }, []);

  const handleSendToGoogle = () => {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    setMessage(null);
    // Appelé tout de suite (avant tout await) pour que le navigateur accepte d'ouvrir la fenêtre Google
    const tokenPromise = requestCalendarToken(googleClientId);
    (async () => {
      try {
        const token = await tokenPromise;
        const result = await syncToGoogleCalendar({
          token,
          calendarId: settings.googleCalendarId,
          calendarName,
          events: buildSlotEvents(data, { ...googleRange, includeCompleted, appUrl }),
          ...googleRange,
          reminderMinutes: reminder,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        onSaveSettings({ ...settings, googleCalendarId: result.calendarId, googleCalendarSyncedAt: new Date().toISOString() });
        setMessage({
          type: 'ok',
          text: t('Agenda « {name} » à jour : {created} créé(s), {updated} mis à jour, {unchanged} inchangé(s), {removed} retiré(s).', {
            name: calendarName,
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            removed: result.removed,
          }),
        });
        onDone?.('google');
      } catch (err) {
        setMessage({ type: 'error', text: describeGoogleError(err) });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    })();
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
      <div>
        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <CalendarPlus className="w-4 h-4 text-teal-600" />
          <span>{t('Exporter vers un agenda (.ics)')}</span>
        </span>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
          {t('Crée un fichier à importer dans Google Agenda, Apple Calendrier ou Outlook : un événement par créneau, avec l\'heure du planning et les liens du cours.')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label={t('Période')} className={select}>
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p === 0 ? t('Tous les créneaux à venir') : t('{n} prochains jours', { n: p })}
            </option>
          ))}
        </select>
        <select value={reminder} onChange={(e) => setReminder(Number(e.target.value))} aria-label={t('Rappel')} className={select}>
          {REMINDERS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? t('Sans rappel') : t('Rappel {n} min avant', { n: m })}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} className="accent-teal-600" />
          {t('Inclure les créneaux validés (marqués ✓)')}
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={count === 0}
          onClick={() => {
            downloadIcs(build().ics);
            setMessage({ type: 'ok', text: t('Fichier téléchargé : {n} créneau(x) à importer dans votre agenda.', { n: count }) });
            onDone?.('ics');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          <span>{t('Télécharger le fichier .ics')}</span>
        </button>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {count === 0 ? t('Aucun créneau sur cette période.') : plural(count, '{n} créneau', '{n} créneaux')}
        </span>
      </div>

      {googleClientId && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Send className="w-4 h-4 text-teal-600" />
            <span>{t('Envoyer directement vers Google Agenda')}</span>
          </span>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('Crée (la première fois) un agenda « {name} » dans votre compte Google et y place les créneaux de la période choisie. Renvoyer met à jour les événements et retire ceux qui n\'existent plus. L\'application ne voit que cet agenda, jamais vos autres agendas.', { name: calendarName })}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={handleSendToGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{busy ? t('Envoi en cours…') : t('Envoyer vers Google Agenda')}</span>
            </button>
            {busy && progress && (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {progress.done}/{progress.total}
              </span>
            )}
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`text-[11px] font-medium ${
            message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        {t('Dans Google Agenda : créez d\'abord un agenda « {name} » (Autres agendas, Créer un agenda), puis Réglages, Importer et exporter, et choisissez cet agenda à l\'import. Réimporter le fichier devrait mettre à jour les événements au lieu de les dupliquer ; un créneau supprimé dans l\'application reste à retirer à la main (ou en supprimant l\'agenda dédié).', { name: calendarName })}
      </p>
    </div>
  );
};
