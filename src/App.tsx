import { useState, useEffect, useRef, useMemo, useCallback, Suspense, type ComponentProps } from 'react';
import { AppSettings, CardReview, Course, RevisionItem, Subject, ToastMessage, ViewMode } from './types';
import {
  loadStoredData,
  getLastUid,
  saveStoredData,
  exportBackupJson,
  buildBackupJson,
  parseImportBackupJson,
  parseImportDecks,
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
import {
  StudySessionTimer,
  StatsProgressView,
  DashboardView,
  NewCourseModal,
  QuickShiftModal,
  CompleteRevisionModal,
  SettingsModal,
  CourseDetailModal,
  DeckEditor,
  FlashcardPlayer,
  FlashcardsView,
  CardsImportModal,
  CardCoursePicker,
  ApkgImportModal,
  RevisionPeriodModal,
  SlotDetailModal,
  SyncConflictModal,
  prefetchLazyViews,
  useMountedOnce,
} from './lazyViews';
import { SyncData, getSyncMeta } from './utils/cloudSync';
import { computeDashboard, countAlerts } from './utils/dashboard';
import { FreeCourseAlert, findFreeCourseAlerts, snoozeFreeAlert } from './utils/freeAlerts';
import { INBOX_COURSE_ID, isInboxCourse, makeInboxCourse, withoutInbox } from './utils/inbox';
import { findAlertDays } from './utils/dayLoad';
import { ToastBanner } from './components/ToastBanner';
import { DeleteCourseDialog } from './components/DeleteCourseDialog';
import { useCloudSync } from './hooks/useCloudSync';
import { useAuthActions } from './hooks/useAuthActions';
import { useStudyData } from './hooks/useStudyData';
import { useDecks } from './hooks/useDecks';
import { useReviewLog } from './hooks/useReviewLog';
import { entryFromReview, ReviewEvent } from './utils/reviewLog';
import { useTodayIso } from './hooks/useTodayIso';
import { flashSlot } from './utils/flashSlot';
import { getLinkTypes } from './utils/courseLinks';
import { addCard, CardInput, courseIdsInScope, DeckScope, deleteCard, describeScope, liveCards, newCardId } from './utils/flashcards';
import { courseCardCounts, dueToday, getNewCardsPerDay, newCardsRoom, shuffle, SessionItem, subCardItems } from './utils/cardSession';
import { formatIsoDate } from './utils/dateUtils';
import { shouldOfferPeriod } from './utils/revisionPeriod';
import { applyTextScale, getTextScale } from './utils/textScale';
import type { PlayKind } from './components/FlashcardsView';
import { getCourseEffectiveColor } from './utils/colorUtils';
import type { PlayMode } from './components/FlashcardPlayer';
import { plural, t } from './i18n';
import { useConfirm } from './components/ConfirmDialog';

export default function App() {
  const confirm = useConfirm();
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
  const [settingsTab, setSettingsTab] = useState<'subjects' | 'planning' | 'exam' | 'preferences' | 'backup' | 'help'>('subjects');
  const [shiftingRevision, setShiftingRevision] = useState<RevisionItem | null>(null);
  const [completingRevision, setCompletingRevision] = useState<RevisionItem | null>(null);
  const [selectedCourseForDetail, setSelectedCourseForDetail] = useState<Course | null>(null);
  // Fiche d'un créneau J (clic sur le planning) ; on garde l'id pour afficher toujours la version à jour
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // Séance de cartes (lecteur plein écran). Lancée depuis un créneau, elle se termine sur sa validation,
  // avec le bilan des cartes comme repère pour la note de maîtrise.
  const [cardPlay, setCardPlay] = useState<{
    title: string;
    color: string;
    items: SessionItem[];
    mode: PlayMode;
    revisionId?: string;
  } | null>(null);
  const [cardsSummary, setCardsSummary] = useState<{ revisionId: string; cards: number; success: number } | null>(null);
  // Import CSV de cartes ouvert (cours de destination proposé, s'il vient des cartes d'un cours)
  const [cardsImport, setCardsImport] = useState<{ defaultCourseId?: string } | null>(null);
  // Paquet Anki (.apkg) choisi dans la fenêtre d'import de cartes
  const [apkgFile, setApkgFile] = useState<File | null>(null);
  // Cours dont on rédige les cartes (fenêtre au-dessus de sa fiche)
  const [deckCourseId, setDeckCourseId] = useState<string | null>(null);
  // Carte à ouvrir en modification dans l'éditeur (résultat de recherche de la vue Cartes)
  const [deckCardId, setDeckCardId] = useState<string | null>(null);
  // « Cartes à trier » ouvertes pour ranger (et non pour ajouter une carte) : « Ranger » est mis en évidence
  const [deckFiling, setDeckFiling] = useState(false);
  const openDeck = (courseId: string, cardId?: string) => {
    setDeckCardId(cardId ?? null);
    setDeckCourseId(courseId);
    setDeckFiling(courseId === INBOX_COURSE_ID && !cardId);
  };
  // Choix du cours pour « Ajouter une carte » depuis la vue Cartes
  const [pickingCardCourse, setPickingCardCourse] = useState(false);
  // Suppression d'un cours qui contient des cartes : choix du sort des cartes, puis éventuellement du cours d'accueil
  const [deletingCourse, setDeletingCourse] = useState<{ id: string; step: 'choose' | 'pick' } | null>(null);
  const [lastCardCourseId, setLastCardCourseId] = useState<string | undefined>();

  // Fenêtres chargées à la demande : montées à la première ouverture, puis gardées (brouillon conservé)
  const newCourseMounted = useMountedOnce(isNewCourseOpen);
  // Assistant « Période de révision » : simulation pure, rien n'est gardé à la fermeture
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const settingsMounted = useMountedOnce(isSettingsOpen);

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

  // Paquets de cartes : sur l'appareil et dans le cloud, hors de la synchro du planning (voir hooks/useDecks.ts)
  const { decks, updateDeck, removeDecks, importDecks, moveCardsBetween, flushDecks } = useDecks({
    storageUid: currentUser?.uid ?? getLastUid(),
    cloudUid: currentUser?.uid,
  });
  // Journal des notes de cartes (historique des révisions, voir hooks/useReviewLog.ts)
  const { reviewLog, recordReview, undoReview, flushReviewLog } = useReviewLog({
    storageUid: currentUser?.uid ?? getLastUid(),
    cloudUid: currentUser?.uid,
  });

  // Ajoute les cartes importées, cours par cours, avec un « Annuler » qui les retire
  const handleImportCards = (byCourse: Record<string, CardInput[]>) => {
    const now = new Date().toISOString();
    const added: [string, string[]][] = Object.entries(byCourse).map(([courseId, inputs]) => {
      const ids = inputs.map(() => newCardId());
      updateDeck(courseId, (d) => inputs.reduce((acc, input, i) => addCard(acc, input, now, ids[i]), d));
      return [courseId, ids];
    });
    const total = added.reduce((n, [, ids]) => n + ids.length, 0);
    setCardsImport(null);
    setToastMessage({
      title: t('Cartes importées'),
      description: plural(total, '{n} carte ajoutée.', '{n} cartes ajoutées.'),
      type: 'success',
      action: {
        label: t('Annuler'),
        onClick: () => {
          const at = new Date().toISOString();
          added.forEach(([courseId, ids]) => updateDeck(courseId, (d) => ids.reduce((acc, id) => deleteCard(acc, id, at), d)));
        },
      },
    });
  };

  // Déplace des cartes vers un autre cours (historique compris), avec un « Annuler » qui les ramène
  const handleMoveCards = (fromId: string, toId: string, ids: string[]): boolean => {
    const target = courses.find((c) => c.id === toId);
    const moved = moveCardsBetween(fromId, toId, ids);
    if (moved === null) {
      setToastMessage({
        title: t('Déplacement impossible'),
        description: t('Le cours « {title} » n\'a pas la place pour ces cartes.', { title: target?.title ?? '' }),
        type: 'error',
      });
      return false;
    }
    if (moved > 0) {
      setToastMessage({
        title: plural(moved, '{n} carte déplacée', '{n} cartes déplacées'),
        description: t('Vers « {title} ».', { title: target?.title ?? '' }),
        type: 'success',
        action: { label: t('Annuler'), onClick: () => moveCardsBetween(toId, fromId, ids) },
      });
    }
    return true;
  };

  // Séance sur un périmètre (vue Cartes, tableau de bord) : cartes du jour, ou toutes les cartes mélangées
  const playScope = (scope: DeckScope, kind: PlayKind, cram: boolean) => {
    const ids = courseIdsInScope(scope, courses, subjects);
    const now = new Date();
    let items: SessionItem[];
    if (kind === 'today') {
      const d = dueToday(decks, ids, now, formatIsoDate(now), getNewCardsPerDay(settings));
      items = [...d.due, ...shuffle(d.fresh, now.getTime())];
    } else {
      items = shuffle(subCardItems(decks, ids), now.getTime());
    }
    const { title, color } = describeScope(scope, courses, subjects, kind === 'today' ? t('Cartes du jour') : t('Toutes les cartes'));
    setCardPlay({ title, color, items, mode: kind === 'all' && cram ? 'cram' : 'schedule' });
  };

  // Les notes restent sur l'appareil pendant la séance ; elles partent vers le cloud à la fin (flushDecks)
  const handleCardReview = useCallback(
    (courseId: string, key: string, review: CardReview | undefined, event: ReviewEvent) => {
      if ('undone' in event) {
        if (event.undone.lastReview) undoReview({ t: event.undone.lastReview, c: courseId, k: key });
      } else if (review) {
        const entry = entryFromReview(courseId, key, review, event.grade, event.before);
        if (entry) recordReview(entry);
      }
      updateDeck(
        courseId,
        (d) => {
          const next = { ...d.review };
          if (review) next[key] = review;
          else delete next[key];
          return { ...d, review: next };
        },
        { defer: true }
      );
    },
    [updateDeck, recordReview, undoReview]
  );

  // Actions sur cours, créneaux et matières (voir hooks/useStudyData.ts)
  const {
    handleImportApkg,
    handleApplyRevisionPeriod,
    handleDeleteRevisionPeriod,
    handleSaveNewCourse,
    handleAddReview,
    handleDeleteReview,
    handleConvertCourseToJ,
    handleConvertCourseToFree,
    handleConfirmShift,
    handleApplyShifts,
    handleConfirmComplete,
    handleUndoComplete,
    handleUpdateCourse,
    handleResetCourseColors,
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
    onCoursesDeleted: removeDecks,
    onDeckReplaced: (courseId, deck) => updateDeck(courseId, () => deck),
    onCardsRemoved: (idsByCourse) => {
      const at = new Date().toISOString();
      Object.entries(idsByCourse).forEach(([courseId, ids]) =>
        updateDeck(courseId, (d) => ids.reduce((acc, id) => deleteCard(acc, id, at), d))
      );
    },
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
    prefetchLazyViews();

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

  // Taille du texte : suit les réglages (palier mémorisé sur l'appareil pour le prochain démarrage)
  useEffect(() => {
    applyTextScale(getTextScale(settings));
  }, [settings.textScale]);

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
    if (defaultTab && ['subjects', 'planning', 'preferences', 'backup', 'help'].includes(defaultTab)) {
      setSettingsTab(defaultTab as 'subjects' | 'planning' | 'exam' | 'preferences' | 'backup' | 'help');
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
    exportBackupJson({ courses, revisions, subjects, settings }, Object.values(decks));
  }, [courses, revisions, subjects, settings, decks]);
  const handleBuildBackup = useCallback(
    () => buildBackupJson({ courses, revisions, subjects, settings }, Object.values(decks)),
    [courses, revisions, subjects, settings, decks]
  );

  // Renvoie false si le fichier est invalide ou si l'utilisateur annule (la fenêtre des réglages reste ouverte)
  const handleImportBackup = async (jsonContent: string): Promise<boolean> => {
    const imported = parseImportBackupJson(jsonContent);
    if (imported) {
      const ok = await confirm({
        title: t('Remplacer vos données ?'),
        message:
          t('Actuellement : {courses} cours et {revisions} révisions. Dans le fichier : {newCourses} cours et {newRevisions} révisions.', {
            courses: courses.length,
            revisions: revisions.length,
            newCourses: imported.courses.length,
            newRevisions: imported.revisions.length,
          }) +
          '\n\n' +
          (currentUser
            ? t('Vos données actuelles seront mises de côté et restaurables depuis Réglages > Cloud.')
            : t('Une copie de vos données actuelles sera d\'abord téléchargée.')),
        confirmLabel: t('Remplacer'),
        tone: 'danger',
      });
      if (!ok) return false;
      // Garde-fou : version mise de côté (compte) ou fichier téléchargé (usage local)
      if (currentUser) backupBeforeImport();
      else exportBackupJson({ courses, revisions, subjects, settings }, Object.values(decks));
      setCourses(imported.courses);
      setRevisions(imported.revisions);
      setSubjects(imported.subjects);
      setSettings(imported.settings);
      // Les cartes du fichier s'ajoutent à celles de l'appareil (fusion, rien n'est écrasé)
      importDecks(parseImportDecks(jsonContent));
      setToastMessage({
        title: t('Données importées'),
        description: t('{courses} cours et {revisions} révisions restaurés.', { courses: imported.courses.length, revisions: imported.revisions.length }),
        type: 'success',
      });
      if (currentUser) {
        pushImportedData(imported).catch((err) => {
          console.warn('Could not sync imported data to Cloud immediately:', err);
        });
      }
      return true;
    } else {
      setToastMessage({
        title: t('Erreur d\'import'),
        description: t('Le fichier JSON de sauvegarde est invalide.'),
        type: 'error',
      });
      return false;
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

  // Date du jour, mise à jour à minuit : toute l'app se redessine avec la nouvelle date
  const todayIso = useTodayIso();
  // Au changement de jour, le planning resté sur « aujourd'hui » suit la nouvelle date
  const prevTodayRef = useRef(todayIso);
  useEffect(() => {
    const prev = prevTodayRef.current;
    prevTodayRef.current = todayIso;
    if (prev !== todayIso) setSelectedDate((d) => (d === prev ? todayIso : d));
  }, [todayIso]);

  // Cartes du jour, tous cours confondus (pastille de l'onglet Cartes, tableau de bord)
  const cardsToday = useMemo(() => {
    const now = new Date();
    const known = new Set(courses.map((c) => c.id));
    const counts = Object.entries(courseCardCounts(decks, now)).filter(([id]) => known.has(id)).map(([, c]) => c);
    const due = counts.reduce((n, c) => n + c.due, 0);
    const fresh = Math.min(
      counts.reduce((n, c) => n + c.fresh, 0),
      newCardsRoom(decks, formatIsoDate(now), getNewCardsPerDay(settings))
    );
    return { due, fresh, total: counts.reduce((n, c) => n + c.total, 0) };
    // todayIso : recalcul au changement de jour
  }, [decks, courses, settings, todayIso]);

  // Les cours sans la boîte « Cartes à trier » : c'est ce que voient le catalogue, le planning, les stats et le tableau
  // de bord. La boîte n'apparaît que dans la vue Cartes et comme rappel sur le tableau de bord (voir utils/inbox.ts).
  const studyCourses = useMemo(() => withoutInbox(courses), [courses]);
  const inboxCards = useMemo(
    () => (courses.some(isInboxCourse) ? liveCards(decks[INBOX_COURSE_ID]).length : 0),
    [courses, decks]
  );
  // Carte sans cours : la boîte est créée à la première, puis réutilisée
  const openInbox = () => {
    if (!courses.some((c) => c.id === INBOX_COURSE_ID)) setCourses((prev) => [makeInboxCourse(todayIso), ...prev]);
    openDeck(INBOX_COURSE_ID);
    setDeckFiling(false);
  };
  const handleSnoozeFreeAlert = (alert: FreeCourseAlert) =>
    setSettings((prev) => ({ ...prev, freeAlertSnooze: snoozeFreeAlert(alert, prev, todayIso) }));


  // Calculate today's workload for TopNav
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

  // Pastille de l'onglet Dashboard : seulement ce qui demande une action
  const dashboardAlerts = useMemo(
    () =>
      countAlerts({
        overdue: computeDashboard(studyCourses, revisions, todayIso).stats.overdue.length,
        syncConflict: syncStatus === 'conflict',
        overloadedDays: findAlertDays(revisions, settings, todayIso).length,
        freeCourses: findFreeCourseAlerts(studyCourses, revisions, settings, todayIso).length,
        inboxCards,
      }),
    [courses, studyCourses, revisions, settings, todayIso, syncStatus, inboxCards]
  );
  // Date de la dernière synchro de ce compte sur cet appareil (conservée hors de l'état React)
  const lastSyncedAt = useMemo(
    () => (currentUser ? getSyncMeta(currentUser.uid).syncedAt ?? null : null),
    [currentUser, syncStatus, isSyncing]
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
  const deckCourse = deckCourseId ? courses.find((c) => c.id === deckCourseId) : undefined;
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
    if (currentView === 'dashboard' || !(splitViewMode && isLargeScreen)) setCurrentView('agenda');
    flashSlot(revisionId);
  };

  const cardCount = (courseId: string) => liveCards(decks[courseId]).length;

  // Supprimer un cours : sans carte, une simple confirmation ; avec des cartes, on choisit de les supprimer ou de les
  // déplacer vers un autre cours (historique de révision compris) avant de supprimer le cours
  const requestDeleteCourse = async (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    if (cardCount(courseId) > 0) {
      setDeletingCourse({ id: courseId, step: 'choose' });
      return;
    }
    const ok = await confirm({
      title: t('Supprimer le cours « {title} » ?', { title: course.title }),
      message: t('Toutes ses révisions planifiées seront supprimées. Cette action est irréversible.'),
      confirmLabel: t('Supprimer'),
      tone: 'danger',
    });
    if (ok) handleDeleteCourse(courseId);
  };

  const moveCardsThenDelete = (fromId: string, toId: string) => {
    const target = courses.find((c) => c.id === toId);
    const ids = liveCards(decks[fromId]).map((c) => c.id);
    const moved = moveCardsBetween(fromId, toId, ids);
    if (moved === null) {
      setToastMessage({
        title: t('Déplacement impossible'),
        description: t('Le cours « {title} » n\'a pas la place pour ces cartes.', { title: target?.title ?? '' }),
        type: 'error',
      });
      return;
    }
    handleDeleteCourse(fromId);
    setDeletingCourse(null);
    setToastMessage({
      title: t('Cours supprimé'),
      description: t('{n} cartes déplacées vers « {title} ».', { n: moved, title: target?.title ?? t('Cartes à trier') }),
      type: 'success',
    });
  };

  const playCourseCards = (courseId: string, revision?: RevisionItem) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setCardPlay({
      title: course.title,
      color: getCourseEffectiveColor(course, subjects.find((s) => s.id === course.subjectId)),
      items: shuffle(subCardItems(decks, [courseId]), Date.now()),
      mode: 'schedule',
      revisionId: revision?.id,
    });
  };

  const handleCloseCardPlay = (summary: { cards: number; success: number } | undefined, finished: boolean) => {
    const revisionId = cardPlay?.revisionId;
    setCardPlay(null);
    flushDecks();
    flushReviewLog();
    const rev = revisionId ? revisions.find((r) => r.id === revisionId) : undefined;
    // Une séance quittée en route ne mène pas à la validation du créneau
    if (finished && summary && rev && !rev.completed) {
      setCardsSummary({ revisionId: rev.id, cards: summary.cards, success: summary.success });
      setCompletingRevision(rev);
    }
  };

  // Gestionnaires partagés par les vues et les fenêtres
  const openQuickShift = (rev: RevisionItem) => setShiftingRevision(rev);
  const openCompleteModal = (rev: RevisionItem) => setCompletingRevision(rev);
  const openNewCourseModal = () => setIsNewCourseOpen(true);
  const openCourseDetail = (c: Course) => setSelectedCourseForDetail(c);
  const patchSettings = (patch: Partial<AppSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  // Glisser-déposer d'un cours dans l'arborescence : seulement s'il change vraiment de place
  const handleMoveCourse: ComponentProps<typeof CourseCatalogView>['onMoveCourse'] = (id, node) => {
    const c = courses.find((x) => x.id === id);
    if (c && (c.subjectId !== node.subjectId || c.folderId !== node.folderId)) {
      handleUpdateCourse(id, { subjectId: node.subjectId, folderId: node.folderId });
    }
  };

  // Chaque vue est décrite une fois, qu'elle s'affiche en vue partagée (iPad) ou en pleine largeur
  const renderPlanning = (split: boolean) => (
    <CalendarPlanningView
      revisions={revisions}
      courses={studyCourses}
      subjects={subjects}
      settings={settings}
      isSplitView={split || undefined}
      activeSessionRevisionId={split && currentView === 'session' ? activeSessionRevisionId : undefined}
      onCloseStudySession={split ? handleCloseStudySession : undefined}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      onOpenQuickShift={openQuickShift}
      onOpenCompleteModal={openCompleteModal}
      onStartStudySession={handleStartStudySession}
      onOpenNewCourseModal={openNewCourseModal}
      onOpenSlotDetail={(rev) => setSelectedSlotId(rev.id)}
      onMoveSlots={handleMoveSlots}
      onMoveToDay={handleMoveSlotToDay}
      onChangeSettings={patchSettings}
    />
  );
  const renderCatalog = (compact: boolean) => (
    <CourseCatalogView
      courses={studyCourses}
      revisions={revisions}
      subjects={subjects}
      settings={settings}
      onUpdateCourseMastery={handleUpdateCourseMastery}
      onOpenQuickShift={openQuickShift}
      onOpenCompleteModal={openCompleteModal}
      onOpenNewCourseModal={openNewCourseModal}
      onDeleteCourse={requestDeleteCourse}
      onUpdateCourseNotes={handleUpdateCourseNotes}
      onOpenCourseDetail={openCourseDetail}
      compact={compact || undefined}
      onGoToDate={handleGoToSlot}
      onMoveCourse={handleMoveCourse}
      onResetCourseColors={handleResetCourseColors}
      onUpdateSubjectFolders={handleUpdateSubjectFolders}
      // Le bouton ne s'affiche que si Préférences › Examen le demande (examen proche, toujours, jamais)
      onOpenRevisionPeriod={shouldOfferPeriod(settings, todayIso) ? () => setIsPeriodOpen(true) : undefined}
    />
  );
  const renderTimer = () => (
    <StudySessionTimer
      linkTypes={getLinkTypes(settings)}
      revisions={revisions}
      courses={studyCourses}
      subjects={subjects}
      activeRevisionId={activeSessionRevisionId}
      onSelectRevision={setActiveSessionRevisionId}
      onCompleteRevision={handleConfirmComplete}
      cardCount={cardCount}
      onPlayCards={(rev) => playCourseCards(rev.courseId, rev)}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Top Navigation */}
      <TopNav
        currentView={currentView}
        onViewChange={setCurrentView}
        dashboardAlerts={dashboardAlerts}
        cardsDue={cardsToday.due + cardsToday.fresh}
        onOpenNewCourseModal={openNewCourseModal}
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && <ToastBanner toast={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Main App Content Viewport */}
      <main className="flex-1 w-full px-1.5 sm:px-2 py-4 sm:py-6">
        <Suspense fallback={<ViewLoading />}>
        {/* iPad Multitasking Split View Layout */}
        {splitViewMode && isLargeScreen && currentView !== 'stats' && currentView !== 'dashboard' && currentView !== 'cards' ? (
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

              {renderPlanning(true)}
            </div>

            {/* Right Column (7 cols): Dynamic Second Workspace */}
            <div className="lg:col-span-7 space-y-4">
              {currentView === 'session' ? renderTimer() : renderCatalog(true)}
            </div>
          </div>
        ) : (
          /* Standard Full-width View (when split mode is turned off or on Stats) */
          <div>
            {currentView === 'agenda' || currentView === 'week' || currentView === 'month' ? (
              renderPlanning(false)
            ) : currentView === 'courses' ? (
              renderCatalog(false)
            ) : currentView === 'dashboard' ? (
              <DashboardView
                courses={studyCourses}
                revisions={revisions}
                subjects={subjects}
                settings={settings}
                cloudAvailable={isCloudConfigured}
                userEmail={currentUser?.email ?? (currentUser ? t('Compte anonyme') : null)}
                syncStatus={syncStatus}
                isSyncing={isSyncing}
                lastSyncedAt={lastSyncedAt}
                safetyBackupCount={safetyBackups.length}
                onSyncNow={syncNow}
                onOpenConflict={openConflictDialog}
                onOpenBackupSettings={() => handleOpenSettingsModal('backup')}
                onOpenCompleteModal={openCompleteModal}
                onOpenQuickShift={openQuickShift}
                onShiftToToday={(rev) => handleConfirmShift(rev.id, todayIso, settings.autoCascadeShift)}
                onApplyShifts={handleApplyShifts}
                onStartStudySession={handleStartStudySession}
                onGoToSlot={handleGoToSlot}
                onOpenCourseDetail={openCourseDetail}
                onChangeSettings={patchSettings}
                cardsToday={cardsToday}
                onPlayCards={() => playScope({ kind: 'all' }, 'today', false)}
                onOpenCards={() => setCurrentView('cards')}
                inboxCards={inboxCards}
                onOpenInbox={() => openDeck(INBOX_COURSE_ID)}
                onSnoozeFreeAlert={handleSnoozeFreeAlert}
                onOpenRevisionPeriod={() => setIsPeriodOpen(true)}
                onOpenExamSettings={() => handleOpenSettingsModal('exam')}
              />
            ) : currentView === 'session' ? (
              renderTimer()
            ) : currentView === 'cards' ? (
              <FlashcardsView
                courses={courses}
                subjects={subjects}
                decks={decks}
                settings={settings}
                onChangeSettings={patchSettings}
                onPlay={playScope}
                onOpenDeck={openDeck}
                onImport={() => setCardsImport({})}
                onAddCard={() => setPickingCardCourse(true)}
              />
            ) : (
              <StatsProgressView
                courses={studyCourses}
                revisions={revisions}
                subjects={subjects}
                decks={decks}
                reviewLog={reviewLog}
                dailyTargetHours={settings.dailyTargetHours}
                examDate={settings.examDate}
                onOpenDeck={openDeck}
              />
            )}
          </div>
        )}
        </Suspense>
      </main>

      {/* Modals (chargées à la demande : rien à afficher pendant le chargement) */}
      <Suspense fallback={null}>
      {/* 1. New Course Modal */}
      {newCourseMounted && (
      <NewCourseModal
        isOpen={isNewCourseOpen}
        onClose={() => setIsNewCourseOpen(false)}
        subjects={subjects}
        settings={settings}
        onUpdateSubject={(s) => handleUpdateSubjectFolders(s)}
        onChangeLinkTypes={handleChangeLinkTypes}
        onSaveCourse={handleSaveNewCourse}
      />
      )}

      {/* 2. Settings Modal (Disciplines, Colors, J presets, Dark mode, Backup) */}
      {settingsMounted && (
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
        onDeleteRevisionPeriod={handleDeleteRevisionPeriod}
        onNewRevisionPeriod={() => setIsPeriodOpen(true)}
        onResolveSubjectCourses={handleResolveSubjectCourses}
        cloudAvailable={isCloudConfigured}
        courses={studyCourses}
        revisions={revisions}
        onExportBackup={handleExportBackup}
        onBuildBackup={handleBuildBackup}
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
      )}

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
          onOpenQuickShift={openQuickShift}
          onOpenCompleteModal={openCompleteModal}
          onStartStudySession={handleStartStudySession}
          onDeleteCourse={requestDeleteCourse}
          onResizeSlot={handleResizeSlot}
          cardCount={cardCount(selectedCourseForDetail.id)}
          onOpenDeck={() => openDeck(selectedCourseForDetail.id)}
          onPlayCards={() => playCourseCards(selectedCourseForDetail.id)}
          onAddReview={handleAddReview}
          onDeleteReview={handleDeleteReview}
          onConvertToJ={handleConvertCourseToJ}
          onConvertToFree={handleConvertCourseToFree}
        />
      )}

      {deckCourse && (
        <DeckEditor
          course={deckCourse}
          subject={subjects.find((s) => s.id === deckCourse.subjectId)}
          deck={decks[deckCourse.id]}
          onChange={(change) => updateDeck(deckCourse.id, change)}
          initialCardId={deckCardId ?? undefined}
          highlightFiling={deckFiling}
          onClose={() => {
            setDeckCourseId(null);
            setDeckCardId(null);
          }}
          onImport={() => setCardsImport({ defaultCourseId: deckCourse.id })}
          courses={courses}
          subjects={subjects}
          onMove={(toId, ids) => handleMoveCards(deckCourse.id, toId, ids)}
        />
      )}

      {isPeriodOpen && (
        <RevisionPeriodModal
          courses={studyCourses}
          subjects={subjects}
          revisions={revisions}
          settings={settings}
          todayIso={todayIso}
          onApply={(period, plan) => {
            handleApplyRevisionPeriod(period, plan);
            setIsPeriodOpen(false);
          }}
          onClose={() => setIsPeriodOpen(false)}
        />
      )}

      {deletingCourse?.step === 'choose' && (() => {
        const course = courses.find((c) => c.id === deletingCourse.id);
        return course ? (
          <DeleteCourseDialog
            title={course.title}
            cardCount={cardCount(course.id)}
            onDeleteAll={() => {
              handleDeleteCourse(course.id);
              setDeletingCourse(null);
            }}
            onMoveCards={() => setDeletingCourse({ id: course.id, step: 'pick' })}
            onClose={() => setDeletingCourse(null)}
          />
        ) : null;
      })()}

      {deletingCourse?.step === 'pick' && (
        <CardCoursePicker
          courses={studyCourses.filter((c) => c.id !== deletingCourse.id)}
          subjects={subjects}
          title={t('Déplacer les cartes')}
          subtitle={t('Dans quel cours ?')}
          onPick={(toId) => moveCardsThenDelete(deletingCourse.id, toId)}
          onPickInbox={() => {
            if (!courses.some((c) => c.id === INBOX_COURSE_ID)) setCourses((prev) => [makeInboxCourse(todayIso), ...prev]);
            moveCardsThenDelete(deletingCourse.id, INBOX_COURSE_ID);
          }}
          onClose={() => setDeletingCourse({ id: deletingCourse.id, step: 'choose' })}
        />
      )}

      {pickingCardCourse && (
        <CardCoursePicker
          courses={studyCourses}
          subjects={subjects}
          defaultCourseId={lastCardCourseId ?? deckCourseId ?? undefined}
          onPick={(id) => {
            setLastCardCourseId(id);
            setPickingCardCourse(false);
            openDeck(id);
          }}
          onPickInbox={() => {
            setPickingCardCourse(false);
            openInbox();
          }}
          onClose={() => setPickingCardCourse(false)}
        />
      )}

      {cardsImport && (
        <CardsImportModal
          courses={studyCourses}
          subjects={subjects}
          decks={decks}
          defaultCourseId={cardsImport.defaultCourseId}
          onImport={handleImportCards}
          onApkg={(file) => {
            setCardsImport(null);
            setApkgFile(file);
          }}
          onClose={() => setCardsImport(null)}
        />
      )}

      {apkgFile && (
        <ApkgImportModal
          file={apkgFile}
          subjects={subjects}
          courses={courses}
          decks={decks}
          onImport={(result, info) => {
            handleImportApkg(result, info);
            setApkgFile(null);
          }}
          onClose={() => setApkgFile(null)}
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
          onOpenCompleteModal={openCompleteModal}
          onOpenQuickShift={openQuickShift}
          onStartStudySession={handleStartStudySession}
          cardCount={cardCount(selectedSlotCourse.id)}
          onPlayCards={(rev) => playCourseCards(rev.courseId, rev)}
        />
      )}

      {cardPlay && (
        <FlashcardPlayer
          title={cardPlay.title}
          color={cardPlay.color}
          items={cardPlay.items}
          decks={decks}
          courses={courses}
          mode={cardPlay.mode}
          onReview={handleCardReview}
          onClose={handleCloseCardPlay}
          finishLabel={cardPlay.revisionId && !revisions.find((r) => r.id === cardPlay.revisionId)?.completed ? t('Valider le créneau') : undefined}
        />
      )}

      {/* 4. Quick Shift Modal (with automatic cascade, renders on top with z-[70]) */}
      {shiftingRevision && shiftingCourse && (
        <QuickShiftModal
          revision={shiftingRevision}
          course={shiftingCourse}
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
          isOpen={true}
          onClose={() => {
            setCompletingRevision(null);
            setCardsSummary(null);
          }}
          onConfirmComplete={handleConfirmComplete}
          onUndoComplete={handleUndoComplete}
          cardsSummary={cardsSummary?.revisionId === completingRevision.id ? cardsSummary : undefined}
        />
      )}
      </Suspense>
    </div>
  );
}

/** Pendant le chargement d'une vue (premier affichage seulement, les morceaux sont ensuite en cache). */
function ViewLoading() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
