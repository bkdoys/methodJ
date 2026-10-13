import React, { useState } from 'react';
import type { AppSettings, Course, LinkType } from '../../types';
import type { Lang } from '../../i18n';
import { LANGUAGES, getLang, t } from '../../i18n';
import { LinkTypesManager } from '../LinkTypesManager';
import { getLinkTypes } from '../../utils/courseLinks';
import { Sun, Moon } from 'lucide-react';

/** Langue et thème choisis dans l'onglet Affichage (enregistrés avec le bouton commun). */
export function useDisplayDraft(settings: AppSettings) {
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme || 'light');
  const [language, setLanguage] = useState<Lang>(settings.language ?? getLang());
  /** Reprend les valeurs enregistrées (à l'ouverture de la fenêtre). */
  const reset = (s: AppSettings) => {
    setTheme(s.theme || 'light');
    setLanguage(s.language ?? getLang());
  };
  return { theme, setTheme, language, setLanguage, reset };
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
  const { theme, setTheme, language, setLanguage } = draft;
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
              <span className="text-[10px] text-slate-500">{t('Pour le travail de jour')}</span>
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
              <span className="text-[10px] text-slate-400">{t('Pour les gardes et révisions tardives')}</span>
            </div>
          </button>
        </div>
      </div>


      {/* Types de liens des cours */}
      <div>
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
          {t('Types de liens')}
        </label>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          {t('Pour classer les liens (Drive, flashcards…) ajoutés aux cours. Les modifications sont enregistrées tout de suite.')}
        </p>
        <LinkTypesManager linkTypes={getLinkTypes(settings)} courses={courses} onChange={onChangeLinkTypes} />
      </div>

    </div>
  );
};
