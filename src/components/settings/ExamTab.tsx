import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AppSettings, RevisionItem } from '../../types';
import { t } from '../../i18n';
import { getTodayIso } from '../../utils/dateUtils';
import { ExamValues, examValuesFromSettings } from '../../utils/examSettings';
import { PERIOD_PROMPT_MAX_WEEKS, PeriodPrompt } from '../../utils/revisionPeriod';
import { SettingsSection } from './SettingsSection';
import { RevisionPeriodsSection } from './RevisionPeriodsSection';

/**
 * Valeurs saisies dans l'onglet Examen. L'état vit dans la fenêtre des réglages (le hook y est appelé) :
 * changer d'onglet ne perd pas une saisie, tout s'enregistre avec le bouton commun.
 */
export function useExamDraft(settings: AppSettings) {
  const initial = examValuesFromSettings(settings);
  const [examDate, setExamDate] = useState<string>(initial.examDate);
  const [periodPrompt, setPeriodPrompt] = useState<PeriodPrompt>(initial.periodPrompt);
  const [periodPromptWeeks, setPeriodPromptWeeks] = useState<number>(initial.periodPromptWeeks);

  /** Reprend les valeurs enregistrées (à l'ouverture de la fenêtre). */
  const reset = (s: AppSettings) => {
    const v = examValuesFromSettings(s);
    setExamDate(v.examDate);
    setPeriodPrompt(v.periodPrompt);
    setPeriodPromptWeeks(v.periodPromptWeeks);
  };

  const values: ExamValues = { examDate, periodPrompt, periodPromptWeeks };
  return { examDate, setExamDate, periodPrompt, setPeriodPrompt, periodPromptWeeks, setPeriodPromptWeeks, values, reset };
}

export type ExamDraft = ReturnType<typeof useExamDraft>;

const MODES: { id: PeriodPrompt; label: () => string; hint: () => string }[] = [
  {
    id: 'auto',
    label: () => t('Automatiquement'),
    hint: () => t('Le bouton et la carte du Tableau de bord n\'apparaissent que lorsque l\'examen approche.'),
  },
  {
    id: 'always',
    label: () => t('Toujours afficher'),
    hint: () => t('Le bouton (vue Cours) et la carte (Tableau de bord) restent visibles, même sans date d\'examen.'),
  },
  {
    id: 'never',
    label: () => t('Jamais'),
    hint: () => t('Aucun rappel : la période se crée seulement depuis cet onglet.'),
  },
];

interface Props {
  draft: ExamDraft;
  revisions: RevisionItem[];
  settings: AppSettings;
  /** Supprime une période (tout de suite, hors du bouton Enregistrer), avec ou sans ses R à venir. */
  onDeletePeriod?: (periodId: string, removePendingReviews: boolean) => void;
  /** Ouvre l'assistant ; reçoit les valeurs saisies, que l'appelant enregistre d'abord (l'assistant lit la date d'examen). */
  onNewPeriod?: (values: ExamValues) => void;
}

/** Onglet Examen : date d'examen, quand proposer la période de révision, périodes enregistrées. */
export const ExamTab: React.FC<Props> = ({ draft, revisions, settings, onDeletePeriod, onNewPeriod }) => {
  const { examDate, setExamDate, periodPrompt, setPeriodPrompt, periodPromptWeeks, setPeriodPromptWeeks } = draft;

  return (
    <div className="space-y-3">
      <SettingsSection title={t('Date d\'examen')} defaultOpen>
        <div>
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1" htmlFor="exam-date">
            {t('Date d\'examen (facultatif)')}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
            />
            {examDate && (
              <button type="button" onClick={() => setExamDate('')} className="text-xs font-semibold text-slate-500 hover:text-rose-600">
                {t('Effacer')}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {t('Active une projection dans Statistiques : à ce rythme, tous les cours seront-ils commencés à temps ? Sans date, rien n\'est affiché.')}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title={t('Proposer la période de révision')} defaultOpen>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('La période répartit les révisions de plusieurs cours avant un examen. Choisissez quand l\'app vous la propose.')}
        </p>
        <div role="radiogroup" aria-label={t('Proposer la période de révision')} className="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                periodPrompt === m.id
                  ? 'border-teal-400 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <input
                type="radio"
                name="period-prompt"
                checked={periodPrompt === m.id}
                onChange={() => setPeriodPrompt(m.id)}
                className="mt-0.5 text-teal-600 focus:ring-teal-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">{m.label()}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{m.hint()}</span>
                {m.id === 'auto' && periodPrompt === 'auto' && (
                  <span className="flex items-center gap-2 mt-2 flex-wrap">
                    <input
                      type="number"
                      min={1}
                      max={PERIOD_PROMPT_MAX_WEEKS}
                      value={periodPromptWeeks}
                      aria-label={t('Semaines avant l\'examen')}
                      onChange={(e) => setPeriodPromptWeeks(Number(e.target.value))}
                      className="w-16 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {t('semaines avant l\'examen (sans date d\'examen, rien n\'est proposé)')}
                    </span>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('Périodes de révision')} defaultOpen>
        {onDeletePeriod && (
          <RevisionPeriodsSection
            periods={settings.revisionPeriods ?? []}
            revisions={revisions}
            todayIso={getTodayIso()}
            onDelete={onDeletePeriod}
          />
        )}
        {onNewPeriod && (
          <button
            type="button"
            onClick={() => onNewPeriod(draft.values)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Nouvelle période')}
          </button>
        )}
      </SettingsSection>
    </div>
  );
};
