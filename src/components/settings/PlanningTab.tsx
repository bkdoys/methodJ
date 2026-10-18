import React, { useState } from 'react';
import type { AppSettings, Course } from '../../types';
import type { BlockDetails, SubjectDisplay } from '../../utils/dayLayout';
import type { BreaksValue, PlanningValues } from '../../utils/planningSettings';
import { DEFAULT_J_PATTERNS, getJPool } from '../../utils/jMethod';
import { formatMinutes } from '../../utils/dateUtils';
import { t } from '../../i18n';
import { TimeSelect } from '../TimeSelect';
import { BreaksEditor } from '../BreaksEditor';
import { DurationSelect } from '../DurationSelect';
import { JIntervalAdder } from '../JIntervalAdder';
import { defaultDayWindowStrings, getBlockDetails, getMultiDayCount, MULTI_DAY_MAX, MULTI_DAY_MIN, getTimelineConfig, parseTime, STEP_OPTIONS } from '../../utils/dayLayout';
import { customWindowsFromSettings, slotDurationsFromSettings, weekdayLabels } from '../../utils/planningSettings';
import { SettingsSection } from './SettingsSection';
import { X, Plus, Layers } from 'lucide-react';
import { getFreeAlertDays } from '../../utils/freeAlerts';

/**
 * Valeurs saisies dans l'onglet Planning. L'état vit dans la fenêtre des réglages (le hook y est appelé) :
 * changer d'onglet ou replier un bloc ne perd pas une saisie, tout s'enregistre avec le bouton commun.
 */
export function usePlanningDraft(settings: AppSettings) {
  const [defaultPattern, setDefaultPattern] = useState<number[]>(settings.defaultJPattern);
  const [jPool, setJPool] = useState<number[]>(getJPool(settings));
  const [slotDefault, setSlotDefault] = useState<number>(() => slotDurationsFromSettings(settings).def);
  const [slotByJ, setSlotByJ] = useState<Record<string, number>>(() => slotDurationsFromSettings(settings).byJ);
  const [newSlotJ, setNewSlotJ] = useState('');
  const [isAddingException, setIsAddingException] = useState(false);
  const [newSlotMinutes, setNewSlotMinutes] = useState<number>(60);
  const [jToRemove, setJToRemove] = useState<{ val: number; used: number } | null>(null);
  const [autoCascade, setAutoCascade] = useState<boolean>(settings.autoCascadeShift);
  const [dailyTargetHours, setDailyTargetHours] = useState<number>(settings.dailyTargetHours);
  const [freeAlertDays, setFreeAlertDays] = useState<number>(getFreeAlertDays(settings));
  const [dayStartTime, setDayStartTime] = useState<string>(settings.dayStartTime);
  const [timelineStartHour, setTimelineStartHour] = useState<number>(getTimelineConfig(settings).startHour);
  const [timelineEndHour, setTimelineEndHour] = useState<number>(getTimelineConfig(settings).endHour);
  const [timelineStepMinutes, setTimelineStepMinutes] = useState<number>(getTimelineConfig(settings).stepMinutes);
  const [customWindows, setCustomWindows] = useState(() => customWindowsFromSettings(settings));
  const [breaks, setBreaks] = useState<BreaksValue>(() => settings.breaks ?? {});
  const [multiDayCount, setMultiDayCount] = useState<number>(getMultiDayCount(settings));
  const [blockDetails, setBlockDetails] = useState<BlockDetails>(getBlockDetails(settings));

  /** Reprend les valeurs enregistrées (à l'ouverture de la fenêtre). */
  const reset = (s: AppSettings) => {
    setDefaultPattern(s.defaultJPattern);
    setJPool(getJPool(s));
    const slots = slotDurationsFromSettings(s);
    setSlotDefault(slots.def);
    setSlotByJ(slots.byJ);
    setAutoCascade(s.autoCascadeShift);
    setDailyTargetHours(s.dailyTargetHours);
    setFreeAlertDays(getFreeAlertDays(s));
    setDayStartTime(s.dayStartTime);
    const tl = getTimelineConfig(s);
    setTimelineStartHour(tl.startHour);
    setTimelineEndHour(tl.endHour);
    setTimelineStepMinutes(tl.stepMinutes);
    setCustomWindows(customWindowsFromSettings(s));
    setBreaks(s.breaks ?? {});
    setMultiDayCount(getMultiDayCount(s));
    setBlockDetails(getBlockDetails(s));
  };

  const values: PlanningValues = {
    defaultPattern, jPool, slotDefault, slotByJ, autoCascade, dailyTargetHours, freeAlertDays, dayStartTime,
    timelineStartHour, timelineEndHour, timelineStepMinutes, customWindows, breaks, multiDayCount, blockDetails,
  };

  return {
    defaultPattern, setDefaultPattern, jPool, setJPool, slotDefault, setSlotDefault, slotByJ, setSlotByJ,
    newSlotJ, setNewSlotJ, isAddingException, setIsAddingException, newSlotMinutes, setNewSlotMinutes,
    jToRemove, setJToRemove, autoCascade, setAutoCascade, dailyTargetHours, setDailyTargetHours,
    freeAlertDays, setFreeAlertDays, dayStartTime, setDayStartTime, timelineStartHour, setTimelineStartHour, timelineEndHour, setTimelineEndHour,
    timelineStepMinutes, setTimelineStepMinutes, customWindows, setCustomWindows, breaks, setBreaks,
    multiDayCount, setMultiDayCount, blockDetails, setBlockDetails, values, reset,
  };
}

export type PlanningDraft = ReturnType<typeof usePlanningDraft>;

/** Onglet Planning : répétitions, créneaux, journée de travail, affichage du planning. */
export const PlanningTab: React.FC<{ draft: PlanningDraft; courses: Course[] }> = ({ draft, courses }) => {
  const { defaultPattern, setDefaultPattern, jPool, setJPool, slotDefault, setSlotDefault, slotByJ, setSlotByJ, setNewSlotJ, setIsAddingException, setNewSlotMinutes, setJToRemove, autoCascade, setAutoCascade, dailyTargetHours, setDailyTargetHours, freeAlertDays, setFreeAlertDays, dayStartTime, setDayStartTime, timelineStartHour, setTimelineStartHour, timelineEndHour, setTimelineEndHour, timelineStepMinutes, setTimelineStepMinutes, customWindows, setCustomWindows, breaks, setBreaks, multiDayCount, setMultiDayCount, blockDetails, setBlockDetails } = draft;

  // J toggle handlers
  const toggleJ = (val: number) => {
    if (val === 0) return;
    if (defaultPattern.includes(val)) {
      setDefaultPattern(defaultPattern.filter((j) => j !== val));
    } else {
      setDefaultPattern([...defaultPattern, val].sort((a, b) => a - b));
    }
  };

  // Retire un intervalle de la liste (J0 est obligatoire) et des répétitions par défaut
  const removeFromPool = (val: number) => {
    if (val === 0) return;
    // Information seulement : les cours existants gardent leurs révisions, on peut retirer quand même
    const used = courses.filter((c) => c.activeJList?.includes(val)).length;
    if (used > 0) {
      setJToRemove({ val, used });
      return;
    }
    setJPool(jPool.filter((j) => j !== val));
    setDefaultPattern(defaultPattern.filter((j) => j !== val));
  };

  // Plage affichée pour un jour : la sienne si elle a été modifiée, sinon la plage par défaut
  const defaultWindow = defaultDayWindowStrings({
    dayStartTime,
    timelineStartHour,
    timelineEndHour,
    timelineStepMinutes,
  });
  const windowFor = (i: number) => customWindows[String(i)] ?? defaultWindow;
  const editWindow = (i: number, patch: Partial<{ start: string; end: string }>) =>
    setCustomWindows((prev) => ({ ...prev, [String(i)]: { ...(prev[String(i)] ?? defaultWindow), ...patch } }));

  return (
    <div className="space-y-3">
      <SettingsSection title={t('Répétitions')} defaultOpen>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
            {t('Répétitions par défaut')}
          </h4>
          <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
            {t('Appliquées à chaque nouveau cours.')}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[0.6875rem] text-slate-500">{t('Préréglages :')}</span>
          <button
            type="button"
            onClick={() => setDefaultPattern([...DEFAULT_J_PATTERNS.ednClassique])}
            className="text-[0.6875rem] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
          >
            {t('EDN Classique')}
          </button>
          <button
            type="button"
            onClick={() => setDefaultPattern([...DEFAULT_J_PATTERNS.passIntensif])}
            className="text-[0.6875rem] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
          >
            {t('PASS Intensif')}
          </button>
        </div>
      </div>

      {/* J chips : la liste est modifiable ; un chip coché = répétition par défaut */}
      <div className="flex flex-wrap gap-1.5 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl">
        {[...new Set([...jPool, ...defaultPattern])].sort((a, b) => a - b).map((jVal) => {
          const isChecked = defaultPattern.includes(jVal);
          return (
            <span
              key={jVal}
              className={`inline-flex items-stretch rounded-xl border transition-all overflow-hidden ${
                isChecked
                  ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <button
                type="button"
                disabled={jVal === 0}
                aria-pressed={isChecked}
                onClick={() => toggleJ(jVal)}
                className="pl-3 pr-2 py-1.5 text-xs font-bold flex items-center gap-1 hover:brightness-95"
              >
                <span>J{jVal}</span>
                <span className="text-[0.625rem] opacity-75 font-normal">({formatMinutes(slotByJ[String(jVal)] ?? slotDefault)})</span>
              </button>
              {jVal !== 0 && (
                <button
                  type="button"
                  aria-label={t('Retirer J{j} de la liste', { j: jVal })}
                  title={(() => {
                    const used = courses.filter((c) => c.activeJList?.includes(jVal)).length;
                    return used > 0
                      ? t('Retirer J{j} de la liste (utilisé par {n} cours)', { j: jVal, n: used })
                      : t('Retirer J{j} de la liste (inutilisé)', { j: jVal });
                  })()}
                  onClick={() => removeFromPool(jVal)}
                  className="px-1.5 opacity-70 hover:opacity-100 hover:bg-black/10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[0.6875rem] text-slate-500 dark:text-slate-400 -mt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-teal-600" />
          {t('Par défaut')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          {t('Proposé seulement')}
        </span>
        <span className="flex items-center gap-1.5">
          <X className="w-3 h-3" />
          {t('Retirer de la liste')}
        </span>
      </div>

      {/* Ajout d'un intervalle à la liste */}
      <JIntervalAdder
        label={t('Ajouter un intervalle :')}
        existing={[...jPool, ...defaultPattern]}
        onAdd={(num) => setJPool((prev) => [...new Set([...prev, num])].sort((x, y) => x - y))}
      />

      </SettingsSection>

      <SettingsSection title={t('Créneaux')}>
      {/* Durée des créneaux : valeur par défaut + exceptions par J (rangées en grille) */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Durée des créneaux')}</h4>
            <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
              {t('Une durée pour tous les J, puis des exceptions pour certains. Appliqué aux nouveaux créneaux.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="slot-default" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('Par défaut')}
            </label>
            <DurationSelect id="slot-default" value={slotDefault} onChange={setSlotDefault} />
          </div>
        </div>

        {(
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {Object.keys(slotByJ)
              .map(Number)
              .sort((a, b) => a - b)
              .map((j) => (
                <div
                  key={j}
                  className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/30"
                >
                  <label
                    htmlFor={`slot-j-${j}`}
                    className="text-xs font-bold text-teal-700 dark:text-teal-400 shrink-0"
                  >
                    J{j}
                  </label>
                  <DurationSelect
                    id={`slot-j-${j}`}
                    value={slotByJ[String(j)]}
                    onChange={(m) =>
                      setSlotByJ((prev) => {
                        const next = { ...prev };
                        // Identique à la durée par défaut : ce n'est plus une exception
                        if (m === slotDefault) delete next[String(j)];
                        else next[String(j)] = m;
                        return next;
                      })
                    }
                    className="flex-1 min-w-0 border-0 bg-transparent font-medium"
                  />
                  <button
                    type="button"
                    aria-label={t('Supprimer l\'exception J{j}', { j })}
                    title={t('Revenir à la durée par défaut')}
                    onClick={() =>
                      setSlotByJ((prev) => {
                        const next = { ...prev };
                        delete next[String(j)];
                        return next;
                      })
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            <button
              type="button"
              onClick={() => {
                setNewSlotJ('');
                setNewSlotMinutes(slotDefault === 60 ? 90 : 60);
                setIsAddingException(true);
              }}
              title={t('Ajouter une exception de durée pour un J')}
              aria-label={t('Ajouter une exception de durée pour un J')}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:text-teal-700 dark:hover:text-teal-400 hover:border-teal-400"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('Exception')}</span>
            </button>
          </div>
        )}

      </div>

      {/* Cascade shifting toggle */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
        <div className="flex items-start gap-2.5">
          <input
            id="settings-cascade"
            type="checkbox"
            checked={autoCascade}
            onChange={(e) => setAutoCascade(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
          />
          <div>
            <label htmlFor="settings-cascade" className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block">
              {t('Décalage automatique en cascade des révisions suivantes')}
            </label>
            <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('Si vous décalez un créneau (ex: J1 repoussé de 2 jours), tous les créneaux suivants non faits (J3, J7, J15...) sont décalés du même nombre de jours pour préserver la courbe de mémorisation.')}
            </p>
          </div>
        </div>
      </div>
      </SettingsSection>

      <SettingsSection title={t('Journée de travail')}>
      {/* Target Hours & Start Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <div>
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
            {t('Objectif journalier de travail')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="14"
              value={dailyTargetHours}
              onChange={(e) => setDailyTargetHours(Number(e.target.value))}
              className="w-24 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold dark:bg-slate-800 dark:text-white"
            />
            <span className="text-xs text-slate-500">{t('heures / jour')}</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
            {t('Heure de début suggérée')}
          </label>
          <TimeSelect
            ariaLabel={t('Heure de début suggérée')}
            value={dayStartTime}
            onChange={setDayStartTime}
            className="px-3 py-1.5"
          />
        </div>
      </div>

      <div className="pt-1">
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1" htmlFor="free-alert-days">
          {t('Cours en révision libre : alerte après')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="free-alert-days"
            type="number"
            min={0}
            max={365}
            value={freeAlertDays}
            onChange={(e) => setFreeAlertDays(Number(e.target.value))}
            className="w-20 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('jours sans révision ni R planifiée (0 = jamais)')}</span>
        </div>
        <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 mt-1">
          {t('Le cours apparaît dans le tableau de bord. Chaque report y est deux fois plus court que le précédent, jusqu\'à 1 jour ; ensuite il faut planifier une R.')}
        </p>
      </div>


      {/* Plages horaires autorisées par jour de la semaine */}
      <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {t('Plages horaires par jour')}
          </span>
          <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
            {t('Heures pendant lesquelles vous acceptez de travailler. Les nouveaux créneaux (J0, J1…) se placent là où il y a de la place dans la plage du jour, et on ne peut pas les déplacer hors de cette plage. Le reste de la journée apparaît grisé.')}
          </span>
        </div>
        <div className="space-y-1.5">
          {weekdayLabels().map((label, i) => {
            const shown = windowFor(i);
            const startMin = parseTime(shown.start);
            const endMin = shown.end === '23:59' ? 24 * 60 : parseTime(shown.end);
            const invalid = startMin === null || endMin === null || endMin <= startMin;
            return (
              <div key={label} className="flex items-center gap-2 flex-wrap">
                <span className="w-20 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                <TimeSelect
                  ariaLabel={t('{day} : début', { day: label })}
                  value={shown.start}
                  onChange={(v) => editWindow(i, { start: v })}
                />
                <span className="text-xs text-slate-400">{t('à')}</span>
                <TimeSelect
                  ariaLabel={t('{day} : fin', { day: label })}
                  value={shown.end}
                  onChange={(v) => editWindow(i, { end: v })}
                  fromMinutes={30}
                  allowMidnight
                />
                {/* Aperçu : la plage sur 24 h */}
                {!invalid && (
                  <span
                    className="hidden sm:block flex-1 min-w-[60px] max-w-[160px] h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden"
                    aria-hidden="true"
                  >
                    <span
                      className="absolute inset-y-0 rounded-full bg-teal-500/70"
                      style={{ left: `${(startMin! / 1440) * 100}%`, width: `${((endMin! - startMin!) / 1440) * 100}%` }}
                    />
                  </span>
                )}
                {invalid && (
                  <span className="text-[0.6875rem] text-rose-600 dark:text-rose-400">{t('la fin doit suivre le début')}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              const monday = windowFor(0);
              setCustomWindows(Object.fromEntries(weekdayLabels().map((_, i) => [String(i), { ...monday }])));
            }}
            className="text-[0.6875rem] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            {t('Appliquer le lundi à tous les jours')}
          </button>
          <button
            type="button"
            onClick={() => setCustomWindows({})}
            className="text-[0.6875rem] font-semibold text-slate-500 dark:text-slate-400 hover:underline"
          >
            {t('Rétablir la plage par défaut')}
          </button>
        </div>
      </div>

      <BreaksEditor value={breaks} onChange={setBreaks} weekdayLabels={weekdayLabels()} />

      </SettingsSection>

      <SettingsSection title={t('Affichage du planning')}>
      {/* Échelle de la vue Journée */}
      <div className="space-y-2">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {t('Échelle de la vue Journée')}
          </span>
          <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
            {t('Plage d\'heures affichée et pas de déplacement des créneaux (glisser-déposer).')}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="tl-start" className="text-[0.6875rem] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              {t('De')}
            </label>
            <select
              id="tl-start"
              value={timelineStartHour}
              onChange={(e) => setTimelineStartHour(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tl-end" className="text-[0.6875rem] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              {t('À')}
            </label>
            <select
              id="tl-end"
              value={timelineEndHour}
              onChange={(e) => setTimelineEndHour(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {String(h % 24).padStart(2, '0')}:00{h === 24 ? ` ${t('(minuit)')}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tl-step" className="text-[0.6875rem] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              {t('Pas de déplacement')}
            </label>
            <select
              id="tl-step"
              value={timelineStepMinutes}
              onChange={(e) => setTimelineStepMinutes(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
            >
              {STEP_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? t('1 h') : t('{n} min', { n: m })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>


      {/* Vue sur plusieurs jours + détails affichés dans les créneaux */}
      <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {t('Vue sur plusieurs jours et affichage des créneaux')}
          </span>
          <span className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
            {t('La vue « N jours » se place entre Jour et Semaine. Quand les colonnes sont assez larges, les créneaux affichent les détails cochés ci-dessous.')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="multi-days" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {t('Nombre de jours')}
          </label>
          <select
            id="multi-days"
            value={multiDayCount}
            onChange={(e) => setMultiDayCount(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 dark:text-white"
          >
            {Array.from({ length: MULTI_DAY_MAX - MULTI_DAY_MIN + 1 }, (_, i) => MULTI_DAY_MIN + i).map((n) => (
              <option key={n} value={n}>
                {t('{n} jours', { n })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="block-subject" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {t('Matière dans les créneaux')}
          </label>
          <select
            id="block-subject"
            value={blockDetails.subject}
            onChange={(e) => setBlockDetails((prev) => ({ ...prev, subject: e.target.value as SubjectDisplay }))}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
          >
            <option value="code">{t('Code court (CARDIO…)')}</option>
            <option value="name">{t('Nom complet')}</option>
            <option value="none">{t('Aucune (couleur seule)')}</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 max-w-md">
          {(
            [
              ['code', t('Code de l\'item')],
              ['notes', t('Texte de la note du créneau')],
              ['rating', t('Étoiles de la note')],
            ] as ['code' | 'notes' | 'rating', string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={blockDetails[key]}
                onChange={(e) => setBlockDetails((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      </SettingsSection>
    </div>
  );
};

/** Fenêtres de l'onglet Planning (exception de durée, retrait d'un J), rendues hors de la zone qui défile. */
export const PlanningDialogs: React.FC<{ draft: PlanningDraft }> = ({ draft }) => {
  const { defaultPattern, setDefaultPattern, jPool, setJPool, slotDefault, slotByJ, setSlotByJ, newSlotJ, setNewSlotJ, isAddingException, setIsAddingException, newSlotMinutes, setNewSlotMinutes, jToRemove, setJToRemove } = draft;

  return (
    <>
      {/* Nouvelle exception de durée */}
      {isAddingException && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{t('Exception de durée')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="slot-new-j" className="text-[0.6875rem] text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t('Intervalle')}
                </label>
                <select
                  id="slot-new-j"
                  value={newSlotJ}
                  onChange={(e) => setNewSlotJ(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                >
                  <option value="">{t('Choisir')}</option>
                  {[...new Set([...jPool, ...defaultPattern])]
                    .sort((a, b) => a - b)
                    .filter((j) => slotByJ[String(j)] === undefined)
                    .map((j) => (
                      <option key={j} value={j}>
                        J{j}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="slot-new-min" className="text-[0.6875rem] text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t('Durée')}
                </label>
                <DurationSelect
                  id="slot-new-min"
                  value={newSlotMinutes}
                  onChange={setNewSlotMinutes}
                  className="w-full"
                />
              </div>
            </div>
            {newSlotMinutes === slotDefault && (
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {t('Cette durée est déjà celle par défaut : choisissez-en une différente.')}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingException(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                {t('Annuler')}
              </button>
              <button
                type="button"
                disabled={newSlotJ === '' || newSlotMinutes === slotDefault}
                onClick={() => {
                  setSlotByJ((prev) => ({ ...prev, [newSlotJ]: newSlotMinutes }));
                  setIsAddingException(false);
                }}
                className="px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl"
              >
                {t('Ajouter')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retrait d'un intervalle J utilisé par des cours : simple information, on peut retirer quand même */}
      {jToRemove && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <Layers className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('Retirer J{j} de la liste ?', { j: jToRemove.val })}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('J{j} est utilisé par {n} cours. Ils gardent leurs révisions : il ne sera simplement plus proposé pour les prochains cours.', { j: jToRemove.val, n: jToRemove.used })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setJToRemove(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                {t('Garder')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = jToRemove.val;
                  setJToRemove(null);
                  setJPool((p) => p.filter((j) => j !== val));
                  setDefaultPattern((p) => p.filter((j) => j !== val));
                }}
                className="px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl"
              >
                {t('Retirer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
