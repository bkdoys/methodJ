import { AppSettings, Course, RevisionItem } from '../types';
import { addDays, diffInDays } from './dateUtils';

export const COMMON_J_POOL = [0, 1, 2, 3, 5, 7, 10, 14, 15, 21, 30, 45, 60, 90, 180];

/** Liste des J proposés (réglages), triée, sans doublon, avec J0 ; sans réglage, la liste d'origine. */
export function getJPool(settings: { jPool?: number[] }): number[] {
  const raw = Array.isArray(settings.jPool) ? settings.jPool : COMMON_J_POOL;
  const valid = raw.filter((j) => Number.isInteger(j) && j >= 0 && j <= 365);
  return [...new Set([0, ...valid])].sort((a, b) => a - b);
}

/** Suggestions à l'ajout d'un intervalle (la saisie libre reste possible, de 1 à 365 jours). */
export const J_CHOICES = [4, 6, 12, 20, 28, 35, 40, 50, 75, 120, 240, 365];

export const DEFAULT_J_PATTERNS = {
  ednClassique: [0, 1, 3, 7, 15, 30, 60],
  passIntensif: [0, 1, 3, 7, 14, 21, 30],
  cycleLong: [0, 1, 3, 7, 15, 30, 60, 90, 180],
  sprintPartiels: [0, 1, 2, 4, 7, 12],
};

export type SlotDurationSettings = Partial<
  Pick<AppSettings, 'slotDurationJ0J1' | 'slotDurationOthers' | 'slotDurationDefault' | 'slotDurationByJ'>
>;

const isValidDuration = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 5 && n <= 600;

/** Cours sans J programmé : on lui ajoute des révisions R à la main. */
export const isFreeCourse = (course: Pick<Course, 'mode'>): boolean => course.mode === 'free';

/** Révision R (ajoutée à la main) : jamais en cascade, son `jIndex` est son numéro, pas un nombre de jours. */
export const isRReview = (rev: Pick<RevisionItem, 'kind'>): boolean => rev.kind === 'R';

/** Étiquette d'un créneau : « J3 », ou « R2 » pour une révision libre. */
export const revLabel = (rev: Pick<RevisionItem, 'kind' | 'jIndex'>): string => `${rev.kind === 'R' ? 'R' : 'J'}${rev.jIndex}`;

/** Durée par défaut d'un créneau, sans réglage propre à un J (c'est celle des révisions R). */
export function getDefaultSlotDurationMinutes(settings?: SlotDurationSettings): number {
  return isValidDuration(settings?.slotDurationDefault) ? settings!.slotDurationDefault! : settings?.slotDurationOthers ?? 60;
}

/**
 * Durée d'un créneau : réglage propre à ce J, sinon durée par défaut. Sans réglage « par J » (anciens comptes),
 * J0 et J1 gardent leur durée d'origine (90 min) et les autres 60 min.
 */
export function getSlotDurationMinutes(jIndex: number, settings?: SlotDurationSettings): number {
  const own = settings?.slotDurationByJ?.[String(jIndex)];
  if (isValidDuration(own)) return own;
  const fallback = getDefaultSlotDurationMinutes(settings);
  if (!settings?.slotDurationByJ && (jIndex === 0 || jIndex === 1)) return settings?.slotDurationJ0J1 ?? 90;
  return fallback;
}

/**
 * Generates initial revision items for a course based on its J0 and active J list.
 */
export function generateRevisionsForCourse(
  courseId: string,
  j0Date: string,
  activeJList: number[],
  settings?: SlotDurationSettings
): RevisionItem[] {
  const sortedJ = [...activeJList].sort((a, b) => a - b);

  return sortedJ.map((jVal, idx) => ({
    id: `rev_${courseId}_j${jVal}_${Math.random().toString(36).substring(2, 9)}`,
    courseId,
    jIndex: jVal,
    scheduledDate: addDays(j0Date, jVal),
    durationMinutes: getSlotDurationMinutes(jVal, settings),
    completed: false,
    slotOrder: idx,
  }));
}

export interface CascadeShiftResult {
  updatedRevisions: RevisionItem[];
  shiftedCount: number;
  deltaDays: number;
  shiftedJLabels: string[];
}

/**
 * Cascade shifts a revision and all subsequent revisions of the same course.
 * "SI on décale un J1 par exemple il faut décaler automatiquement les révisions suivantes
 * pour maintenir la cohérence du planning."
 */
export function applyCascadeShift(
  allRevisions: RevisionItem[],
  targetRevisionId: string,
  newScheduledDate: string,
  autoCascade: boolean = true
): CascadeShiftResult {
  const target = allRevisions.find(r => r.id === targetRevisionId);
  if (!target) {
    return {
      updatedRevisions: allRevisions,
      shiftedCount: 0,
      deltaDays: 0,
      shiftedJLabels: [],
    };
  }

  const oldDate = target.scheduledDate;
  const deltaDays = diffInDays(newScheduledDate, oldDate);

  if (deltaDays === 0) {
    return {
      updatedRevisions: allRevisions,
      shiftedCount: 0,
      deltaDays: 0,
      shiftedJLabels: [],
    };
  }

  const shiftedJLabels: string[] = [];

  const updatedRevisions = allRevisions.map(rev => {
    // If it's the target revision itself
    if (rev.id === targetRevisionId) {
      shiftedJLabels.push(revLabel(rev));
      return {
        ...rev,
        scheduledDate: newScheduledDate,
      };
    }

    // If cascade is on, shift all subsequent uncompleted revisions of the same course
    // (les révisions R n'entrent jamais dans une cascade, ni comme point de départ ni comme créneau décalé)
    if (
      autoCascade &&
      !isRReview(target) &&
      !isRReview(rev) &&
      rev.courseId === target.courseId &&
      rev.jIndex > target.jIndex &&
      !rev.completed
    ) {
      shiftedJLabels.push(revLabel(rev));
      return {
        ...rev,
        scheduledDate: addDays(rev.scheduledDate, deltaDays),
      };
    }

    return rev;
  });

  return {
    updatedRevisions,
    shiftedCount: shiftedJLabels.length - 1, // minus target
    deltaDays,
    shiftedJLabels,
  };
}

/**
 * Helper to update course's J pattern: adds missing J revisions or removes deleted J revisions.
 */
export function syncCourseRevisions(
  course: Course,
  existingRevisions: RevisionItem[],
  newActiveJList: number[],
  settings?: SlotDurationSettings
): RevisionItem[] {
  const otherRevisions = existingRevisions.filter(r => r.courseId !== course.id);
  // Les révisions R ne dépendent pas de la liste des J : elles restent telles quelles
  const rReviews = existingRevisions.filter(r => r.courseId === course.id && isRReview(r));
  const currentCourseRevisions = existingRevisions.filter(r => r.courseId === course.id && !isRReview(r));

  const updatedCourseRevisions: RevisionItem[] = [];
  // Un J ajouté après la validation du J0 est suivi dès sa création
  const j0Done = currentCourseRevisions.some((r) => r.jIndex === 0 && r.completed);

  for (const jVal of newActiveJList) {
    const existing = currentCourseRevisions.find(r => r.jIndex === jVal);
    if (existing) {
      updatedCourseRevisions.push(existing);
    } else {
      // New J added: compute scheduledDate from J0
      updatedCourseRevisions.push({
        id: `rev_${course.id}_j${jVal}_${Math.random().toString(36).substring(2, 9)}`,
        courseId: course.id,
        jIndex: jVal,
        scheduledDate: addDays(course.j0Date, jVal),
        durationMinutes: getSlotDurationMinutes(jVal, settings),
        completed: false,
        slotOrder: updatedCourseRevisions.length,
        ...(j0Done && jVal !== 0 ? { originalDate: addDays(course.j0Date, jVal) } : {}),
      });
    }
  }

  return [...otherRevisions, ...updatedCourseRevisions, ...rReviews];
}

/**
 * Figer la date d'origine : quand le J0 d'un cours est validé, chaque autre J reçoit sa date prévue du moment comme
 * référence (`originalDate`). Avant, tout peut être décalé sans trace ; après, `scheduledDate` bouge mais pas elle.
 * Ne renvoie que les créneaux modifiés.
 */
export function freezeOriginalDates(revisions: RevisionItem[], courseId: string): RevisionItem[] {
  return revisions
    .filter((r) => r.courseId === courseId && r.jIndex !== 0 && !isRReview(r) && r.originalDate === undefined)
    .map((r) => ({ ...r, originalDate: r.scheduledDate }));
}

/** J0 annulé : le cycle n'a plus de référence, tout redevient libre. Ne renvoie que les créneaux modifiés. */
export function clearOriginalDates(revisions: RevisionItem[], courseId: string): RevisionItem[] {
  return revisions
    .filter((r) => r.courseId === courseId && r.originalDate !== undefined)
    .map((r) => {
      const { originalDate: _dropped, ...rest } = r;
      return rest;
    });
}

/** Nouvelle révision R d'un cours, numérotée à la suite des siennes, sans heure (à placer avec `assignStartTimes`). */
export function createRReview(
  courseId: string,
  date: string,
  revisions: RevisionItem[],
  settings?: SlotDurationSettings
): RevisionItem {
  const n = Math.max(0, ...revisions.filter((r) => r.courseId === courseId && isRReview(r)).map((r) => r.jIndex)) + 1;
  return {
    id: `rev_${courseId}_r${n}_${Math.random().toString(36).substring(2, 9)}`,
    courseId,
    kind: 'R',
    jIndex: n,
    scheduledDate: date,
    durationMinutes: getDefaultSlotDurationMinutes(settings),
    completed: false,
    slotOrder: revisions.filter((r) => r.scheduledDate === date).length,
  };
}

/** Changement de mode d'un cours : le cours mis à jour et les créneaux à retirer, ajouter ou modifier. */
export interface CourseConversion {
  course: Course;
  removed: RevisionItem[];
  added: RevisionItem[];
  changed: RevisionItem[];
}

/** Passer un cours en mode libre : les créneaux déjà faits restent (historique), les J à faire disparaissent. */
export function convertCourseToFree(course: Course, revisions: RevisionItem[]): CourseConversion {
  return {
    course: { ...course, mode: 'free', activeJList: [] },
    removed: revisions.filter((r) => r.courseId === course.id && !r.completed && !isRReview(r)),
    added: [],
    changed: [],
  };
}

/**
 * Passer un cours libre en méthode des J : un nouveau cycle part de `j0Date`. Les révisions faites restent, celles à
 * faire disparaissent. Les J faits d'un ancien cycle (cours repassé en libre entre-temps) deviennent des R numérotés
 * à la suite, dans l'ordre où ils ont été faits : sinon le cours aurait deux J0.
 */
export function convertCourseToJ(
  course: Course,
  revisions: RevisionItem[],
  j0Date: string,
  jList: number[],
  settings?: SlotDurationSettings
): CourseConversion {
  const own = revisions.filter((r) => r.courseId === course.id);
  let n = Math.max(0, ...own.filter((r) => r.completed && isRReview(r)).map((r) => r.jIndex));
  const changed = own
    .filter((r) => r.completed && !isRReview(r))
    .sort((a, b) => (a.completedDate ?? a.scheduledDate).localeCompare(b.completedDate ?? b.scheduledDate) || a.jIndex - b.jIndex)
    .map((r) => {
      const { originalDate: _dropped, ...rest } = r;
      return { ...rest, kind: 'R' as const, jIndex: ++n };
    });
  const activeJList = [...new Set([0, ...jList])].sort((a, b) => a - b);
  const { mode: _mode, ...rest } = course;
  return {
    course: { ...rest, j0Date, activeJList },
    removed: own.filter((r) => !r.completed),
    added: generateRevisionsForCourse(course.id, j0Date, activeJList, settings),
    changed,
  };
}

/**
 * Ordre des créneaux d'un cours dans ses fiches : chronologique (date affichée du créneau), J et R mêlés, ce qui reste
 * juste après n'importe quelle suite de passages libre ↔ J. Même jour : J avant R, puis par numéro.
 */
export function compareCourseRevisions(a: RevisionItem, b: RevisionItem): number {
  return (
    a.scheduledDate.localeCompare(b.scheduledDate) ||
    Number(isRReview(a)) - Number(isRReview(b)) ||
    a.jIndex - b.jIndex
  );
}
