import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Course, MasteryLevel, RevisionItem, Subject } from '../types';
import { MasteryStars } from './MasteryStars';
import { RetentionTimeline } from './RetentionTimeline';
import { CourseSynthesisModal } from './CourseSynthesisModal';
import { RichNote } from './RichNote';
import { RichTextEditor } from './RichTextEditor';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { COURSE_SORT_OPTIONS, CourseSortMode, DEFAULT_COURSE_SORT, isCourseSortMode, sortCourses } from '../utils/courseSort';
import { formatFrenchDate, getTodayIso } from '../utils/dateUtils';
import {
  Search,
  Plus,
  ArrowRightLeft,
  Trash2,
  BookOpen,
  Calendar,
  Edit2,
  NotebookPen,
  ArrowUpDown,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarRange,
} from 'lucide-react';
import { getCourseEffectiveColor, getSubject } from '../utils/colorUtils';
import { CourseLinkIcons } from './CourseLinkIcons';
import { getLinkTypes } from '../utils/courseLinks';
import { COURSE_DRAG_MIME, CourseFolderTree, TreeSelection } from './CourseFolderTree';
import { courseInNode, formatCoursePath } from '../utils/folders';
import { t } from '../i18n';
import { useConfirm } from './ConfirmDialog';
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_KEY_STEP,
  PANEL_KEY_STEP_LARGE,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  clampPanelWidth,
  parseStoredPanelWidth,
} from '../utils/panelWidth';
import { compareCourseRevisions, isFreeCourse, isRReview, revLabel } from '../utils/jMethod';
import { FreeCourseBadge } from './FreeCourseBadge';


const SORT_STORAGE_KEY = 'medj_catalog_sort_v1';
const TREE_OPEN_STORAGE_KEY = 'medj_catalog_tree_v1';
const TREE_WIDTH_STORAGE_KEY = 'medj_catalog_tree_width_v1';
/** Types de cours affichés (pastilles J / R) : « J », « R », ou absent = les deux. */
const TYPES_STORAGE_KEY = 'medj_catalog_types_v1';
/** Cartes dessinées par tranche (la suivante s'ajoute au défilement). */
const CARDS_PER_PAGE = 30;

interface CourseCatalogViewProps {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
  onUpdateCourseMastery: (courseId: string, newLevel: MasteryLevel) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenNewCourseModal: () => void;
  /** Assistant « Période de révision » (avant un examen). */
  onOpenRevisionPeriod?: () => void;
  onDeleteCourse: (courseId: string) => void;
  onUpdateCourseNotes: (courseId: string, notes: string) => void;
  onOpenCourseDetail: (course: Course) => void;
  /** Ouvre le planning sur le jour de ce créneau. */
  /** Colonne étroite (écran scindé) : l'arbre démarre replié, il écraserait la liste. */
  compact?: boolean;
  onGoToDate: (date: string, revisionId: string) => void;
  onMoveCourse: (courseId: string, node: TreeSelection) => void;
  /** Retire la couleur personnelle de ces cours : ils reprennent celle de leur dossier. */
  onResetCourseColors: (courseIds: string[]) => void;
  onUpdateSubjectFolders: (subject: Subject, moveCourses?: { from: string; to: string | undefined }) => void;
}

export const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({
  courses,
  revisions,
  subjects,
  settings,
  onUpdateCourseMastery,
  onOpenQuickShift,
  onOpenCompleteModal,
  onOpenNewCourseModal,
  onOpenRevisionPeriod,
  onDeleteCourse,
  onUpdateCourseNotes,
  onOpenCourseDetail,
  compact = false,
  onGoToDate,
  onMoveCourse,
  onResetCourseColors,
  onUpdateSubjectFolders,
}) => {
  const confirm = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  // Arbre des disciplines et dossiers : replié, tous les cours sont visibles (la sélection est alors ignorée)
  const [selection, setSelection] = useState<TreeSelection | null>(null);
  const [treeOpen, setTreeOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(TREE_OPEN_STORAGE_KEY);
      return saved === null ? !compact && window.innerWidth >= 1024 : saved === '1';
    } catch {
      return false;
    }
  });
  const toggleTree = () => {
    setTreeOpen((open) => {
      try {
        localStorage.setItem(TREE_OPEN_STORAGE_KEY, open ? '0' : '1');
      } catch {
        // stockage indisponible : l'état reste valable pour cette session
      }
      return !open;
    });
  };
  // Largeur de l'arbre (réglable à la souris ou au clavier, mémorisée sur cet appareil)
  const [treeWidth, setTreeWidth] = useState<number>(() => {
    try {
      return parseStoredPanelWidth(localStorage.getItem(TREE_WIDTH_STORAGE_KEY));
    } catch {
      return PANEL_DEFAULT_WIDTH;
    }
  });
  const layoutRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const saveTreeWidth = (width: number) => {
    try {
      localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // stockage indisponible : la largeur reste valable pour cette session
    }
  };
  const setClampedTreeWidth = (width: number) => setTreeWidth(clampPanelWidth(width, layoutRef.current?.clientWidth));
  const [editingNotesCourseId, setEditingNotesCourseId] = useState<string | null>(null);
  const [notesBuffer, setNotesBuffer] = useState('');
  const [synthesisCourseId, setSynthesisCourseId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<CourseSortMode>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      return isCourseSortMode(saved) ? saved : DEFAULT_COURSE_SORT;
    } catch {
      return DEFAULT_COURSE_SORT;
    }
  });
  const changeSortMode = (mode: CourseSortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, mode);
    } catch {
      // stockage indisponible : le tri reste actif pour cette session
    }
  };
  const notesEditorRef = useRef<HTMLDivElement>(null);

  // Un clic hors de l'éditeur de notes le ferme, sauf s'il y a des modifications non enregistrées
  useOutsideClick(
    editingNotesCourseId !== null,
    (target) => !!notesEditorRef.current?.contains(target),
    () => {
      const editing = courses.find((c) => c.id === editingNotesCourseId);
      if (editing && notesBuffer === (editing.notes ?? '')) setEditingNotesCourseId(null);
    },
    editingNotesCourseId
  );

  const todayIso = getTodayIso();

  // Une discipline supprimée entre-temps ne doit pas laisser un filtre fantôme
  const activeSelection = selection && subjects.some((s) => s.id === selection.subjectId) ? selection : null;

  // Créneaux de chaque cours, triés par J (calculé une fois, au lieu d'un filtre par carte)
  const revisionsByCourse = useMemo(() => {
    const map = new Map<string, RevisionItem[]>();
    revisions.forEach((r) => {
      const list = map.get(r.courseId);
      if (list) list.push(r);
      else map.set(r.courseId, [r]);
    });
    map.forEach((list) => list.sort(compareCourseRevisions));
    return map;
  }, [revisions]);

  // Type de cours : « R » = cours sans J, ou qui a au moins une révision R ; « J » = les autres.
  // Deux pastilles, toutes deux actives par défaut (= tous) ; on en désactive une, jamais les deux.
  // Le filtre n'apparaît que s'il existe au moins un cours R.
  const [shownTypes, setShownTypes] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPES_STORAGE_KEY);
      return { J: saved !== 'R', R: saved !== 'J' };
    } catch {
      return { J: true, R: true };
    }
  });
  const isRCourse = (course: Course) =>
    isFreeCourse(course) || (revisionsByCourse.get(course.id) ?? []).some(isRReview);
  const rCourseCount = courses.filter(isRCourse).length;
  const typeFilterOn = rCourseCount > 0 && !(shownTypes.J && shownTypes.R);
  const toggleType = (type: 'J' | 'R') =>
    setShownTypes((prev) => {
      const next = { ...prev, [type]: !prev[type] };
      if (!next.J && !next.R) return prev;
      try {
        if (next.J && next.R) localStorage.removeItem(TYPES_STORAGE_KEY);
        else localStorage.setItem(TYPES_STORAGE_KEY, next.J ? 'J' : 'R');
      } catch {
        // stockage indisponible : le choix reste actif pour cette session
      }
      return next;
    });

  // Filtered courses
  const query = searchQuery.toLowerCase();
  const matchingCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(query) ||
      course.itemCode.toLowerCase().includes(query) ||
      (course.notes && course.notes.toLowerCase().includes(query)) ||
      (revisionsByCourse.get(course.id) ?? []).some((r) => r.notes && r.notes.toLowerCase().includes(query));

    const matchesSubject = !treeOpen || !activeSelection || courseInNode(course, activeSelection, subjects);

    const matchesType = !typeFilterOn || shownTypes[isRCourse(course) ? 'R' : 'J'];

    return matchesSearch && matchesSubject && matchesType;
  });
  const filteredCourses = sortCourses(matchingCourses, revisions, subjects, sortMode);

  // Affichage par tranches : avec des centaines de cours, dessiner toutes les cartes alourdit toute la page.
  // La tranche suivante s'ajoute quand le bas de la liste approche ; on repart du début quand le filtre change.
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_PAGE);
  useEffect(() => {
    setVisibleCount(CARDS_PER_PAGE);
  }, [searchQuery, activeSelection?.subjectId, activeSelection?.folderId, treeOpen, sortMode, typeFilterOn, shownTypes]);
  const visibleCourses = filteredCourses.slice(0, visibleCount);
  const hasMore = filteredCourses.length > visibleCount;
  const showMore = useCallback(() => setVisibleCount((n) => n + CARDS_PER_PAGE), []);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) showMore();
        },
        { rootMargin: '600px' }
      );
      observerRef.current.observe(el);
    },
    [showMore]
  );

  const handleSaveNotes = (courseId: string) => {
    onUpdateCourseNotes(courseId, notesBuffer);
    setEditingNotesCourseId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('Catalogue des cours ({n} chapitres)', { n: courses.length })}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            {onOpenRevisionPeriod && courses.length > 0 && (
              <button
                type="button"
                onClick={onOpenRevisionPeriod}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition-colors"
              >
                <CalendarRange className="w-4 h-4" />
                <span>{t('Période de révision')}</span>
              </button>
            )}
            <button
              onClick={onOpenNewCourseModal}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('Ajouter un cours (J0)')}</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('Rechercher un cours ou une note...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Tri, et filtre J / R quand au moins un cours a des révisions R */}
          <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3 top-2 pointer-events-none" />
            <select
              value={sortMode}
              onChange={(e) => changeSortMode(e.target.value as CourseSortMode)}
              aria-label={t('Trier les cours')}
              title={t('Trier les cours')}
              className="w-full pl-9 pr-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            >
              {COURSE_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t('Trier :')} {t(o.label)}
                </option>
              ))}
            </select>
          </div>
          {rCourseCount > 0 && (
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label={t('Type de cours')}>
              {(['J', 'R'] as const).map((type) => {
                const on = shownTypes[type];
                const r = type === 'R';
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleType(type)}
                    title={r ? t('Cours en révision libre ({n})', { n: rCourseCount }) : t('Cours en méthode des J')}
                    className={`w-7 h-7 text-xs font-extrabold rounded-lg border transition-colors ${
                      on
                        ? r
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-teal-600 border-teal-600 text-white'
                        : r
                        ? 'bg-white dark:bg-slate-800 border-dashed border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>

      <div ref={layoutRef} className="flex flex-col lg:flex-row gap-4 lg:items-stretch">
      {!treeOpen && (
        <button
          type="button"
          onClick={toggleTree}
          title={t('Afficher l\'arbre')}
          aria-label={t('Afficher l\'arbre')}
          className="self-start lg:sticky lg:top-4 p-2 text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}
      {treeOpen && (
        <div
          className="relative flex flex-col lg:shrink-0 lg:w-[var(--tree-w)]"
          style={{ '--tree-w': `${treeWidth}px` } as React.CSSProperties}
        >
        <aside className="flex-1 min-h-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 shadow-2xs max-h-[70vh] lg:max-h-none overflow-y-auto">
          <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Disciplines')}</span>
            <button
              type="button"
              onClick={toggleTree}
              title={t('Replier l\'arbre')}
              aria-label={t('Replier l\'arbre')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <CourseFolderTree
            subjects={subjects}
            courses={courses}
            selected={activeSelection}
            onSelect={setSelection}
            onDropCourse={onMoveCourse}
            onUpdateSubject={onUpdateSubjectFolders}
            onResetCourseColors={onResetCourseColors}
          />
        </aside>
        {/* Poignée : glisser pour élargir ou rétrécir l'arbre (flèches du clavier, double-clic = largeur d'origine) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Largeur de l\'arbre')}
          aria-valuemin={PANEL_MIN_WIDTH}
          aria-valuemax={PANEL_MAX_WIDTH}
          aria-valuenow={treeWidth}
          tabIndex={0}
          title={t('Glisser pour ajuster la largeur (double-clic : largeur d\'origine)')}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startX: e.clientX, startWidth: treeWidth };
          }}
          onPointerMove={(e) => {
            if (dragRef.current) setClampedTreeWidth(dragRef.current.startWidth + e.clientX - dragRef.current.startX);
          }}
          onPointerUp={(e) => {
            if (!dragRef.current) return;
            const width = clampPanelWidth(dragRef.current.startWidth + e.clientX - dragRef.current.startX, layoutRef.current?.clientWidth);
            dragRef.current = null;
            setTreeWidth(width);
            saveTreeWidth(width);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onDoubleClick={() => {
            setTreeWidth(PANEL_DEFAULT_WIDTH);
            saveTreeWidth(PANEL_DEFAULT_WIDTH);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? PANEL_KEY_STEP_LARGE : PANEL_KEY_STEP;
            const next =
              e.key === 'ArrowRight' ? treeWidth + step
              : e.key === 'ArrowLeft' ? treeWidth - step
              : e.key === 'Home' ? PANEL_MIN_WIDTH
              : e.key === 'End' ? PANEL_MAX_WIDTH
              : e.key === 'Enter' ? PANEL_DEFAULT_WIDTH
              : null;
            if (next === null) return;
            e.preventDefault();
            const width = clampPanelWidth(next, layoutRef.current?.clientWidth);
            setTreeWidth(width);
            saveTreeWidth(width);
          }}
          className="group hidden lg:flex absolute top-0 bottom-0 left-full w-4 items-start justify-center pt-20 cursor-col-resize touch-none focus:outline-none"
        >
          <span className="w-0.5 h-12 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-teal-500 group-focus-visible:bg-teal-500 group-active:bg-teal-600 transition-colors" />
        </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
      {/* Courses List */}
      {filteredCourses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('Aucun cours ne correspond aux critères')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('Modifiez votre recherche ou ajoutez un nouveau cours à réviser.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCourses.map((course) => {
            const subject = getSubject(course.subjectId, subjects);
            const effectiveColor = getCourseEffectiveColor(course, subject);
            const pathLabel = formatCoursePath(subject, course.folderId);
            const isDark = settings.theme === 'dark';
            // Pastille de matière : teinte légère de la couleur du cours, texte un peu plus foncé (clair) ou clair (sombre)
            const badgeStyle = {
              backgroundColor: `color-mix(in srgb, ${effectiveColor} 14%, transparent)`,
              color: `color-mix(in srgb, ${effectiveColor} 78%, ${isDark ? '#f1f5f9' : '#0f172a'})`,
            };
            // Prochain créneau à faire : le premier non validé qui n'est pas en retard
            const courseRevisions = revisionsByCourse.get(course.id) ?? [];
            const nextRevId = courseRevisions.find((r) => !r.completed && r.scheduledDate >= todayIso)?.id;

            const completedCount = courseRevisions.filter((r) => r.completed).length;
            const hasAnyNotes =
              !!course.notes?.trim() || courseRevisions.some((r) => !!r.notes?.trim());

            return (
              <div
                key={course.id}
                id={`course-card-${course.id}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                // Carte neutre : la couleur du cours est une fine barre à gauche
                style={{ boxShadow: `inset 4px 0 0 ${effectiveColor}` }}
              >
                <div className="p-4 pl-5 space-y-3">
                  {/* Top Bar: Subject Badge, Item Code, Title, Mastery Rating */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Poignée : glisser le cours sur un dossier de l'arbre */}
                        {treeOpen && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(COURSE_DRAG_MIME, course.id);
                              e.dataTransfer.effectAllowed = 'move';
                              const card = document.getElementById(`course-card-${course.id}`);
                              if (card) e.dataTransfer.setDragImage(card, 24, 24);
                            }}
                            title={t('Glisser vers un dossier de l\'arbre pour ranger ce cours')}
                            aria-label={t('Glisser vers un dossier de l\'arbre pour ranger ce cours')}
                            className="-ml-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
                          >
                            <GripVertical className="w-4 h-4" />
                          </span>
                        )}
                        {/* Subject Badge with custom color */}
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold"
                          style={badgeStyle}
                          title={pathLabel.full}
                        >
                          <span
                            className="w-2 h-2 rounded-full bg-current"
                          />
                          {pathLabel.text}
                        </span>

                        {course.customColor && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            title={t('Couleur personnalisée sur ce cours ({color})', { color: course.customColor ?? '' })}
                          >
                            <span className="w-1.5 h-1.5 rounded-full ring-1 ring-white/60" style={{ backgroundColor: course.customColor }} />
                            <span>{t('Couleur spécifique')}</span>
                          </span>
                        )}

                        {/* Item Code */}
                        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                          {course.itemCode}
                        </span>

                        <span className="text-xs text-slate-400">·</span>

                        {/* J0 date, ou marque « Sans J » d'un cours libre */}
                        {isFreeCourse(course) ? (
                          <FreeCourseBadge />
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {t('J0 commencé le {date}', { date: formatFrenchDate(course.j0Date) })}
                          </span>
                        )}
                        <CourseLinkIcons links={course.links} linkTypes={getLinkTypes(settings)} className="ml-1" />
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenCourseDetail(course)}
                        className="text-left text-base font-bold text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer group flex items-center gap-1.5"
                      >
                        <span>{course.title}</span>
                        <span className="text-[11px] font-normal text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('(Détails & Édition)')}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                    {/* Synthèse des notes (cours + créneaux) */}
                    <button
                      type="button"
                      onClick={() => setSynthesisCourseId(course.id)}
                      title={t('Synthèse des notes')}
                      aria-label={t('Synthèse des notes : {title}', { title: course.title })}
                      className={`relative p-2 rounded-xl border transition-colors ${
                        hasAnyNotes
                          ? 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50'
                          : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      <NotebookPen className="w-4 h-4" />
                    </button>

                    {/* Mastery Level Interactive Selector */}
                    <MasteryStars
                      level={course.mastery}
                      onChange={(newLevel) => onUpdateCourseMastery(course.id, newLevel)}
                      size={16}
                    />
                    </div>
                  </div>

                  {/* Progression dans le temps (version compacte) */}
                  <RetentionTimeline course={course} revisions={revisions} compact />

                  {/* Notes / Clinical Pearls */}
                  {editingNotesCourseId === course.id ? (
                    <div ref={notesEditorRef} className="space-y-2 pt-1">
                      <RichTextEditor
                        value={notesBuffer}
                        onChange={setNotesBuffer}
                        placeholder={t('Points clés, mnémotechniques, pièges d\'annales...')}
                        minRows={5}
                        focusAtEnd
                        className="w-full p-3 text-sm leading-relaxed border border-teal-300 dark:border-teal-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-sans"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingNotesCourseId(null)}
                          className="px-2.5 py-1 text-xs text-slate-500"
                        >
                          {t('Annuler')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNotes(course.id)}
                          className="px-3 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                        >
                          {t('Enregistrer')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setEditingNotesCourseId(course.id);
                        setNotesBuffer(course.notes || '');
                      }}
                      className="cursor-pointer group p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start justify-between"
                      title={t('Cliquer pour modifier les notes')}
                    >
                      {course.notes ? (
                        <RichNote
                          text={course.notes}
                          className="max-h-[4.5rem] overflow-hidden text-slate-700 dark:text-slate-200"
                        />
                      ) : (
                        <span className="italic">{t('Ajouter des notes, réflexes EDN ou pièges à retenir...')}</span>
                      )}
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold shrink-0 ml-2">
                        {t('Modifier')}
                      </span>
                    </div>
                  )}

                  {/* Méthode des J Timeline Grid */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-600" />
                        <span>{isFreeCourse(course) ? t('Révisions libres') : t('Cycle de répétitions espacées')}</span>
                        <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                          {t('({done}/{total} révisions faites)', { done: completedCount, total: courseRevisions.length })}
                        </span>
                      </span>

                      <span className="text-[11px] text-slate-400">
                        {isFreeCourse(course) ? t('Ajoutez une révision depuis la fiche du cours') : t('Cliquez sur un J pour décaler ou valider')}
                      </span>
                    </div>

                    {/* Timeline pills */}
                    <div className="flex flex-wrap gap-2">
                      {courseRevisions.map((rev) => {
                        const isPastDue = !rev.completed && rev.scheduledDate < todayIso;
                        const isToday = rev.scheduledDate === todayIso;
                        const isJ0orJ1 = !isRReview(rev) && (rev.jIndex === 0 || rev.jIndex === 1);

                        return (
                          <div
                            key={rev.id}
                            className={`p-2 rounded-xl border text-xs flex flex-col justify-between min-w-[105px] transition-all ${
                              rev.completed
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300'
                                : isToday
                                ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-400 dark:border-teal-700 text-teal-900 dark:text-teal-300 ring-2 ring-teal-500/20'
                                : isPastDue
                                ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-300'
                                : rev.id === nextRevId
                                ? 'bg-slate-50 dark:bg-slate-800/60 border-teal-500/70 dark:border-teal-500/60 text-slate-700 dark:text-slate-300'
                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <button
                                type="button"
                                onClick={() => onGoToDate(rev.scheduledDate, rev.id)}
                                title={t('Voir ce jour dans le planning')}
                                className="font-bold hover:underline hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer"
                              >
                                {revLabel(rev)}
                              </button>
                              <span className="text-[10px] font-mono opacity-75">
                                {isJ0orJ1 ? '1h30' : '1h00'}
                              </span>
                            </div>

                            <span className="font-mono text-[11px] block mb-1.5">
                              {rev.scheduledDate.slice(5)}
                            </span>

                            {/* Actions on this J */}
                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                              <button
                                onClick={() => onOpenCompleteModal(rev)}
                                className={`text-[10px] font-bold ${
                                  rev.completed
                                    ? 'text-emerald-700 dark:text-emerald-400 hover:underline'
                                    : 'text-teal-700 dark:text-teal-400 hover:underline'
                                }`}
                              >
                                {rev.completed ? t('Fait ✓') : t('Valider')}
                              </button>

                              <button
                                onClick={() => onOpenQuickShift(rev)}
                                title={t('Décaler ce J (cascade automatique des J suivants)')}
                                className="text-[10px] text-slate-400 hover:text-teal-600"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Course footer actions */}
                  <div className="flex items-center justify-between pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px]">
                      {t('Ajouté le {date}', { date: formatFrenchDate(course.createdAt) })}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onOpenCourseDetail(course)}
                        className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{t('Voir la fiche')}</span>
                      </button>

                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('Supprimer le cours « {title} » ?', { title: course.title }),
                            message: t('Toutes ses révisions planifiées seront supprimées. Cette action est irréversible.'),
                            confirmLabel: t('Supprimer'),
                            tone: 'danger',
                          });
                          if (ok) onDeleteCourse(course.id);
                        }}
                        className="text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors"
                        title={t('Supprimer ce cours')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('Supprimer')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-2">
              <button
                type="button"
                onClick={showMore}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t('Afficher plus ({n} restants)', { n: filteredCourses.length - visibleCount })}
              </button>
            </div>
          )}
        </div>
      )}

      </div>
      </div>

      {synthesisCourseId && (() => {
        const c = courses.find((x) => x.id === synthesisCourseId);
        if (!c) return null;
        return (
          <CourseSynthesisModal
            course={c}
            subject={getSubject(c.subjectId, subjects)}
            revisions={revisions}
            isDark={settings.theme === 'dark'}
            onUpdateCourseNotes={onUpdateCourseNotes}
            onClose={() => setSynthesisCourseId(null)}
          />
        );
      })()}
    </div>
  );
};
