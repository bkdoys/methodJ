import { AppSettings, Course, RevisionItem } from '../types';
import { addDays, getTodayIso } from './dateUtils';
import { getSlotDurationMinutes } from './jMethod';
import { getDemoCourses } from './demoContent';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultJPattern: [0, 1, 3, 7, 15, 30, 60],
  autoCascadeShift: true,
  dailyTargetHours: 7,
  slotDurationJ0J1: 90,
  slotDurationOthers: 60,
  dayStartTime: '08:00',
  timelineStartHour: 7,
  timelineEndHour: 23,
  timelineStepMinutes: 30,
  dayWindows: {},
  splitView: true,
  theme: 'light',
};

export function getInitialSeedCoursesAndRevisions(): {
  courses: Course[];
  revisions: RevisionItem[];
} {
  const today = getTodayIso();
  const jPattern = [0, 1, 3, 7, 15, 30, 60];

  const rawCourses = getDemoCourses(today, jPattern);

  const revisions: RevisionItem[] = [];

  rawCourses.forEach((c) => {
    c.activeJList.forEach((jVal, idx) => {
      const scheduledDate = addDays(c.j0Date, jVal);
      // Mark as completed if date is strictly in the past
      const isPast = scheduledDate < today;
      const isToday = scheduledDate === today;

      revisions.push({
        id: `rev_${c.id}_j${jVal}`,
        courseId: c.id,
        jIndex: jVal,
        scheduledDate,
        durationMinutes: getSlotDurationMinutes(jVal),
        completed: isPast,
        completedDate: isPast ? scheduledDate : undefined,
        rating: isPast ? (c.mastery > 0 ? c.mastery : 2) : undefined,
        notes: isToday ? 'Créneau prioritaire du jour' : undefined,
        slotOrder: idx,
      });
    });
  });

  return { courses: rawCourses, revisions };
}
