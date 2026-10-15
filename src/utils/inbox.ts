import { Course } from '../types';

// « Cartes à trier » : un cours caché qui reçoit les cartes créées sans cours. Identifiant fixe, pour que deux
// appareils ne créent jamais deux boîtes (leurs paquets fusionnent à la synchro) ; discipline à part, absente de la
// liste des disciplines, pour qu'aucune suppression de discipline ne l'emporte. Il n'apparaît que dans la vue Cartes
// et sur le tableau de bord, et seulement quand il contient des cartes : vide, il reste en place, invisible, prêt à
// resservir (le supprimer casserait l'annulation d'un déplacement de cartes).

export const INBOX_COURSE_ID = 'c_inbox';
export const INBOX_SUBJECT_ID = '__inbox';
const INBOX_COLOR = '#64748b';

export const isInboxCourse = (course: Pick<Course, 'id' | 'inbox'>): boolean =>
  course.inbox === true || course.id === INBOX_COURSE_ID;

/** Les cours sans la boîte « à trier » : catalogue, planning, statistiques, tableau de bord. */
export const withoutInbox = (courses: Course[]): Course[] => courses.filter((c) => !isInboxCourse(c));

/** La boîte, à créer quand on ajoute la première carte sans cours (le titre est une donnée, en français). */
export function makeInboxCourse(todayIso: string): Course {
  return {
    id: INBOX_COURSE_ID,
    title: 'Cartes à trier',
    itemCode: '—',
    subjectId: INBOX_SUBJECT_ID,
    customColor: INBOX_COLOR,
    j0Date: todayIso,
    activeJList: [],
    mode: 'free',
    inbox: true,
    mastery: 0,
    createdAt: todayIso,
  };
}
