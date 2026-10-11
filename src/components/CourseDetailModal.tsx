import React, { useState, useEffect } from 'react';
import { AppSettings, Course, CourseLink, LinkType, MasteryLevel, RevisionItem, Subject } from '../types';
import { MASTERY_CONFIG } from './MasteryBadge';
import { MasteryStars } from './MasteryStars';
import { RetentionTimeline } from './RetentionTimeline';
import { RevisionNotesJournal } from './RevisionNotesJournal';
import { RichNote } from './RichNote';
import { RichTextEditor } from './RichTextEditor';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { DurationSelect } from './DurationSelect';
import { formatTime, getDayBreaks, getDayWindow, resolveDayLayout } from '../utils/dayLayout';
import { formatFrenchDate, formatMinutes, getTodayIso } from '../utils/dateUtils';
import {
  X,
  Edit2,
  Save,
  Calendar,
  Clock,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Play,
  Trash2,
  BookOpen,
  Check,
  Plus,
} from 'lucide-react';
import { PRESET_COURSE_COLORS, getCourseGradientStyle, getSubjectBadgeStyle } from '../utils/colorUtils';
import { FolderTreePicker } from './FolderTreePicker';
import { CourseLinksEditor } from './CourseLinksEditor';
import { getLinkTypes } from '../utils/courseLinks';
import { formatCoursePath } from '../utils/folders';
import { t } from '../i18n';

interface CourseDetailModalProps {
  course: Course | null;
  revisions: RevisionItem[];
  subjects: Subject[];
  /** Création de dossiers depuis le sélecteur d'emplacement. */
  onUpdateSubject?: (subject: Subject) => void;
  onChangeLinkTypes: (types: LinkType[]) => void;
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onUpdateCourse: (
    courseId: string,
    updates: {
      title?: string;
      itemCode?: string;
      subjectId?: string;
      folderId?: string;
      links?: CourseLink[];
      customColor?: string;
      notes?: string;
      mastery?: MasteryLevel;
    }
  ) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  onDeleteCourse: (courseId: string) => void;
  /** Change la durée d'un créneau (les créneaux suivants sont repoussés si besoin). */
  onResizeSlot?: (revisionId: string, durationMinutes: number) => void;
  /** Ouvre la fiche d'un seul créneau J. */
  onOpenSlot?: (revision: RevisionItem) => void;
  /** Présent quand on vient d'une fiche créneau : revient dessus sans fermer. */
  onBackToSlot?: () => void;
}

export const CourseDetailModal: React.FC<CourseDetailModalProps> = ({
  course,
  revisions,
  subjects,
  onUpdateSubject,
  onChangeLinkTypes,
  settings,
  isOpen,
  onClose,
  onUpdateCourse,
  onOpenQuickShift,
  onOpenCompleteModal,
  onStartStudySession,
  onDeleteCourse,
  onResizeSlot,
  onOpenSlot,
  onBackToSlot,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(course?.title ?? '');
  const [itemCode, setItemCode] = useState(course?.itemCode ?? '');
  const [subjectId, setSubjectId] = useState(course?.subjectId ?? '');
  const [folderId, setFolderId] = useState<string | undefined>(course?.folderId);
  const [customColor, setCustomColor] = useState<string | undefined>(course?.customColor);
  const [notes, setNotes] = useState(course?.notes || '');
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setItemCode(course.itemCode);
      setSubjectId(course.subjectId);
      setFolderId(course.folderId);
      setCustomColor(course.customColor);
      setNotes(course.notes || '');
      setIsEditing(false);
      setShowColorPicker(false);
    }
  }, [course?.id, course?.customColor]);

  // En mode édition, un clic hors des zones de saisie quitte l'édition s'il n'y a rien à enregistrer
  useOutsideClick(
    isEditing && !!course,
    (target) => !!target.closest('[data-edit-zone]'),
    () => {
      if (!course) return;
      const unchanged =
        title === course.title &&
        itemCode === course.itemCode &&
        subjectId === course.subjectId &&
        folderId === course.folderId &&
        customColor === course.customColor &&
        notes.trim() === (course.notes ?? '').trim();
      if (unchanged) setIsEditing(false);
    },
    isEditing
  );

  if (!isOpen || !course) return null;

  const todayIso = getTodayIso();
  const currentSubject = subjects.find((s) => s.id === (isEditing ? subjectId : course.subjectId)) || subjects[0];
  const effectiveColor = customColor || currentSubject.color;
  const pathLabel = formatCoursePath(currentSubject, isEditing ? folderId : course.folderId);
  const courseRevisions = revisions
    .filter((r) => r.courseId === course.id)
    .sort((a, b) => a.jIndex - b.jIndex);

  const completedCount = courseRevisions.filter((r) => r.completed).length;

  // Heure de chaque créneau, telle qu'elle apparaît sur le planning (échelle masquée dans les blocs)
  const timeOf = new Map<string, string>();
  new Set(courseRevisions.map((r) => r.scheduledDate)).forEach((date) => {
    const dayRevs = revisions.filter((r) => r.scheduledDate === date);
    resolveDayLayout(dayRevs, getDayWindow(settings, date).start, getDayBreaks(settings, date)).forEach((p) => {
      timeOf.set(p.id, `${formatTime(p.start)}–${formatTime(p.end)}`);
    });
  });

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdateCourse(course.id, {
      title: title.trim(),
      itemCode: itemCode.trim() || 'MED',
      subjectId,
      folderId,
      customColor: customColor || undefined,
      notes: notes.trim(),
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-fit min-w-[min(28rem,100%)] max-w-[min(92vw,48rem)] my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Subject / Course Color Bar */}
        <div className="h-2 w-full" style={{ backgroundColor: effectiveColor }} />
        {onBackToSlot && (
          <button
            type="button"
            onClick={onBackToSlot}
            className="mx-6 mt-3 flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('Retour au créneau')}
          </button>
        )}

        {/* Header */}
        <div data-edit-zone className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div
              className="p-2.5 rounded-xl shrink-0"
              style={{ backgroundColor: currentSubject?.accentBg }}
            >
              <BookOpen className="w-5 h-5" style={{ color: currentSubject?.color }} />
            </div>

            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="subject-badge px-2.5 py-0.5 rounded-md text-xs font-bold"
                  style={getSubjectBadgeStyle(course, currentSubject)}
                  title={pathLabel.full}
                >
                  {pathLabel.text}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  {course.itemCode}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  J0 : {formatFrenchDate(course.j0Date)}
                </span>
              </div>

              {!isEditing ? (
                <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {course.title}
                </h2>
              ) : (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-bold border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500"
                    placeholder={t('Titre du cours')}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={itemCode}
                      onChange={(e) => setItemCode(e.target.value)}
                      className="px-2.5 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                      placeholder={t('Code (EDN-103)')}
                    />
                  </div>
                  <FolderTreePicker
                    subjects={subjects}
                    subjectId={subjectId}
                    folderId={folderId}
                    onChange={(sid, fid) => {
                      setSubjectId(sid);
                      setFolderId(fid);
                    }}
                    onUpdateSubject={onUpdateSubject}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title={t('Modifier le titre ou l\'emplacement')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('Enregistrer')}</span>
              </button>
            )}

            <button
              aria-label={t('Fermer')}
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* Mastery Rating Bar */}
          <div className="flex items-center gap-2" title={t('Auto-évaluation directe de la mémoire à long terme')}>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('Niveau de maîtrise')}</span>
            <MasteryStars
              level={course.mastery}
              onChange={(newLevel) => onUpdateCourse(course.id, { mastery: newLevel })}
              size={18}
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 min-w-[4.5rem]">{MASTERY_CONFIG[course.mastery]?.shortLabel}</span>
          </div>

          {/* Progression dans le temps (largeur proportionnelle aux jours) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <RetentionTimeline course={course} revisions={revisions} />
          </div>

          {/* Notes & Key Points */}
          <div data-edit-zone>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {t('Notes du cours & Pièges d\'annales EDN')}
              </label>
              {isEditing && (
                <span className="text-[11px] text-teal-600 font-medium">{t('Mode édition actif')}</span>
              )}
            </div>
            {isEditing ? (
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                minRows={6}
                placeholder={t('Ex: Critères de Framingham, posologies clés, arbres diagnostiques...')}
                className="w-full p-3 text-sm leading-relaxed border border-slate-300 dark:border-slate-700 rounded-xl dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            ) : (
              <div
                onClick={() => setIsEditing(true)}
                className="cursor-pointer group p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300"
              >
                {course.notes ? (
                  <RichNote text={course.notes} />
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">
                    {t('Aucune note pour le moment. Cliquez ici ou sur le crayon pour en ajouter...')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Journal des notes saisies à chaque créneau */}
          <RevisionNotesJournal
            courseId={course.id}
            revisions={revisions}
            title={t('Journal des créneaux (notes par J)')}
          />

          {/* Spaced Repetition Cycle (Méthode des J) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-teal-600" />
                  <span>{t('Planning des répétitions (Méthode des J)')}</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('{done} sur {total} créneaux validés', { done: completedCount, total: courseRevisions.length })}
                </span>
              </div>
            </div>

            {/* List of slots */}
            <div className="space-y-2">
              {courseRevisions.map((rev) => {
                const isPastDue = !rev.completed && rev.scheduledDate < todayIso;
                const isToday = rev.scheduledDate === todayIso;
                const isJ0orJ1 = rev.jIndex === 0 || rev.jIndex === 1;

                return (
                  <div
                    key={rev.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      rev.completed
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                        : isToday
                        ? 'bg-teal-50/50 dark:bg-teal-950/30 border-teal-400 dark:border-teal-700 ring-2 ring-teal-500/20'
                        : isPastDue
                        ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onOpenCompleteModal(rev)}
                        className="text-slate-400 hover:text-emerald-600 transition-colors"
                        title={rev.completed ? t('Modifier la validation') : t('Valider ce créneau')}
                      >
                        <CheckCircle2
                          className={`w-5 h-5 ${
                            rev.completed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!onOpenSlot}
                            onClick={() => onOpenSlot?.(rev)}
                            title={t('Ouvrir ce créneau')}
                            className={`font-bold text-xs px-2 py-0.5 rounded ${onOpenSlot ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'} ${
                              isJ0orJ1
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-300'
                            }`}
                          >
                            J{rev.jIndex}
                          </button>
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                            {formatFrenchDate(rev.scheduledDate)}
                          </span>
                          {timeOf.get(rev.id) && (
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                              {timeOf.get(rev.id)}
                            </span>
                          )}
                          {isToday && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-100 dark:bg-teal-900/50 dark:text-teal-300 px-1.5 py-0.2 rounded">
                              {t('Aujourd\'hui')}
                            </span>
                          )}
                          {isPastDue && (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-900/50 dark:text-rose-300 px-1.5 py-0.2 rounded">
                              {t('En retard')}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {onResizeSlot && !rev.completed ? (
                            <>
                              <span>{t('Créneau de')}</span>
                              <DurationSelect
                                value={rev.durationMinutes}
                                onChange={(m) => onResizeSlot(rev.id, m)}
                                label={t('Durée du créneau J{n}', { n: rev.jIndex })}
                                className="!py-0.5 !px-1 !text-[11px]"
                              />
                            </>
                          ) : (
                            <span>{t('Créneau de {d}', { d: formatMinutes(rev.durationMinutes) })}</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => onOpenCompleteModal(rev)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                          rev.completed
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800'
                            : 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-xs'
                        }`}
                        title={
                          rev.completed
                            ? t('Voir ou modifier la validation')
                            : t('Valider ce créneau sans lancer de séance')
                        }
                      >
                        <Check className="w-3.5 h-3.5" />
                        {!rev.completed && <span>{t('Valider')}</span>}
                      </button>

                      {!rev.completed && (
                        <button
                          onClick={() => onOpenQuickShift(rev)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                          title={t('Décaler ce créneau (cascade automatique)')}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600" />
                          <span>{t('Décaler')}</span>
                        </button>
                      )}

                      {!rev.completed && (
                        <button
                          onClick={() => {
                            onStartStudySession(rev);
                            onClose();
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{t('Lancer')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Liens externes : enregistrés au fil de l'eau, comme la maîtrise et la couleur */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('Liens')}</span>
            <CourseLinksEditor
              links={course.links ?? []}
              linkTypes={getLinkTypes(settings)}
              onChangeLinks={(links) => onUpdateCourse(course.id, { links })}
              onChangeLinkTypes={onChangeLinkTypes}
            />
          </div>

          {/* Couleur du cours dans le calendrier (version discrète) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full ring-1 ring-black/10 shrink-0"
                  style={{ backgroundColor: effectiveColor }}
                />
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {t('Couleur dans le calendrier')}
                  <span className="text-slate-400 dark:text-slate-500">
                    {' '}· {customColor ? t('personnalisée') : t('matière ({code})', { code: currentSubject.code })}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                {customColor && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomColor(undefined);
                      onUpdateCourse(course.id, { customColor: undefined });
                    }}
                    className="text-[11px] text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 hover:underline"
                  >
                    {t('Réinitialiser')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowColorPicker((v) => !v)}
                  className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  {showColorPicker ? t('Masquer') : t('Modifier')}
                </button>
              </div>
            </div>

            {showColorPicker && (
              <div className="flex items-center gap-1.5 flex-wrap pt-3">
                {PRESET_COURSE_COLORS.map((c) => {
                  const isSelected = effectiveColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        setCustomColor(c.hex);
                        onUpdateCourse(course.id, { customColor: c.hex });
                      }}
                      title={c.name}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${
                        isSelected
                          ? 'ring-2 ring-offset-1 ring-slate-700 dark:ring-white dark:ring-offset-slate-900 scale-110'
                          : 'hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white drop-shadow-xs" />}
                    </button>
                  );
                })}

                <label
                  title={t('Couleur personnalisée')}
                  className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 hover:border-teal-500 cursor-pointer flex items-center justify-center bg-white dark:bg-slate-900"
                >
                  <input
                    type="color"
                    value={effectiveColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      onUpdateCourse(course.id, { customColor: e.target.value });
                    }}
                    className="sr-only"
                  />
                  <Plus className="w-3 h-3 text-slate-500" />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  t('Supprimer définitivement le cours « {title} » et toutes ses révisions planifiées ?', { title: course.title })
                )
              ) {
                onDeleteCourse(course.id);
                onClose();
              }
            }}
            className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('Supprimer le cours')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shadow-2xs"
          >
            {t('Fermer')}
          </button>
        </div>
      </div>
    </div>
  );
};
