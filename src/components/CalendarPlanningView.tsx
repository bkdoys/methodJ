import React, { useState } from 'react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import {
  addDays,
  addMonths,
  formatFrenchDate,
  formatFrenchDayShort,
  formatMinutes,
  formatMonthYear,
  getIsoWeekNumber,
  getMonthCalendarDays,
  getTodayIso,
  getWeekDays,
  parseIsoDate,
} from '../utils/dateUtils';
import { RatingFx } from './RatingFx';
import { DayTimeline } from './DayTimeline';
import { MultiDayTimeline } from './MultiDayTimeline';
import {
  consecutiveDays,
  DEFAULT_HOUR_HEIGHT,
  formatTime,
  getDayWindow,
  getMultiDayCount,
  nextMultiDayCount,
  normalizeHourHeight,
  stepHourHeight,
} from '../utils/dayLayout';
import { getCourseEffectiveColor, getCourseGradientStyle, getSubject } from '../utils/colorUtils';

import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { t } from '../i18n';
import { getSlotDurationMinutes } from '../utils/jMethod';

/** Hauteur d'une heure choisie avec − / + : un confort d'affichage propre à l'appareil (iPad ≠ ordinateur). */
const HOUR_HEIGHT_KEY = 'medj_timeline_hour_height_v1';

interface CalendarPlanningViewProps {
  revisions: RevisionItem[];
  courses: Course[];
  subjects: Subject[];
  settings: AppSettings;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  /** Créneau dont le chronomètre est ouvert (permet de le refermer d'un second clic). */
  activeSessionRevisionId?: string;
  onCloseStudySession?: () => void;
  /** Enregistre l'heure de début et le rang des créneaux d'une journée (vue chronologie). */
  onMoveSlots: (updates: { id: string; startTime: string; slotOrder: number }[]) => void;
  /** Modifie des réglages (ex. nombre de jours de la vue multi-jours). */
  onChangeSettings?: (patch: Partial<AppSettings>) => void;
  /** Glisser d'un créneau vers un autre jour (vue Semaine). */
  onMoveToDay: (revisionId: string, targetDate: string, startMinutes: number) => void;
  onOpenNewCourseModal: () => void;
  onOpenCourseDetail: (course: Course) => void;
  isSplitView?: boolean;
}

export const CalendarPlanningView: React.FC<CalendarPlanningViewProps> = ({
  revisions,
  courses,
  subjects,
  settings,
  selectedDate,
  onSelectDate,
  onOpenQuickShift,
  onOpenCompleteModal,
  onStartStudySession,
  activeSessionRevisionId,
  onCloseStudySession,
  onMoveSlots,
  onMoveToDay,
  onChangeSettings,
  onOpenNewCourseModal,
  onOpenCourseDetail,
  isSplitView = false,
}) => {
  // Requirement: Vue semaine par défaut en plein écran, ou agenda journalier en Split View
  const [chosenView, setSubView] = useState<'day' | 'days' | 'week' | 'month'>(isSplitView ? 'day' : 'week');
  // En vue scindée, la colonne est étroite : on reste sur la journée (semaine/mois : mode plein écran)
  const subView = isSplitView ? 'day' : chosenView;
  const multiDayCount = getMultiDayCount(settings);
  const multiDays = consecutiveDays(selectedDate, multiDayCount);

  const todayIso = getTodayIso();
  const dayWindow = getDayWindow(settings, selectedDate);

  const [hourHeight, setHourHeight] = useState<number>(() => {
    try {
      return normalizeHourHeight(localStorage.getItem(HOUR_HEIGHT_KEY));
    } catch {
      return DEFAULT_HOUR_HEIGHT;
    }
  });
  const changeHourHeight = (direction: -1 | 1) => {
    const next = stepHourHeight(hourHeight, direction);
    setHourHeight(next);
    try {
      localStorage.setItem(HOUR_HEIGHT_KEY, String(next));
    } catch {
      // stockage indisponible : le réglage reste actif pour cette session
    }
  };

  const getCourse = (courseId: string): Course | undefined => {
    return courses.find((c) => c.id === courseId);
  };

  // Revisions for selected day, sorted by slotOrder
  const dayRevisions = revisions
    .filter((r) => r.scheduledDate === selectedDate)
    .sort((a, b) => a.slotOrder - b.slotOrder);

  const dayTotalMinutes = dayRevisions.reduce((acc, r) => acc + r.durationMinutes, 0);
  const dayCompletedMinutes = dayRevisions
    .filter((r) => r.completed)
    .reduce((acc, r) => acc + r.durationMinutes, 0);

  const targetMinutes = settings.dailyTargetHours * 60;
  const isOverloaded = dayTotalMinutes > targetMinutes;

  // Navigation handlers according to current view
  const handlePrev = () => {
    if (subView === 'day') {
      onSelectDate(addDays(selectedDate, -1));
    } else if (subView === 'days') {
      onSelectDate(addDays(selectedDate, -multiDayCount));
    } else if (subView === 'week') {
      // Requirement: pouvoir naviguer de semaine en semaine
      onSelectDate(addDays(selectedDate, -7));
    } else {
      // Requirement: pouvoir naviguer par mois
      onSelectDate(addMonths(selectedDate, -1));
    }
  };

  const handleNext = () => {
    if (subView === 'day') {
      onSelectDate(addDays(selectedDate, 1));
    } else if (subView === 'days') {
      onSelectDate(addDays(selectedDate, multiDayCount));
    } else if (subView === 'week') {
      // Requirement: pouvoir naviguer de semaine en semaine
      onSelectDate(addDays(selectedDate, 7));
    } else {
      // Requirement: pouvoir naviguer par mois
      onSelectDate(addMonths(selectedDate, 1));
    }
  };

  const handleJumpToday = () => onSelectDate(todayIso);

  // Week View calculation
  const weekDays = getWeekDays(selectedDate);
  const currentWeekNumber = getIsoWeekNumber(selectedDate);

  // Month View calculation
  const selectedDateObj = parseIsoDate(selectedDate);
  const monthCalendarDays = getMonthCalendarDays(
    selectedDateObj.getFullYear(),
    selectedDateObj.getMonth() + 1
  );

  return (
    // @container : la mise en page suit la largeur de cette colonne, pas celle de la fenêtre
    <div className="@container space-y-4">
      {/* View Switcher & Date Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 @lg:p-4 shadow-2xs flex flex-col @3xl:flex-row items-center justify-between gap-3">
        {/* Date Stepper */}
        <div className="flex items-center gap-2 flex-wrap w-full @3xl:w-auto justify-between @3xl:justify-start">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={
                subView === 'days'
                  ? t('{n} jours précédents', { n: multiDayCount })
                  : subView === 'week'
                  ? t('Semaine précédente (-7 jours)')
                  : subView === 'month'
                  ? t('Mois précédent (-1 mois)')
                  : t('Jour précédent (-1 jour)')
              }
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleJumpToday}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                selectedDate === todayIso
                  ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {t('Aujourd\'hui')}
            </button>

            <button
              onClick={handleNext}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={
                subView === 'days'
                  ? t('{n} jours suivants', { n: multiDayCount })
                  : subView === 'week'
                  ? t('Semaine suivante (+7 jours)')
                  : subView === 'month'
                  ? t('Mois suivant (+1 mois)')
                  : t('Jour suivant (+1 jour)')
              }
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Current date / week / month label */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              className="text-xs font-mono font-bold px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
            />

            <span className="text-sm font-bold text-slate-900 dark:text-white capitalize hidden @3xl:inline">
              {subView === 'days'
                ? `${formatFrenchDayShort(multiDays[0])} → ${formatFrenchDayShort(multiDays[multiDays.length - 1])}`
                : subView === 'week'
                ? t('Semaine {n} · Du {from} au {to}', { n: currentWeekNumber, from: formatFrenchDayShort(weekDays[0]), to: formatFrenchDayShort(weekDays[6]) })
                : subView === 'month'
                ? t('Mois de {month}', { month: formatMonthYear(selectedDate) })
                : formatFrenchDate(selectedDate)}
            </span>
          </div>
        </div>


        {/* View Mode Segmented Controls */}
        {!isSplitView && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold w-full @3xl:w-auto justify-center">
            {/* Vue Jour de la date sélectionnée */}
            <button
              onClick={() => setSubView('day')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subView === 'day'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('Jour')}
            </button>

            {/* Plusieurs jours : 1er clic = on y va ; clics suivants = +1 jour (2 → 6, puis retour à 2) */}
            <button
              onClick={() => {
                if (subView !== 'days') setSubView('days');
                else onChangeSettings?.({ multiDayCount: nextMultiDayCount(multiDayCount) });
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subView === 'days'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={
                subView === 'days'
                  ? t('Cliquer pour afficher {n} jours', { n: nextMultiDayCount(multiDayCount) })
                  : t('Vue sur {n} jours (cliquer à nouveau pour changer le nombre)', { n: multiDayCount })
              }
            >
              {t('{n} jours', { n: multiDayCount })}
            </button>

            {/* Semaine avec numéro ISO de 1 à 52 */}
            <button
              onClick={() => setSubView('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subView === 'week'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('Semaine {n}', { n: currentWeekNumber })}
            </button>

            {/* Mois avec nom du mois */}
            <button
              onClick={() => setSubView('month')}
              className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                subView === 'month'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {formatMonthYear(selectedDate).split(' ')[0]}
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. SEMAINE ou N JOURS : échelle horaire commune aux colonnes */}
      {/* ========================================================= */}
      {(subView === 'week' || subView === 'days') && (
        <MultiDayTimeline
          days={subView === 'week' ? weekDays : multiDays}
          todayIso={todayIso}
          selectedDate={selectedDate}
          revisions={revisions}
          courses={courses}
          subjects={subjects}
          settings={settings}
          hourHeight={hourHeight}
          onChangeHourHeight={changeHourHeight}
          activeSessionRevisionId={activeSessionRevisionId}
          onCloseStudySession={onCloseStudySession}
          onOpenDay={(dayIso) => {
            onSelectDate(dayIso);
            setSubView('day');
          }}
          onOpenCourseDetail={onOpenCourseDetail}
          onOpenCompleteModal={onOpenCompleteModal}
          onOpenQuickShift={onOpenQuickShift}
          onStartStudySession={onStartStudySession}
          onMoveSlots={onMoveSlots}
          onMoveToDay={onMoveToDay}
        />
      )}

      {/* ========================================================= */}
      {/* 2. AGENDA JOUR VIEW ("Aujourd'hui") */}
      {/* ========================================================= */}
      {subView === 'day' && (
        <div className="space-y-4">
          {/* Day Workload Progress Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('Charge du jour : {d} planifiées ({n} créneaux)', { d: formatMinutes(dayTotalMinutes), n: dayRevisions.length })}
                </h2>
                {isOverloaded && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-3 h-3" />
                    {t('Dépasse objectif ({n}h)', { n: settings.dailyTargetHours })}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {t('Validé :')}{' '}
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMinutes(dayCompletedMinutes)}
                </span>{' '}
                /{' '}
                <span className="font-mono">{formatMinutes(dayTotalMinutes)}</span> (
                {dayRevisions.filter((r) => r.completed).length}/{dayRevisions.length} créneaux)
              </div>
            </div>

            {/* Visual bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{
                  width: `${
                    dayTotalMinutes > 0
                      ? Math.min(100, (dayCompletedMinutes / dayTotalMinutes) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>
                {t('Créneaux :')}{' '}
                <strong className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatMinutes(getSlotDurationMinutes(99, settings))}
                </strong>{' '}
                {t('par défaut (réglable dans Préférences)')}
              </span>
              <span className="font-mono">
                {t('Plage du jour :')} {formatTime(dayWindow.start)}–{formatTime(dayWindow.end)}
              </span>
            </div>
          </div>

          {/* Stacked Revisions List */}
          {dayRevisions.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('Aucune révision programmée pour ce jour')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {t('Profitez-en pour consolider vos acquis ou planifiez un nouveau cours (J0).')}
              </p>
              <button
                onClick={onOpenNewCourseModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>{t('Planifier un cours (J0)')}</span>
              </button>
            </div>
          ) : (
            <DayTimeline
              date={selectedDate}
              isToday={selectedDate === todayIso}
              revisions={dayRevisions}
              courses={courses}
              subjects={subjects}
              settings={settings}
              hourHeight={hourHeight}
          onChangeHourHeight={changeHourHeight}
              activeSessionRevisionId={activeSessionRevisionId}
              onCloseStudySession={onCloseStudySession}
              onOpenCourseDetail={onOpenCourseDetail}
              onOpenCompleteModal={onOpenCompleteModal}
              onOpenQuickShift={onOpenQuickShift}
              onStartStudySession={onStartStudySession}
              onMoveSlots={onMoveSlots}
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. MOIS (VUE GLOBALE avec navigation mensuelle) */}
      {/* ========================================================= */}
      {subView === 'month' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-teal-600" />
              <span>{formatMonthYear(selectedDate)}</span>
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('Cliquez sur un jour pour l\'ouvrir')}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
            <div>{t('Lun')}</div>
            <div>{t('Mar')}</div>
            <div>{t('Mer')}</div>
            <div>{t('Jeu')}</div>
            <div>{t('Ven')}</div>
            <div>{t('Sam')}</div>
            <div>{t('Dim')}</div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthCalendarDays.map((cell) => {
              const dayRevs = revisions.filter((r) => r.scheduledDate === cell.iso);
              const totalMins = dayRevs.reduce((acc, r) => acc + r.durationMinutes, 0);
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayIso;

              return (
                <div
                  key={cell.iso}
                  onClick={() => {
                    onSelectDate(cell.iso);
                    setSubView('week'); // bascule en semaine pour afficher le détail
                  }}
                  className={`min-h-[75px] p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/20 dark:bg-teal-950/30'
                      : isToday
                      ? 'border-teal-300 dark:border-teal-700 bg-teal-50/15 dark:bg-teal-950/20'
                      : cell.isCurrentMonth
                      ? 'border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
                      : 'border-transparent bg-slate-50/50 dark:bg-slate-800/20 opacity-30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {totalMins > 0 && (
                      <span className="text-[10px] font-mono font-bold text-teal-700 dark:text-teal-400">
                        {formatMinutes(totalMins)}
                      </span>
                    )}
                  </div>

                  {dayRevs.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {dayRevs.slice(0, 3).map((r) => {
                        const course = getCourse(r.courseId);
                        if (!course) return null;
                        const subject = getSubject(course.subjectId, subjects);
                        const effectiveColor = getCourseEffectiveColor(course, subject);
                        const gradientStyle = getCourseGradientStyle(effectiveColor, r.completed);

                        return (
                          <div
                            key={r.id}
                            className={`relative px-1.5 py-0.5 rounded text-[10px] font-bold truncate flex items-center gap-1 shadow-2xs ${
                              r.completed ? 'opacity-65 line-through' : ''
                            }`}
                            style={{
                              background: gradientStyle.background,
                              color: gradientStyle.color,
                            }}
                            title={`J${r.jIndex} · ${course.title}`}
                          >
                            <RatingFx rev={r} size="sm" />
                            <span className="font-extrabold text-[9px] opacity-90">J{r.jIndex}</span>
                            <span className="truncate">{course.title}</span>
                          </div>
                        );
                      })}
                      {dayRevs.length > 3 && (
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-mono block pl-0.5">
                          +{dayRevs.length - 3} autre{dayRevs.length - 3 > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
