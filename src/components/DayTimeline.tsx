import React, { useMemo, useState } from 'react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { computeDisplayRange, getBlockDetails, getDayBreaks, getDayWindow, getTimelineConfig, resolveDayLayout } from '../utils/dayLayout';
import { DayColumn, ForceDayToggle, HourZoomControl, SCALE_WIDTH_CLASS, TimelineScale } from './TimelineParts';
import { t } from '../i18n';

interface DayTimelineProps {
  date: string;
  isToday: boolean;
  /** Créneaux de la journée. */
  revisions: RevisionItem[];
  courses: Course[];
  subjects: Subject[];
  settings: AppSettings;
  /** Hauteur d'une heure, en pixels. */
  hourHeight: number;
  onChangeHourHeight: (direction: -1 | 1) => void;
  onToggleForcedDay?: (date: string) => void;
  activeSessionRevisionId?: string;
  onCloseStudySession?: () => void;
  onOpenSlotDetail: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  onMoveSlots: (updates: { id: string; startTime: string; slotOrder: number }[]) => void;
}

/**
 * Journée sur une échelle horaire : chaque créneau est un bloc dont la hauteur suit la durée.
 * On le déplace avec la poignée (souris, doigt ou flèches du clavier) ; l'heure se cale sur le pas
 * choisi dans les préférences et les créneaux gênés sont repoussés plus tard.
 */
export const DayTimeline: React.FC<DayTimelineProps> = ({
  date,
  settings,
  revisions,
  hourHeight,
  onChangeHourHeight,
  onToggleForcedDay,
  ...rest
}) => {
  const pxPerMin = hourHeight / 60;
  const config = getTimelineConfig(settings);
  const win = getDayWindow(settings, date);
  const breaks = useMemo(() => getDayBreaks(settings, date), [settings, date]);
  const [dragExtent, setDragExtent] = useState<number | null>(null);

  const basePlacements = useMemo(() => resolveDayLayout(revisions, win.start, breaks), [revisions, win.start, breaks]);
  const { displayStart, displayEnd } = computeDisplayRange(
    basePlacements,
    config.startHour * 60,
    config.endHour * 60,
    dragExtent,
    [win]
  );
  const totalHeight = (displayEnd - displayStart) * pxPerMin;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-0.5 @lg:p-1">
      {/* Réglage de l'échelle : discret, au-dessus des heures */}
      <div className="flex items-center justify-between gap-2">
        <div className="w-12 flex justify-end">
          <HourZoomControl hourHeight={hourHeight} onChange={onChangeHourHeight} />
        </div>
        <ForceDayToggle date={date} settings={settings} onToggle={onToggleForcedDay} showLabel />
      </div>
      <div className="relative mt-3 mb-2" style={{ height: totalHeight }} aria-label={t('Journée du {date}', { date })}>
        <TimelineScale displayStart={displayStart} displayEnd={displayEnd} pxPerMin={pxPerMin} />
        <div className={`absolute top-0 bottom-0 ${SCALE_WIDTH_CLASS} right-0`}>
          <DayColumn
            {...rest}
            date={date}
            settings={settings}
            revisions={revisions}
            displayStart={displayStart}
            displayEnd={displayEnd}
            pxPerMin={pxPerMin}
            details={getBlockDetails(settings)}
            onDragExtent={setDragExtent}
          />
        </div>
      </div>
    </div>
  );
};
