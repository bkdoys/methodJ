import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppSettings, Course, RevisionItem, Subject, ToastMessage, ViewMode } from './types';
import {
  loadStoredData,
  getLastUid,
  saveStoredData,
  exportBackupJson,
  parseImportBackupJson,
} from './utils/storage';
import { getTodayIso, formatMinutes } from './utils/dateUtils';
import { getInitialSeedCoursesAndRevisions, DEFAULT_SETTINGS } from './utils/seedData';
import { DEFAULT_SUBJECTS } from './utils/demoContent';
import { isCloudConfigured } from './utils/firebase';
import { setLang, useLang } from './i18n';
import { APP_NAME } from './appInfo';
import { TopNav } from './components/TopNav';
import { CalendarPlanningView } from './components/CalendarPlanningView';
import { CourseCatalogView } from './components/CourseCatalogView';
import { StudySessionTimer } from './components/StudySessionTimer';
import { StatsProgressView } from './components/StatsProgressView';
import { NewCourseModal } from './components/NewCourseModal';
import { QuickShiftModal } from './components/QuickShiftModal';
import { CompleteRevisionModal } from './components/CompleteRevisionModal';
import { SettingsModal } from './components/SettingsModal';
import { CourseDetailModal } from './components/CourseDetailModal';
import { SlotDetailModal } from './components/SlotDetailModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { SyncData } from './utils/cloudSync';
import { ToastBanner } from './components/ToastBanner';
import { useCloudSync } from './hooks/useCloudSync';
import { useAuthActions } from './hooks/useAuthActions';
import { useStudyData } from './hooks/useStudyData';
import { flashSlot } from './utils/flashSlot';
import { getLinkTypes } from './utils/courseLinks';
import { t } from './i18n';

export default function App() {
  // Main loaded state
  const [dataLoaded, setDataLoaded] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Navigation & selection
  const [currentView, setCurrentView] = useState<ViewMode>('agenda');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIso());
  const [activeSessionRevisionId, setActiveSessionRevisionId] = useState<string | undefined>();
  const [splitViewMode, setSplitViewMode] = useState<boolean>(true);
  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modals state
  const [isNewCourseOpen, setIsNewCourseOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'subjects' | 'jPattern' | 'preferences' | 'backup' | 'help'>('subjects');
  const [shiftingRevision, setShiftingRevision] = useState<RevisionItem | null>(null);
  const [completingRevision, setCompletingRevision] = useState<RevisionItem | null>(null);
  const [selectedCourseForDetail, setSelectedCourseForDetail] = useState<Course | null>(null);
  // Fiche d'un créneau J (clic sur le planning) ; on garde l'id pour afficher toujours la version à jour
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // Toast Notification for cascade shifts or actions
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const stateRef = useRef({ courses, revisions, subjects, settings });
  useEffect(() => {
    stateRef.current = { courses, revisions, subjects, settings };
  }, [courses, revisions, subjects, settings]);

  const applyDataToState = useCallback((d: SyncData) => {
    setCourses(d.courses);
    setRevisions(d.revisions);
    setSubjects(d.subjects);
    setSettings(d.settings);
  }, []);

  // Compte Firebase + synchro cloud avec garde-fou anti-écrasement (voir hooks/useCloudSync.ts)
  const {
    currentUser,
    isSyncing,
    setIsSyncing,
    syncStatus,
    syncConflict,
    conflictDialogOpen,
    openConflictDialog,
    closeConflictDialog,
    isResolvingConflict,
    safetyBackups,
    syncNow,
    keepCloud,
    keepLocal,
    restoreSafetyBackup,
    backupBeforeImport,
    pushImportedData,
  } = useCloudSync({
    dataLoaded,
    data: { courses, revisions, subjects, settings },
    stateRef,
    applyData: applyDataToState,
    notify: setToastMessage,
  });

  // Connexions / déconnexion Firebase (voir hooks/useAuthActions.ts)
  const {
    authError,
    clearAuthError,
    handleLoginGoogle,
    handleLoginGoogleRedirect,
    handleLoginEmail,
    handleRegisterEmail,
    handleLogout,
  } = useAuthActions({ setIsSyncing, notify: setToastMessage });

  // Actions sur cours, créneaux et matières (voir hooks/useStudyData.ts)
  const {
    handleSaveNewCourse,
    handleConfirmShift,
    handleConfirmComplete,
    handleUndoComplete,
    handleUpdateCourse,
    handleUpdateCourseMastery,
    handleChangeLinkTypes,
    handleUpdateCourseNotes,
    handleDeleteCourse,
    handleSaveSubjects,
    handleResolveSubjectCourses,
    handleUpdateSubjectFolders,
    handleMoveSlots,
    handleResizeSlot,
    handleUpdateSlotNotes,
    handleMoveSlotToDay,
  } = useStudyData({
    courses,
    revisions,
    subjects,
    settings,
    setCourses,
    setRevisions,
    setSubjects,
    setSettings,
    cloudUid: currentUser?.uid,
    notify: setToastMessage,
    setSelectedCourseForDetail,
  });

  // La page se redessine quand la langue change ; le réglage enregistré (aussi synchronisé) l'emporte
  useLang();
  useEffect(() => {
    if (settings.language) setLang(settings.language);
  }, [settings.language]);

  // Load from local storage on mount
  useEffect(() => {
    const loaded = loadStoredData(getLastUid());
    setCourses(loaded.courses);
    setRevisions(loaded.revisions);
    setSubjects(loaded.subjects);
    setSettings(loaded.settings);
    setSplitViewMode(loaded.settings.splitView);
    setDataLoaded(true);

    // Apply saved theme to html element
    if (loaded.settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Sync to local storage whenever state changes
  useEffect(() => {
    if (dataLoaded) {
      saveStoredData(courses, revisions, subjects, settings, currentUser?.uid ?? getLastUid());
    }
  }, [courses, revisions, subjects, settings, dataLoaded, currentUser]);

  // Sync theme changes to html class
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      // 3 s pour un message simple ; un bouton (ex. « Annuler ») ou une erreur restent 5 s
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, toastMessage.action || toastMessage.type === 'error' ? 5000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Handler: Toggle light / dark theme
  const handleToggleTheme = useCallback(() => {
    setSettings((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  // Handler: Open Settings modal with specific tab
  const handleOpenSettingsModal = (defaultTab?: string) => {
    if (defaultTab && ['subjects', 'jPattern', 'preferences', 'backup', 'help'].includes(defaultTab)) {
      setSettingsTab(defaultTab as 'subjects' | 'jPattern' | 'preferences' | 'backup' | 'help');
    }
    setIsSettingsOpen(true);
  };

  // Handler: Start focus session

  // Vue affichée avant l'ouverture du chronomètre, pour y revenir à la fermeture
  const viewBeforeSessionRef = useRef<ViewMode>('agenda');

  const handleStartStudySession = (revision: RevisionItem) => {
    if (currentView !== 'session') viewBeforeSessionRef.current = currentView;
    setActiveSessionRevisionId(revision.id);
    setCurrentView('session');
  };

  // Ferme la vue chrono (second clic sur « Lancer »)
  const handleCloseStudySession = () => {
    const back = viewBeforeSessionRef.current;
    setCurrentView(back === 'session' ? 'agenda' : back);
  };

  // Handler: Export / Import JSON
  const handleExportBackup = useCallback(() => {
    exportBackupJson({ courses, revisions, subjects, settings });
  }, [courses, revisions, subjects, settings]);

  const handleImportBackup = async (jsonContent: string) => {
    const imported = parseImportBackupJson(jsonContent);
    if (imported) {
      backupBeforeImport();
      setCourses(imported.courses);
      setRevisions(imported.revisions);
      setSubjects(imported.subjects);
      setSettings(imported.settings);
      setToastMessage({
        title: t('Données importées'),
        description: t('{courses} cours et {revisions} révisions restaurés.', { courses: imported.courses.length, revisions: imported.revisions.length }),
        type: 'success',
      });
      if (currentUser) {
        try {
          await pushImportedData(imported);
        } catch (err) {
          console.warn('Could not sync imported data to Cloud immediately:', err);
        }
      }
    } else {
      setToastMessage({
        title: t('Erreur d\'import'),
        description: t('Le fichier JSON de sauvegarde est invalide.'),
        type: 'error',
      });
    }
  };

  const handleResetSeedData = () => {
    const initial = getInitialSeedCoursesAndRevisions();
    setCourses(initial.courses);
    setRevisions(initial.revisions);
    setSubjects(DEFAULT_SUBJECTS);
    setSettings(DEFAULT_SETTINGS);
    setToastMessage({
      title: t('Exemples réinitialisés'),
      description: t('Les cours d\'exemple ont été réinitialisés.'),
      type: 'info',
    });
  };

  const handleToggleSplitView = () => {
    const nextVal = !splitViewMode;
    setSplitViewMode(nextVal);
    setSettings((prev) => ({ ...prev, splitView: nextVal }));
  };

  // Calculate today's workload for TopNav
  const todayIso = getTodayIso();
  const todayRevisions = useMemo(
    () => revisions.filter((r) => r.scheduledDate === todayIso),
    [revisions, todayIso]
  );
  const todayWorkloadMinutes = useMemo(
    () => todayRevisions.reduce((acc, r) => acc + r.durationMinutes, 0),
    [todayRevisions]
  );
  const todayCompletedCount = useMemo(
    () => todayRevisions.filter((r) => r.completed).length,
    [todayRevisions]
  );

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{t('Chargement de votre planning {app}...', { app: APP_NAME })}</p>
        </div>
      </div>
    );
  }

  // Selected revision course object
  const selectedSlot = selectedSlotId ? revisions.find((r) => r.id === selectedSlotId) : undefined;
  const selectedSlotCourse = selectedSlot ? courses.find((c) => c.id === selectedSlot.courseId) : undefined;
  const shiftingCourse = shiftingRevision
    ? courses.find((c) => c.id === shiftingRevision.courseId)
    : null;
  const completingCourse = completingRevision
    ? courses.find((c) => c.id === completingRevision.courseId)
    : null;

  // Depuis la vue Cours : ouvre le planning sur le jour du créneau et le met en évidence
  const handleGoToSlot = (date: string, revisionId: string) => {
    setSelectedDate(date);
    // En vue partagée le planning est déjà à gauche ; sinon on bascule dessus
    if (!(splitViewMode && isLargeScreen)) setCurrentView('agenda');
    flashSlot(revisionId);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Top Navigation */}
      <TopNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenNewCourseModal={() => setIsNewCourseOpen(true)}
        onOpenSettingsModal={handleOpenSettingsModal}
        splitView={splitViewMode}
        onToggleSplitView={handleToggleSplitView}
        todayWorkloadMinutes={todayWorkloadMinutes}
        todayCompletedCount={todayCompletedCount}
        todayTotalCount={todayRevisions.length}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        currentUser={currentUser}
        onLogin={() => handleOpenSettingsModal('backup')}
        cloudAvailable={isCloudConfigured}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        onResolveSyncConflict={openConflictDialog}
      />

      {/* Conflit de synchro mis en attente : rappel discret */}
      {syncConflict && !conflictDialogOpen && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 shadow-lg text-xs text-amber-900 dark:text-amber-200">
          <span>{t('Synchronisation en pause : conflit entre cet appareil et le Cloud.')}</span>
          <button
            type="button"
            onClick={openConflictDialog}
            className="font-bold underline underline-offset-2"
          >
            {t('Résoudre')}
          </button>
        </div>
      )}

      {syncConflict && conflictDialogOpen && (
        <SyncConflictModal
          local={{ courses, revisions, subjects, settings }}
          cloud={syncConflict.cloud}
          localSyncedAt={syncConflict.localSyncedAt}
          cloudStamp={syncConflict.cloudStamp}
          busy={isResolvingConflict}
          onKeepCloud={keepCloud}
          onKeepLocal={keepLocal}
          onDefer={closeConflictDialog}
        />
      )}

      {/* Toast Notification Banner */}
      {toastMessage && <ToastBanner toast={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Main App Content Viewport */}
      <main className="flex-1 w-full px-1.5 sm:px-2 py-4 sm:py-6">
        {/* iPad Multitasking Split View Layout */}
        {splitViewMode && isLargeScreen && currentView !== 'stats' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (5 cols): Daily Stacked Agenda */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('Planning & Calendrier')}
                </span>
                <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
                  {t('{d} prévues', { d: formatMinutes(todayWorkloadMinutes) })}
                </span>
              </div>

              <CalendarPlanningView
                revisions={revisions}
                courses={courses}
                subjects={subjects}
                settings={settings}
                isSplitView={true}
                activeSessionRevisionId={currentView === 'session' ? activeSessionRevisionId : undefined}
                onCloseStudySession={handleCloseStudySession}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onOpenQuickShift={(rev) => setShiftingRevision(rev)}
                onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
                onStartStudySession={handleStartStudySession}
                onOpenNewCourseModal={() => setIsNewCourseOpen(true)}
                onOpenSlotDetail={(rev) => setSelectedSlotId(rev.id)}
                onMoveSlots={handleMoveSlots}
                onMoveToDay={handleMoveSlotToDay}
                onChangeSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              />
            </div>

            {/* Right Column (7 cols): Dynamic Second Workspace */}
            <div className="lg:col-span-7 space-y-4">
              {currentView === 'session' ? (
                <StudySessionTimer
                  linkTypes={getLinkTypes(settings)}
                  revisions={revisions}
                  courses={courses}
                  subjects={subjects}
                  activeRevisionId={activeSessionRevisionId}
                  onSelectRevision={setActiveSessionRevisionId}
                  onCompleteRevision={handleConfirmComplete}
                />
              ) : (
                <CourseCatalogView
                  courses={courses}
                  revisions={revisions}
                  subjects={subjects}
                  settings={settings}
                  onUpdateCourseMastery={handleUpdateCourseMastery}
                  onOpenQuickShift={(rev) => setShiftingRevision(rev)}
                  onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
                  onOpenNewCourseModal={() => setIsNewCourseOpen(true)}
                  onDeleteCourse={handleDeleteCourse}
                  onUpdateCourseNotes={handleUpdateCourseNotes}
                  onOpenCourseDetail={(c) => setSelectedCourseForDetail(c)}
                  onGoToDate={handleGoToSlot}
                  onMoveCourse={(id, node) => {
                    const c = courses.find((x) => x.id === id);
                    if (c && (c.subjectId !== node.subjectId || c.folderId !== node.folderId)) {
                      handleUpdateCourse(id, { subjectId: node.subjectId, folderId: node.folderId });
                    }
                  }}
                  onUpdateSubjectFolders={handleUpdateSubjectFolders}
                />
              )}
            </div>
          </div>
        ) : (
          /* Standard Full-width View (when split mode is turned off or on Stats) */
          <div>
            {currentView === 'agenda' || currentView === 'week' || currentView === 'month' ? (
              <CalendarPlanningView
                revisions={revisions}
                courses={courses}
                subjects={subjects}
                settings={settings}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onOpenQuickShift={(rev) => setShiftingRevision(rev)}
                onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
                onStartStudySession={handleStartStudySession}
                onOpenNewCourseModal={() => setIsNewCourseOpen(true)}
                onOpenSlotDetail={(rev) => setSelectedSlotId(rev.id)}
                onMoveSlots={handleMoveSlots}
                onMoveToDay={handleMoveSlotToDay}
                onChangeSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              />
            ) : currentView === 'courses' ? (
              <CourseCatalogView
                courses={courses}
                revisions={revisions}
                subjects={subjects}
                settings={settings}
                onUpdateCourseMastery={handleUpdateCourseMastery}
                onOpenQuickShift={(rev) => setShiftingRevision(rev)}
                onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
                onOpenNewCourseModal={() => setIsNewCourseOpen(true)}
                onDeleteCourse={handleDeleteCourse}
                onUpdateCourseNotes={handleUpdateCourseNotes}
                onOpenCourseDetail={(c) => setSelectedCourseForDetail(c)}
                onGoToDate={handleGoToSlot}
                  onMoveCourse={(id, node) => {
                    const c = courses.find((x) => x.id === id);
                    if (c && (c.subjectId !== node.subjectId || c.folderId !== node.folderId)) {
                      handleUpdateCourse(id, { subjectId: node.subjectId, folderId: node.folderId });
                    }
                  }}
                  onUpdateSubjectFolders={handleUpdateSubjectFolders}
              />
            ) : currentView === 'session' ? (
              <StudySessionTimer
                linkTypes={getLinkTypes(settings)}
                revisions={revisions}
                courses={courses}
                subjects={subjects}
                activeRevisionId={activeSessionRevisionId}
                onSelectRevision={setActiveSessionRevisionId}
                onCompleteRevision={handleConfirmComplete}
              />
            ) : (
              <StatsProgressView
                courses={courses}
                revisions={revisions}
                subjects={subjects}
                dailyTargetHours={settings.dailyTargetHours}
                onOpenCourseDetail={(c) => setSelectedCourseForDetail(c)}
              />
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {/* 1. New Course Modal */}
      <NewCourseModal
        isOpen={isNewCourseOpen}
        onClose={() => setIsNewCourseOpen(false)}
        subjects={subjects}
        settings={settings}
        onUpdateSubject={(s) => handleUpdateSubjectFolders(s)}
        onChangeLinkTypes={handleChangeLinkTypes}
        onSaveCourse={handleSaveNewCourse}
      />

      {/* 2. Settings Modal (Disciplines, Colors, J presets, Dark mode, Backup) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => {
          setSettings(newSettings);
          setSplitViewMode(newSettings.splitView);
        }}
        subjects={subjects}
        onSaveSubjects={handleSaveSubjects}
        onChangeLinkTypes={handleChangeLinkTypes}
        onResolveSubjectCourses={handleResolveSubjectCourses}
        cloudAvailable={isCloudConfigured}
        courses={courses}
        revisions={revisions}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onResetSeedData={handleResetSeedData}
        currentUser={currentUser}
        onLoginWithEmail={handleLoginEmail}
        onRegisterWithEmail={handleRegisterEmail}
        onLoginWithGoogle={handleLoginGoogle}
        onLoginWithGoogleRedirect={handleLoginGoogleRedirect}
        onLogout={handleLogout}
        onSyncCloudNow={syncNow}
        isSyncing={isSyncing}
        safetyBackups={safetyBackups.map((b) => ({
          at: b.at,
          reason: b.reason,
          courses: b.data.courses.length,
          revisions: b.data.revisions.length,
        }))}
        onRestoreSafetyBackup={restoreSafetyBackup}
        initialTab={settingsTab}
        authError={authError}
        onClearAuthError={clearAuthError}
      />

      {/* 3. Course Detail & Title Edit Modal (opens when clicking any course in calendar or catalog) */}
      {selectedCourseForDetail && (
        <CourseDetailModal
          course={selectedCourseForDetail}
          revisions={revisions}
          subjects={subjects}
          onUpdateSubject={(s) => handleUpdateSubjectFolders(s)}
          onChangeLinkTypes={handleChangeLinkTypes}
          settings={settings}
          isOpen={true}
          onClose={() => {
            setSelectedCourseForDetail(null);
            setSelectedSlotId(null);
          }}
          onBackToSlot={selectedSlotId ? () => setSelectedCourseForDetail(null) : undefined}
          onOpenSlot={(rev) => {
            setSelectedSlotId(rev.id);
            setSelectedCourseForDetail(null);
          }}
          onUpdateCourse={handleUpdateCourse}
          onOpenQuickShift={(rev) => setShiftingRevision(rev)}
          onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
          onStartStudySession={handleStartStudySession}
          onDeleteCourse={handleDeleteCourse}
          onResizeSlot={handleResizeSlot}
        />
      )}

      {/* Fiche d'un créneau J : bascule vers la fiche du cours et retour */}
      {selectedSlot && selectedSlotCourse && !selectedCourseForDetail && (
        <SlotDetailModal
          revision={selectedSlot}
          course={selectedSlotCourse}
          subject={subjects.find((s) => s.id === selectedSlotCourse.subjectId)}
          revisions={revisions}
          settings={settings}
          onClose={() => setSelectedSlotId(null)}
          onOpenCourse={() => setSelectedCourseForDetail(selectedSlotCourse)}
          onResizeSlot={handleResizeSlot}
          onUpdateNotes={handleUpdateSlotNotes}
          onOpenCompleteModal={(rev) => setCompletingRevision(rev)}
          onOpenQuickShift={(rev) => setShiftingRevision(rev)}
          onStartStudySession={handleStartStudySession}
        />
      )}

      {/* 4. Quick Shift Modal (with automatic cascade, renders on top with z-[70]) */}
      {shiftingRevision && shiftingCourse && (
        <QuickShiftModal
          revision={shiftingRevision}
          course={shiftingCourse}
          subject={subjects.find((s) => s.id === shiftingCourse.subjectId)}
          allCourseRevisions={revisions}
          isOpen={true}
          onClose={() => setShiftingRevision(null)}
          onConfirmShift={handleConfirmShift}
        />
      )}

      {/* 5. Complete Revision Modal (knowledge rating, renders on top with z-[70]) */}
      {completingRevision && completingCourse && (
        <CompleteRevisionModal
          revision={completingRevision}
          course={completingCourse}
          revisions={revisions}
          subject={subjects.find((s) => s.id === completingCourse.subjectId)}
          isOpen={true}
          onClose={() => setCompletingRevision(null)}
          onConfirmComplete={handleConfirmComplete}
          onUndoComplete={handleUndoComplete}
        />
      )}
    </div>
  );
}
