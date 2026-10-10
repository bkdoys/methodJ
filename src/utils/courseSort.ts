import { Course, RevisionItem, Subject } from '../types';
import { getLocale, t } from '../i18n';

export type CourseSortMode =
  | 'recent'
  | 'title'
  | 'subject'
  | 'next'
  | 'j0-new'
  | 'j0-old'
  | 'mastery-low'
  | 'mastery-high'
  | 'progress';

export const COURSE_SORT_OPTIONS: { value: CourseSortMode; label: string }[] = [
  { value: 'recent', get label() { return t('Ajoutés récemment'); } },
  { value: 'next', get label() { return t('Prochaine révision'); } },
  { value: 'mastery-low', get label() { return t('Maîtrise : faible d\'abord'); } },
  { value: 'mastery-high', get label() { return t('Maîtrise : forte d\'abord'); } },
  { value: 'subject', get label() { return t('Matière (A → Z)'); } },
  { value: 'title', get label() { return t('Titre (A → Z)'); } },
  { value: 'j0-new', get label() { return t('J0 : plus récent d\'abord'); } },
  { value: 'j0-old', get label() { return t('J0 : plus ancien d\'abord'); } },
  { value: 'progress', get label() { return t('Progression : moins avancés d\'abord'); } },
];

export const DEFAULT_COURSE_SORT: CourseSortMode = 'recent';

export function isCourseSortMode(value: unknown): value is CourseSortMode {
  return COURSE_SORT_OPTIONS.some((o) => o.value === value);
}

const collators = new Map<string, Intl.Collator>();
const getCollator = (): Intl.Collator => {
  const locale = getLocale();
  let collator = collators.get(locale);
  if (!collator) {
    collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collators.set(locale, collator);
  }
  return collator;
};
const byTitle = (a: Course, b: Course) => getCollator().compare(a.title, b.title);
// Toujours un ordre total : en dernier recours l'id, pour qu'un tri ne dépende jamais de l'ordre d'entrée
const byId = (a: Course, b: Course) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Trie les cours (sans modifier le tableau d'origine). Les égalités sont départagées par
 * le titre puis l'id, donc le résultat est identique quel que soit l'ordre d'entrée
 * (utile : l'ordre du tableau change entre le local et le cloud).
 */
export function sortCourses(
  courses: Course[],
  revisions: RevisionItem[],
  subjects: Subject[],
  mode: CourseSortMode
): Course[] {
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  // Par cours : prochaine date à faire, et part de créneaux validés
  const stats = new Map<string, { next: string | null; done: number; total: number }>();
  courses.forEach((c) => stats.set(c.id, { next: null, done: 0, total: 0 }));
  revisions.forEach((r) => {
    const s = stats.get(r.courseId);
    if (!s) return;
    s.total++;
    if (r.completed) s.done++;
    else if (s.next === null || r.scheduledDate < s.next) s.next = r.scheduledDate;
  });
  const progress = (c: Course) => {
    const s = stats.get(c.id)!;
    return s.total === 0 ? 0 : s.done / s.total;
  };

  const primary: Record<CourseSortMode, (a: Course, b: Course) => number> = {
    recent: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    title: byTitle,
    subject: (a, b) =>
      getCollator().compare(subjectName.get(a.subjectId) ?? '', subjectName.get(b.subjectId) ?? ''),
    // Les cours sans révision à venir passent en dernier
    next: (a, b) => {
      const na = stats.get(a.id)!.next;
      const nb = stats.get(b.id)!.next;
      if (na === nb) return 0;
      if (na === null) return 1;
      if (nb === null) return -1;
      return na < nb ? -1 : 1;
    },
    'j0-new': (a, b) => (a.j0Date < b.j0Date ? 1 : a.j0Date > b.j0Date ? -1 : 0),
    'j0-old': (a, b) => (a.j0Date < b.j0Date ? -1 : a.j0Date > b.j0Date ? 1 : 0),
    'mastery-low': (a, b) => a.mastery - b.mastery,
    'mastery-high': (a, b) => b.mastery - a.mastery,
    progress: (a, b) => progress(a) - progress(b),
  };

  return [...courses].sort((a, b) => primary[mode](a, b) || byTitle(a, b) || byId(a, b));
}
