import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { APP_FILE_PREFIX } from '../appInfo';
import { DEFAULT_SETTINGS, getInitialSeedCoursesAndRevisions } from './seedData';
import { DEFAULT_SUBJECTS } from './demoContent';
import { t } from '../i18n';

const STORAGE_KEYS = {
  COURSES: 'medj_courses_v1',
  REVISIONS: 'medj_revisions_v1',
  SUBJECTS: 'medj_subjects_v1',
  SETTINGS: 'medj_settings_v1',
};

export interface AppDataState {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
}

const LAST_UID_KEY = 'medj_last_uid_v1';

/**
 * Dernier compte connecté sur cet appareil. Au rechargement, Firebase met un instant à restaurer la session :
 * en attendant, on lit et on écrit les données de ce compte (pas celles, plus anciennes, d'avant la connexion).
 */
export function getLastUid(): string | null {
  try {
    return localStorage.getItem(LAST_UID_KEY);
  } catch {
    return null;
  }
}

export function setLastUid(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(LAST_UID_KEY, uid);
    else localStorage.removeItem(LAST_UID_KEY);
  } catch {
    // stockage indisponible : on retombe sur le comportement sans compte
  }
}

function getStorageKey(base: string, userId?: string | null): string {
  return userId ? `${base}_${userId}` : base;
}

export function loadStoredData(userId?: string | null): AppDataState {
  try {
    const kCourses = getStorageKey(STORAGE_KEYS.COURSES, userId);
    const kRevisions = getStorageKey(STORAGE_KEYS.REVISIONS, userId);
    const kSubjects = getStorageKey(STORAGE_KEYS.SUBJECTS, userId);
    const kSettings = getStorageKey(STORAGE_KEYS.SETTINGS, userId);

    let rawCourses = localStorage.getItem(kCourses);
    let rawRevisions = localStorage.getItem(kRevisions);
    let rawSubjects = localStorage.getItem(kSubjects);
    let rawSettings = localStorage.getItem(kSettings);

    // If a user logs in and has no scoped data yet, check for unscoped local data to migrate!
    if (userId && (!rawCourses || !rawRevisions)) {
      const unscopedCourses = localStorage.getItem(STORAGE_KEYS.COURSES);
      const unscopedRevisions = localStorage.getItem(STORAGE_KEYS.REVISIONS);
      if (unscopedCourses && unscopedRevisions) {
        rawCourses = unscopedCourses;
        rawRevisions = unscopedRevisions;
        rawSubjects = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
        rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      }
    }

    if (!rawCourses || !rawRevisions) {
      // First time initialization only if absolutely no data exists
      const initial = getInitialSeedCoursesAndRevisions();
      saveStoredData(initial.courses, initial.revisions, DEFAULT_SUBJECTS, DEFAULT_SETTINGS, userId);
      return {
        courses: initial.courses,
        revisions: initial.revisions,
        subjects: DEFAULT_SUBJECTS,
        settings: DEFAULT_SETTINGS,
      };
    }

    const courses: Course[] = JSON.parse(rawCourses);
    const revisions: RevisionItem[] = JSON.parse(rawRevisions);
    const subjects: Subject[] = rawSubjects ? JSON.parse(rawSubjects) : DEFAULT_SUBJECTS;
    const settings: AppSettings = rawSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) } : DEFAULT_SETTINGS;

    return { courses, revisions, subjects, settings };
  } catch (err) {
    console.error('Error loading stored data:', err);
    const initial = getInitialSeedCoursesAndRevisions();
    return {
      courses: initial.courses,
      revisions: initial.revisions,
      subjects: DEFAULT_SUBJECTS,
      settings: DEFAULT_SETTINGS,
    };
  }
}

export function saveStoredData(
  courses: Course[],
  revisions: RevisionItem[],
  subjects: Subject[],
  settings: AppSettings,
  userId?: string | null
) {
  try {
    const kCourses = getStorageKey(STORAGE_KEYS.COURSES, userId);
    const kRevisions = getStorageKey(STORAGE_KEYS.REVISIONS, userId);
    const kSubjects = getStorageKey(STORAGE_KEYS.SUBJECTS, userId);
    const kSettings = getStorageKey(STORAGE_KEYS.SETTINGS, userId);

    localStorage.setItem(kCourses, JSON.stringify(courses));
    localStorage.setItem(kRevisions, JSON.stringify(revisions));
    localStorage.setItem(kSubjects, JSON.stringify(subjects));
    localStorage.setItem(kSettings, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save to localStorage', err);
  }
}

export function exportBackupJson(data: AppDataState): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${APP_FILE_PREFIX}-revisions-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportBackupJson(jsonString: string): AppDataState | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.revisions)) {
      throw new Error(t('Fichier de sauvegarde invalide (manque courses ou revisions)'));
    }
    if (parsed.courses.length > 10000 || parsed.revisions.length > 100000) {
      throw new Error(t('Fichier de sauvegarde trop volumineux'));
    }
    for (const c of parsed.courses) {
      if (typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.j0Date !== 'string') {
        throw new Error(t('Structure de cours invalide'));
      }
    }
    for (const r of parsed.revisions) {
      if (typeof r.id !== 'string' || typeof r.courseId !== 'string' || typeof r.completed !== 'boolean') {
        throw new Error(t('Structure de révision invalide'));
      }
    }
    return {
      courses: parsed.courses,
      revisions: parsed.revisions,
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : DEFAULT_SUBJECTS,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch (err) {
    console.error('Erreur import JSON:', err);
    return null;
  }
}
