import React from 'react';
import { ViewMode } from '../types';
import { formatMinutes } from '../utils/dateUtils';
import { Calendar, BookOpen, Clock, BarChart3, Settings, Columns, Plus, Sun, Moon, Cloud, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import { APP_NAME, APP_TAGLINE } from '../appInfo';

interface TopNavProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onOpenNewCourseModal: () => void;
  onOpenSettingsModal: (defaultTab?: string) => void;
  splitView: boolean;
  onToggleSplitView: () => void;
  todayWorkloadMinutes: number;
  todayCompletedCount: number;
  todayTotalCount: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentUser?: { email?: string | null; displayName?: string | null } | null;
  onLogin?: () => void;
  /** Faux quand l'app tourne sans configuration Firebase (usage local) : pas de bouton de connexion. */
  cloudAvailable?: boolean;
  isSyncing?: boolean;
  syncStatus?: 'synced' | 'pending' | 'offline' | 'conflict';
  onResolveSyncConflict?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentView,
  onViewChange,
  onOpenNewCourseModal,
  onOpenSettingsModal,
  splitView,
  onToggleSplitView,
  todayWorkloadMinutes,
  todayCompletedCount,
  todayTotalCount,
  theme,
  onToggleTheme,
  currentUser,
  onLogin,
  cloudAvailable = true,
  isSyncing,
  syncStatus = 'synced',
  onResolveSyncConflict,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="w-full px-2 sm:px-4 md:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4 max-w-full overflow-hidden">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onViewChange('agenda')}
            className="flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-lg p-1"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0">
              J
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white block leading-tight">
                {APP_NAME}
              </span>
              {APP_TAGLINE && (
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 block leading-none">
                  {t(APP_TAGLINE)}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation items (compact and responsive) */}
        <nav className="hidden md:flex items-center gap-1 shrink">
          <button
            onClick={() => onViewChange('agenda')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              currentView === 'agenda' || currentView === 'week' || currentView === 'month'
                ? 'bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>{t('Planning')}</span>
          </button>

          <button
            onClick={() => onViewChange('courses')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              currentView === 'courses'
                ? 'bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>{t('Cours')}</span>
          </button>

          <button
            onClick={() => onViewChange('session')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              currentView === 'session'
                ? 'bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{t('Minuteur')}</span>
          </button>

          <button
            onClick={() => onViewChange('stats')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              currentView === 'stats'
                ? 'bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>{t('Stats')}</span>
          </button>
        </nav>

        {/* Zone 3: Actions & iPad Split switch (shrink-0 to prevent cut-off!) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Today workload pill (only on extra large screens) */}
          <div className="hidden 2xl:flex items-center gap-2 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span>{t('Aujourd\'hui :')}</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
              {formatMinutes(todayWorkloadMinutes)}
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="tabular-nums">
              {todayCompletedCount}/{todayTotalCount}
            </span>
          </div>

          {/* Cloud Sync Status / Google Sign-in */}
          {currentUser ? (
            <button
              onClick={() =>
                syncStatus === 'conflict' && onResolveSyncConflict
                  ? onResolveSyncConflict()
                  : onOpenSettingsModal('backup')
              }
              title={
                syncStatus === 'conflict'
                  ? t('Conflit de synchronisation : cliquez pour choisir la version à conserver.')
                  : syncStatus === 'offline'
                  ? t('Hors ligne : vos modifications sont gardées sur cet appareil et seront envoyées au retour du réseau.')
                  : syncStatus === 'pending'
                  ? t('Modifications locales en attente d\'envoi vers le cloud.')
                  : t('Cloud Firebase connecté ({email}). Données synchronisées. Cliquez pour gérer la synchronisation.', { email: currentUser.email ?? '' })
              }
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-teal-50/70 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-200 dark:border-teal-800 rounded-xl transition-colors shrink-0"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 animate-spin shrink-0" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              )}
              <span className="hidden md:inline">{t('Cloud')}</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  syncStatus === 'conflict'
                    ? 'bg-rose-500 animate-pulse'
                    : syncStatus === 'offline'
                    ? 'bg-slate-400'
                    : syncStatus === 'pending'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-emerald-500'
                }`}
              />
              {/* « En attente » = juste la pastille orange qui clignote : un texte ferait bouger la barre à chaque modification */}
              {(syncStatus === 'conflict' || syncStatus === 'offline') && (
                <span className="hidden lg:inline text-[10px] font-bold">
                  {syncStatus === 'conflict' ? t('Conflit') : t('Hors ligne')}
                </span>
              )}
            </button>
          ) : cloudAvailable ? (
            <button
              onClick={onLogin}
              title={t('Connecter votre compte Google pour activer la synchronisation Cloud gratuite')}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors shrink-0"
            >
              <Cloud className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="hidden sm:inline">{t('Sync Cloud')}</span>
            </button>
          ) : null}

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? t('Passer en thème clair') : t('Passer en thème sombre')}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* iPad 13" Multitasking Split View toggle - compact */}
          <button
            onClick={onToggleSplitView}
            title={splitView ? t('Désactiver le mode écran scindé (iPad Multitâche)') : t('Activer le mode écran scindé (iPad 13" Multitâche)')}
            className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all shrink-0 ${
              splitView
                ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Columns className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('Split')}</span>
          </button>

          {/* Primary CTA: Add Course */}
          <button
            onClick={onOpenNewCourseModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl transition-colors shadow-xs shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t('Nouveau cours')}</span>
            <span className="sm:hidden">{t('Nouveau')}</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => onOpenSettingsModal()}
            title={t('Préférences (Matières, Couleurs, J par défaut, Sauvegarde)')}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile subnavigation bar */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 px-2 py-1 text-xs">
        <button
          onClick={() => onViewChange('agenda')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentView === 'agenda' || currentView === 'week' || currentView === 'month'
              ? 'text-teal-700 dark:text-teal-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4 mb-0.5" />
          <span>{t('Planning')}</span>
        </button>
        <button
          onClick={() => onViewChange('courses')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentView === 'courses'
              ? 'text-teal-700 dark:text-teal-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span>{t('Cours')}</span>
        </button>
        <button
          onClick={() => onViewChange('session')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentView === 'session'
              ? 'text-teal-700 dark:text-teal-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Clock className="w-4 h-4 mb-0.5" />
          <span>{t('Minuteur')}</span>
        </button>
        <button
          onClick={() => onViewChange('stats')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentView === 'stats'
              ? 'text-teal-700 dark:text-teal-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4 mb-0.5" />
          <span>{t('Stats')}</span>
        </button>
      </div>
    </header>
  );
};
