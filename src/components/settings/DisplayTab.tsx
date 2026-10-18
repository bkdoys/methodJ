import React, { useState } from 'react';
import type { AppSettings, Course, LinkType } from '../../types';
import type { Lang } from '../../i18n';
import { LANGUAGES, getLang, t } from '../../i18n';
import { LinkTypesManager } from '../LinkTypesManager';
import { getLinkTypes } from '../../utils/courseLinks';
import { Sun, Moon } from 'lucide-react';
import { getTextScale, TextScale, TEXT_SCALES } from '../../utils/textScale';

/** Langue et thème choisis dans l'onglet Affichage (enregistrés avec le bouton commun). */
export function useDisplayDraft(settings: AppSettings) {
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme || 'light');
  const [language, setLanguage] = useState<Lang>(settings.language ?? getLang());
  const [textScale, setTextScale] = useState<TextScale>(getTextScale(settings));
  /** Reprend les valeurs enregistrées (à l'ouverture de la fenêtre). */
  const reset = (s: AppSettings) => {
    setTheme(s.theme || 'light');
    setLanguage(s.language ?? getLang());
    setTextScale(getTextScale(s));
  };
  return { theme, setTheme, language, setLanguage, textScale, setTextScale, reset };
}

export type DisplayDraft = ReturnType<typeof useDisplayDraft>;

interface DisplayTabProps {
  draft: DisplayDraft;
  settings: AppSettings;
  courses: Course[];
  /** Enregistre aussitôt la liste des types de liens (commune à tous les cours). */
  onChangeLinkTypes: (types: LinkType[]) => void;
}

/** Onglet Affichage : langue, thème, types de liens. */
export const DisplayTab: React.FC<DisplayTabProps> = ({ draft, settings, courses, onChangeLinkTypes }) => {
  const { theme, setTheme, language, setLanguage, textScale, setTextScale } = draft;
  return (
    <div className="space-y-4">
      {/* Langue de l'interface */}
      <div>
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
          {t('Langue / Language')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLanguage(l.id)}
              aria-pressed={language === l.id}
              className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                language === l.id
                  ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>


      {/* Theme Selector (Clair / Sombre) */}
      <div>
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
          {t('Apparence & Thème visuel')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
              theme === 'light'
                ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <Sun className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-bold block">{t('Thème Clair')}</span>
              <span className="text-[0.625rem] text-slate-500">{t('Pour le travail de jour')}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
              theme === 'dark'
                ? 'border-teal-600 bg-slate-800 text-teal-300 ring-2 ring-teal-500 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="p-2 rounded-lg bg-indigo-900/60 text-indigo-300">
              <Moon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-bold block">{t('Thème Sombre')}</span>
              <span className="text-[0.625rem] text-slate-400">{t('Pour les gardes et révisions tardives')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Taille du texte : s'applique tout de suite à cette fenêtre (aperçu), « Annuler » revient à la taille enregistrée */}
      <div>
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">{t('Taille du texte')}</label>
        <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 mb-2">
          {t('Agrandit ou réduit tous les textes de l\'application. L\'aperçu est immédiat ; « Enregistrer » le garde.')}
        </p>
        <div role="radiogroup" aria-label={t('Taille du texte')} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TEXT_SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={textScale === s.id}
              onClick={() => setTextScale(s.id)}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                textScale === s.id
                  ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {s.label}
              <span className="block text-[0.625rem] font-mono font-normal opacity-70">{Math.round(s.factor * 100)} %</span>
            </button>
          ))}
        </div>
      </div>

      {/* Types de liens des cours */}
      <div>
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
          {t('Types de liens')}
        </label>
        <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 mb-2">
          {t('Pour classer les liens (Drive, flashcards…) ajoutés aux cours. Les modifications sont enregistrées tout de suite.')}
        </p>
        <LinkTypesManager linkTypes={getLinkTypes(settings)} courses={courses} onChange={onChangeLinkTypes} />
      </div>

    </div>
  );
};
