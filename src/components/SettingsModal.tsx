import React, { useEffect, useRef, useState } from 'react';
import { Settings, Save, X, Palette, Layers, Clock, Cloud, HelpCircle } from 'lucide-react';
import type { AppSettings, Course, LinkType, RevisionItem, Subject } from '../types';
import { t } from '../i18n';
import { APP_NAME } from '../appInfo';
import { planningSettingsFromValues } from '../utils/planningSettings';
import { getTodayIso } from '../utils/dateUtils';
import { PlanningDialogs, PlanningTab, usePlanningDraft } from './settings/PlanningTab';
import { SubjectDeleteDialog, SubjectsTab, useSubjectsDraft } from './settings/SubjectsTab';
import { DisplayTab, useDisplayDraft } from './settings/DisplayTab';
import { CloudTab, useEmailLoginForm } from './settings/CloudTab';
import { HelpTab } from './settings/HelpTab';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  /** Enregistre aussitôt la liste des types de liens (commune à tous les cours). */
  onChangeLinkTypes: (types: LinkType[]) => void;
  /** Supprime une période de révision (tout de suite), avec ou sans ses R à venir. */
  onDeleteRevisionPeriod?: (periodId: string, removePendingReviews: boolean) => void;
  /** Faux sans configuration Firebase : l'onglet Cloud explique comment la brancher. */
  cloudAvailable?: boolean;
  subjects: Subject[];
  onSaveSubjects: (newSubjects: Subject[]) => void;
  /** Sort des cours d'une matière qu'on supprime : les rattacher à une autre matière ou les supprimer. */
  onResolveSubjectCourses?: (
    subjectId: string,
    resolution: { kind: 'reassign'; toSubjectId: string } | { kind: 'delete' }
  ) => void;
  courses: Course[];
  revisions: RevisionItem[];
  onExportBackup: () => void;
  /** Contenu de l'export JSON, pour l'envoyer sur Google Drive. */
  onBuildBackup: () => { json: string; fileName: string };
  /** Renvoie true si les données ont été remplacées (false : fichier invalide ou import annulé). */
  onImportBackup: (jsonContent: string) => Promise<boolean>;
  onResetSeedData: () => void;
  currentUser?: { uid?: string | null; email?: string | null; displayName?: string | null; isAnonymous?: boolean } | null;
  onLoginWithEmail?: (email: string, pass: string) => Promise<void>;
  onRegisterWithEmail?: (email: string, pass: string) => Promise<void>;
  onLoginWithGoogle?: () => void;
  onLoginWithGoogleRedirect?: () => void;
  onLogout?: () => void;
  onSyncCloudNow?: () => void;
  isSyncing?: boolean;
  /** Versions mises de côté avant un écrasement local/cloud (la plus récente d'abord). */
  safetyBackups?: { at: string; reason: string; courses: number; revisions: number }[];
  onRestoreSafetyBackup?: (index: number) => void;
  initialTab?: 'subjects' | 'planning' | 'preferences' | 'backup' | 'help';
  authError?: { code?: string; message: string; resolution?: string } | null;
  onClearAuthError?: () => void;
}

/**
 * Fenêtre des réglages. Chaque onglet a son fichier dans `settings/` ; l'état de chaque onglet vit ici (hooks `use…Draft`),
 * pour qu'un changement d'onglet ne perde pas une saisie. Disciplines et types de liens s'enregistrent tout de suite ;
 * le reste avec le bouton « Enregistrer les préférences ».
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onChangeLinkTypes,
  onDeleteRevisionPeriod,
  cloudAvailable = true,
  subjects,
  onSaveSubjects,
  onResolveSubjectCourses,
  courses,
  revisions,
  onExportBackup,
  onBuildBackup,
  onImportBackup,
  currentUser,
  onLoginWithEmail,
  onRegisterWithEmail,
  onLoginWithGoogle,
  onLoginWithGoogleRedirect,
  onLogout,
  onSyncCloudNow,
  isSyncing = false,
  safetyBackups = [],
  onRestoreSafetyBackup,
  initialTab = 'subjects',
  authError,
  onClearAuthError,
}) => {
  const planning = usePlanningDraft(settings);
  const subjectsDraft = useSubjectsDraft(subjects);
  const display = useDisplayDraft(settings);
  const login = useEmailLoginForm();
  const { localSubjects } = subjectsDraft;

  // Active tab in settings modal
  const [activeTab, setActiveTab] = useState<'subjects' | 'planning' | 'preferences' | 'backup' | 'help'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Les brouillons Planning et Affichage reprennent les réglages enregistrés à l'ouverture seulement : une écriture
  // immédiate pendant que la fenêtre est ouverte (discipline, type de lien, agenda) ne doit pas effacer une saisie
  // en cours. L'enregistrement part des réglages les plus récents (`...settings`), puis applique les brouillons.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      planning.reset(settings);
      display.reset(settings);
    }
    wasOpenRef.current = isOpen;
    // Les fonctions `reset` ne dépendent que des setters (stables)
  }, [isOpen, settings]);

  // La liste des disciplines s'enregistre à chaque modification : elle suit simplement la liste enregistrée
  useEffect(() => {
    if (isOpen) subjectsDraft.reset(subjects);
  }, [isOpen, subjects]);

  if (!isOpen) return null;

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      ...settings,
      ...planningSettingsFromValues(planning.values),
      theme: display.theme,
      language: display.language,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={handleSaveAll}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('Préférences & Réglages {app}', { app: APP_NAME })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Disciplines, planning, affichage et sauvegardes')}
                </p>
              </div>
            </div>
            <button
              aria-label={t('Fermer')}
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs in Modal : tous les onglets visibles, sans défilement horizontal */}
          <div className="grid grid-cols-5 gap-1 px-3 sm:px-6 pt-3 border-b border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs font-bold">
            {(
              [
                { id: 'preferences', icon: Layers, label: t('Affichage'), title: t('Langue, thème, types de liens') },
                { id: 'subjects', icon: Palette, label: t('Disciplines'), title: t('Disciplines & Couleurs ({n})', { n: localSubjects.length }) },
                { id: 'planning', icon: Clock, label: t('Planning'), title: t('Répétitions, créneaux, journée de travail') },
                { id: 'backup', icon: Cloud, label: t('Cloud'), title: t('Cloud & Sauvegardes') },
                { id: 'help', icon: HelpCircle, label: t('Aide'), title: t('Aide') },
              ] as const
            ).map(({ id, icon: Icon, label, title }) => (
              <button
                key={id}
                type="button"
                title={title}
                aria-label={title}
                onClick={() => setActiveTab(id)}
                className={`pb-2.5 px-1 border-b-2 transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center leading-tight ${
                  activeTab === id
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5 max-h-[68vh] overflow-y-auto">
            {activeTab === 'subjects' && (
              <SubjectsTab draft={subjectsDraft} courses={courses} onSaveSubjects={onSaveSubjects} />
            )}
            {activeTab === 'planning' && (
              <PlanningTab
                draft={planning}
                courses={courses}
                periods={
                  onDeleteRevisionPeriod
                    ? { list: settings.revisionPeriods ?? [], revisions, todayIso: getTodayIso(), onDelete: onDeleteRevisionPeriod }
                    : undefined
                }
              />
            )}
            {activeTab === 'preferences' && (
              <DisplayTab draft={display} settings={settings} courses={courses} onChangeLinkTypes={onChangeLinkTypes} />
            )}
            {activeTab === 'backup' && (
              <CloudTab
                cloudAvailable={cloudAvailable}
                currentUser={currentUser}
                authError={authError}
                onClearAuthError={onClearAuthError}
                onSyncCloudNow={onSyncCloudNow}
                isSyncing={isSyncing}
                onLogout={onLogout}
                onLoginWithGoogle={onLoginWithGoogle}
                onLoginWithGoogleRedirect={onLoginWithGoogleRedirect}
                onLoginWithEmail={onLoginWithEmail}
                onRegisterWithEmail={onRegisterWithEmail}
                onExportBackup={onExportBackup}
                onBuildBackup={onBuildBackup}
                onImportBackup={onImportBackup}
                onClose={onClose}
                courses={courses}
                revisions={revisions}
                subjects={subjects}
                settings={settings}
                onSaveSettings={onSaveSettings}
                safetyBackups={safetyBackups}
                onRestoreSafetyBackup={onRestoreSafetyBackup}
                login={login}
              />
            )}
            {activeTab === 'help' && <HelpTab courses={courses} />}
          </div>

          <PlanningDialogs draft={planning} />
          <SubjectDeleteDialog
            draft={subjectsDraft}
            courses={courses}
            onSaveSubjects={onSaveSubjects}
            onResolveSubjectCourses={onResolveSubjectCourses}
          />

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              {activeTab === 'help' ? t('Fermer') : t('Annuler')}
            </button>
            {activeTab !== 'help' && (
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('Enregistrer les préférences')}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

