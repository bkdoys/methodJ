import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { formatFrenchDayShort, formatMinutes } from '../utils/dateUtils';
import { analyzeDay, describeDayAlert } from '../utils/dayLoad';
import { AlertTriangle } from 'lucide-react';
import { computeDisplayRange, getBlockDetails, getDayBreaks, getDayWindow, getTimelineConfig, resolveDayLayout } from '../utils/dayLayout';
import { getCourseEffectiveColor, getCourseGradientStyle, getSubject } from '../utils/colorUtils';
import { formatTime } from '../utils/dayLayout';
import { CrossDayHover, DayColumn, ForceDayToggle, HourZoomControl, SCALE_WIDTH_CLASS, TimelineScale } from './TimelineParts';
import { t } from '../i18n';
import { revLabel } from '../utils/jMethod';

const NO_REVISIONS: RevisionItem[] = [];

interface MultiDayTimelineProps {
  /** Les jours affichés (la semaine, ou N jours consécutifs), au format YYYY-MM-DD. */
  days: string[];
  todayIso: string;
  selectedDate: string;
  revisions: RevisionItem[];
  courses: Course[];
  subjects: Subject[];
  settings: AppSettings;
  /** Hauteur d'une heure, en pixels. */
  hourHeight: number;
  onChangeHourHeight: (direction: -1 | 1) => void;
  activeSessionRevisionId?: string;
  onCloseStudySession?: () => void;
  /** Ouvre ce jour dans la vue Jour. */
  onOpenDay: (dateIso: string) => void;
  onOpenSlotDetail: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  onMoveSlots: (updates: { id: string; startTime: string; slotOrder: number }[]) => void;
  /** Dépôt d'un créneau dans un autre jour (glisser entre colonnes). */
  onMoveToDay: (revisionId: string, targetDate: string, startMinutes: number) => void;
  onToggleForcedDay?: (date: string) => void;
  /** Aperçu : rien n'est cliquable ni déplaçable (le zoom reste). */
  readOnly?: boolean;
  /** Aperçu : créneaux mis en avant, les autres sont atténués. */
  highlightIds?: ReadonlySet<string>;
}

/** En dessous de cette largeur de colonne, les blocs passent en version compacte. */
const COMPACT_BELOW_COLUMN_PX = 230;
/** Largeur minimale d'une colonne : au-delà du conteneur, la vue défile horizontalement. */
const MIN_COLUMN_PX = 120;

/**
 * Plusieurs jours (la semaine, ou N jours) sur une échelle horaire commune. Chaque créneau se déplace verticalement
 * dans son jour (poignée ou flèches) ; pour le changer de jour, utiliser « Décaler ».
 */
export const MultiDayTimeline: React.FC<MultiDayTimelineProps> = ({
  days,
  todayIso,
  selectedDate,
  revisions,
  settings,
  hourHeight,
  onChangeHourHeight,
  onOpenDay,
  onMoveToDay,
  onToggleForcedDay,
  readOnly = false,
  ...rest
}) => {
  const pxPerMin = hourHeight / 60;
  const config = getTimelineConfig(settings);
  const [dragExtent, setDragExtent] = useState<number | null>(null);
  const details = getBlockDetails(settings);

  // Colonnes assez larges : blocs complets ; sinon version compacte
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setGridWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const columnWidth = gridWidth > 0 ? gridWidth / days.length : MIN_COLUMN_PX;
  const compact = columnWidth < COMPACT_BELOW_COLUMN_PX;

  // Glisser entre jours : colonne sous le pointeur + aperçu du dépôt
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hover, setHover] = useState<CrossDayHover | null>(null);
  const resolveTargetDay = useCallback(
    (clientX: number): string | null => {
      const rects = columnRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
      const firstIdx = rects.findIndex((r) => r);
      if (firstIdx < 0) return null;
      const hit = rects.findIndex((r) => r && clientX >= r.left && clientX < r.right);
      if (hit >= 0) return days[hit];
      // Hors des colonnes : on prend la plus proche (bord gauche ou droit)
      const lastIdx = rects.length - 1 - [...rects].reverse().findIndex((r) => r);
      if (clientX < rects[firstIdx]!.left) return days[firstIdx];
      if (clientX >= rects[lastIdx]!.right) return days[lastIdx];
      return null;
    },
    [days]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, RevisionItem[]>(days.map((d) => [d, []]));
    revisions.forEach((r) => map.get(r.scheduledDate)?.push(r));
    return map;
  }, [revisions, days]);

  // Une seule plage pour toute la semaine : les colonnes restent alignées sur la même échelle
  const windows = useMemo(() => days.map((d) => getDayWindow(settings, d)), [days, settings]);
  const allPlacements = useMemo(
    () => days.flatMap((d, i) => resolveDayLayout(byDay.get(d) ?? NO_REVISIONS, windows[i].start, getDayBreaks(settings, d))),
    [days, byDay, windows, settings]
  );
  const { displayStart, displayEnd } = computeDisplayRange(
    allPlacements,
    config.startHour * 60,
    config.endHour * 60,
    dragExtent,
    windows
  );
  const totalHeight = (displayEnd - displayStart) * pxPerMin;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-0.5 @lg:p-1 overflow-x-auto">
      <div style={{ minWidth: 48 + days.length * MIN_COLUMN_PX }}>
        {/* En-têtes de jours : un clic ouvre le jour (vue Jour) */}
        <div className="flex">
          <div className="w-12 shrink-0 flex items-end justify-end pb-1">
            <HourZoomControl hourHeight={hourHeight} onChange={onChangeHourHeight} />
          </div>
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((dayIso) => {
              const dayRevs = byDay.get(dayIso) ?? [];
              const total = dayRevs.reduce((acc, r) => acc + r.durationMinutes, 0);
              const load = analyzeDay(dayIso, dayRevs, settings);
              const isToday = dayIso === todayIso;
              const isSelected = dayIso === selectedDate;
              return (
                <div key={dayIso} className="relative">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onOpenDay(dayIso)}
                  title={t('Ouvrir ce jour')}
                  aria-label={t('Ouvrir le {day}', { day: formatFrenchDayShort(dayIso) })}
                  className={`block w-full px-2 py-1.5 rounded-xl border text-left transition-colors ${
                    isToday
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/40 dark:border-teal-700'
                      : isSelected
                      ? 'border-teal-300 dark:border-teal-800'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase block truncate">
                    {formatFrenchDayShort(dayIso)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono ${
                      load.alert ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-teal-700 dark:text-teal-400'
                    }`}
                    title={load.alert ? describeDayAlert(load) : undefined}
                  >
                    {load.alert && <AlertTriangle className="w-3 h-3 shrink-0" />}
                    {dayRevs.length === 0 ? '—' : `${formatMinutes(total)} · ${dayRevs.length}`}
                  </span>
                </button>
                {!readOnly && (
                  <div className="absolute top-1 right-1">
                    <ForceDayToggle date={dayIso} settings={settings} onToggle={onToggleForcedDay} />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>

        <div data-hour-grid className="relative mt-3 mb-2" style={{ height: totalHeight }}>
          <TimelineScale displayStart={displayStart} displayEnd={displayEnd} pxPerMin={pxPerMin} />
          <div
            ref={gridRef}
            className={`absolute top-0 bottom-0 ${SCALE_WIDTH_CLASS} right-0 grid gap-1 ${readOnly ? 'pointer-events-none' : ''}`}
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((dayIso) => (
              <div
                key={dayIso}
                ref={(el) => {
                  columnRefs.current[days.indexOf(dayIso)] = el;
                }}
                className={`relative rounded-lg ${dayIso === todayIso ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''} ${
                  hover?.date === dayIso ? 'ring-2 ring-teal-500 bg-teal-50/60 dark:bg-teal-950/40' : ''
                }`}
              >
                <DayColumn
                  {...rest}
                  date={dayIso}
                  isToday={dayIso === todayIso}
                  revisions={byDay.get(dayIso) ?? NO_REVISIONS}
                  settings={settings}
                  displayStart={displayStart}
                  displayEnd={displayEnd}
                  pxPerMin={pxPerMin}
                  compact={compact}
                  details={details}
                  onDragExtent={setDragExtent}
                  resolveTargetDay={resolveTargetDay}
                  onCrossDayHover={setHover}
                  onMoveToDay={onMoveToDay}
                />
                {/* Aperçu du dépôt : le créneau à l'heure visée dans ce jour */}
                {hover?.date === dayIso && (() => {
                  const dragged = revisions.find((r) => r.id === hover.revisionId);
                  const course = dragged ? rest.courses.find((c) => c.id === dragged.courseId) : undefined;
                  if (!dragged || !course) return null;
                  const subject = getSubject(course.subjectId, rest.subjects);
                  const g = getCourseGradientStyle(getCourseEffectiveColor(course, subject), false);
                  return (
                    <div
                      className="absolute left-0 right-0 z-40 rounded-xl overflow-hidden pointer-events-none shadow-2xl ring-2 ring-white/90 opacity-90"
                      style={{
                        top: (hover.start - displayStart) * pxPerMin,
                        height: Math.max(14, dragged.durationMinutes * pxPerMin - 3),
                        background: g.background,
                        color: g.color,
                        border: g.border,
                      }}
                      aria-hidden="true"
                    >
                      <div className="p-1.5 text-[11px] font-bold leading-tight">
                        <span className="font-mono">{formatTime(hover.start)}</span> · {revLabel(dragged)}
                        <span className="block font-semibold line-clamp-2">{course.title}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
