import React from 'react';
import type { Course, MasteryLevel } from '../../types';
import { t } from '../../i18n';
import { PlanningRules } from '../PlanningRules';
import { MASTERY_CONFIG } from '../MasteryBadge';
import { RefreshCw, Brain } from 'lucide-react';

/** Onglet Aide : rechargement, règles du lissage, méthode des J, maîtrise des cours, astuces. */
export const HelpTab: React.FC<{ courses: Course[] }> = ({ courses }) => {
  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Application')}</h4>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          {t('Sur l\'écran d\'accueil (iPad, téléphone), il n\'y a pas de bouton de rechargement : utilisez celui-ci pour récupérer la dernière version.')}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('Recharger l\'application')}</span>
        </button>
      </div>
      {/* Surcharge, retards et lissage de charge */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Surcharge, retards et lissage')}</h4>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          {t('Un créneau qui ne trouve plus de place n\'est jamais décalé au jour suivant ni supprimé : il s\'empile après la fin de la plage de travail de son jour. L\'application le signale en ambre sur le planning et dans l\'onglet Dashboard, sans rien déplacer toute seule.')}
        </p>
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('Lissage d\'un jour chargé')}</span>
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            <PlanningRules kind="smooth" />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('Rattrapage des retards')}</span>
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            <PlanningRules kind="catchup" />
          </div>
        </div>
      </div>
      {/* Méthode des J & Ebbinghaus */}
      <div className="bg-gradient-to-br from-teal-50/80 via-white to-slate-50 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900 rounded-2xl border border-teal-200 dark:border-teal-800/60 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <h3 className="text-sm font-bold text-teal-950 dark:text-teal-200">
            {t('Fondements de la Méthode des J en Médecine (Courbe d\'Ebbinghaus)')}
          </h3>
        </div>

        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {t('Sans révision, le cerveau humain oublie plus de 70% d\'un cours d\'anatomie ou de sémiologie en 48 heures. La méthode des J réactive la trace mnésique au moment exact où elle commence à décliner, aplatissant progressivement la courbe de l\'oubli.')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
              {t('1. Encodage Initial : J0 & J1')}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              {t('Créneaux longs pour comprendre la physiopathologie et ancrer les mécanismes avant l\'oubli nocturne.')}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
              {t('2. Rappel Actif : J3, J7, J15')}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              {t('Créneaux plus courts basés sur l\'effort de restitution : QCM, cas cliniques et flashcards sans relire passivement.')}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
            <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
              {t('3. Cascade Automatique')}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              {t('Si un J1 est reporté de 2 jours, les J3 et J7 suivants sont automatiquement décalés pour préserver l\'écart mnésique optimal.')}
            </p>
          </div>
        </div>
      </div>

      {/* État d'avancement et niveau de connaissance par cours */}
      {(() => {
        const masteryCounts: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        courses.forEach((c) => {
          masteryCounts[c.mastery]++;
        });

        return (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('État d\'avancement et niveau de connaissance par cours')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Distribution de la solidité mnésique auto-évaluée')}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                {t('{n} cours au total', { n: courses.length })}
              </span>
            </div>

            {/* Barre multi-segments */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden flex">
              {([4, 3, 2, 1, 0] as MasteryLevel[]).map((lvl) => {
                const count = masteryCounts[lvl];
                const pct = courses.length > 0 ? (count / courses.length) * 100 : 0;
                const bgClass =
                  lvl === 4
                    ? 'bg-emerald-500'
                    : lvl === 3
                    ? 'bg-sky-500'
                    : lvl === 2
                    ? 'bg-amber-500'
                    : lvl === 1
                    ? 'bg-rose-500'
                    : 'bg-slate-300 dark:bg-slate-700';

                return (
                  <div
                    key={lvl}
                    style={{ width: `${pct}%` }}
                    className={`${bgClass} h-full transition-all`}
                    title={t('{label} : {n} cours ({pct}%)', { label: MASTERY_CONFIG[lvl].label, n: count, pct: pct.toFixed(0) })}
                  />
                );
              })}
            </div>

            {/* Légende */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
              {([4, 3, 2, 1, 0] as MasteryLevel[]).map((lvl) => {
                const cfg = MASTERY_CONFIG[lvl];
                const count = masteryCounts[lvl];
                const pct = courses.length > 0 ? ((count / courses.length) * 100).toFixed(0) : '0';

                return (
                  <div
                    key={lvl}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between"
                  >
                    <div>
                      <span className={`text-xs font-bold block ${cfg.text}`}>
                        {lvl === 0 ? t('Nouveau') : `${lvl} ★`}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                        {cfg.shortLabel}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white block">
                        {count}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {/* Astuces d'utilisation */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Astuces')}</h4>
        <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          <li>{t('Glissez-déposez un créneau d\'un jour à l\'autre dans la vue Semaine pour le décaler en cascade.')}</li>
          <li>{t('Cliquez sur un cours pour ouvrir sa fiche : notes, couleur, planning et progression.')}</li>
          <li>{t('Importez vos matières depuis l\'onglet « Disciplines & Couleurs » (JSON ou texte).')}</li>
          <li>{t('Exportez régulièrement une sauvegarde JSON, même avec la synchronisation Cloud active.')}</li>
        </ul>
      </div>
    </div>
  );
};
