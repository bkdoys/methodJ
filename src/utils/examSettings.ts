import { AppSettings } from '../types';
import { getPeriodPrompt, PeriodPrompt, PERIOD_PROMPT_DEFAULT_WEEKS } from './revisionPeriod';

/** Valeurs saisies dans l'onglet Examen des réglages. */
export interface ExamValues {
  /** AAAA-MM-JJ, ou vide : pas d'examen. */
  examDate: string;
  periodPrompt: PeriodPrompt;
  periodPromptWeeks: number;
}

/** Valeurs de l'onglet à partir des réglages enregistrés (valeurs par défaut comprises). */
export function examValuesFromSettings(s: Partial<Pick<AppSettings, 'examDate' | 'periodPrompt' | 'periodPromptWeeks'>>): ExamValues {
  const { mode, weeks } = getPeriodPrompt(s);
  return { examDate: s.examDate ?? '', periodPrompt: mode, periodPromptWeeks: weeks };
}

/** Réglages enregistrés correspondant aux valeurs saisies (validées) ; les valeurs par défaut ne sont pas mémorisées. */
export function examSettingsFromValues(v: ExamValues): Partial<AppSettings> {
  const { mode, weeks } = getPeriodPrompt({ periodPrompt: v.periodPrompt, periodPromptWeeks: v.periodPromptWeeks });
  return {
    examDate: /^\d{4}-\d{2}-\d{2}$/.test(v.examDate) ? v.examDate : undefined,
    periodPrompt: mode === 'auto' ? undefined : mode,
    periodPromptWeeks: weeks === PERIOD_PROMPT_DEFAULT_WEEKS ? undefined : weeks,
  };
}
