import { Course, Subject } from '../types';
import { t } from '../i18n';
import { folderColorMap } from './folderColors';

/**
 * Finds a subject by ID with a safe fallback default.
 */
export function getSubject(subjectId: string, subjects: Subject[]): Subject {
  return (
    subjects.find((s) => s.id === subjectId) || {
      id: 'unknown',
      name: t('Matière générale'),
      code: 'MED',
      color: '#0d9488',
      bgColor: 'bg-teal-50',
      textColor: 'text-teal-700',
      borderColor: 'border-teal-200',
      accentBg: '#f0fdfa',
    }
  );
}

export const PRESET_COURSE_COLORS = [
  { get name() { return t('Rose Cardio'); }, hex: '#e11d48' },
  { get name() { return t('Rouge Urgences'); }, hex: '#dc2626' },
  { get name() { return t('Corail Pédiatrie'); }, hex: '#ea580c' },
  { get name() { return t('Ambre Gériatrie'); }, hex: '#d97706' },
  { get name() { return t('Vert Pharma'); }, hex: '#059669' },
  { get name() { return t('Sarcelle / Teal'); }, hex: '#0d9488' },
  { get name() { return t('Cyan Pneumo'); }, hex: '#0284c7' },
  { get name() { return t('Bleu Néphro'); }, hex: '#2563eb' },
  { get name() { return t('Indigo Psychiatrie'); }, hex: '#4f46e5' },
  { get name() { return t('Violet Neuro'); }, hex: '#7c3aed' },
  { get name() { return t('Fuchsia Gynéco'); }, hex: '#c026d3' },
  { get name() { return t('Mauve Hématologie'); }, hex: '#9333ea' },
  { get name() { return t('Rubis Cancéro'); }, hex: '#be123c' },
  { get name() { return t('Vert Forêt Santé Publique'); }, hex: '#16a34a' },
  { get name() { return t('Cuivre Ortho'); }, hex: '#b45309' },
  { get name() { return t('Ardoise / Titane'); }, hex: '#475569' },
];

/**
 * Returns the effective hex color for a course:
 * its own color if it has one, otherwise the color of its folder (chosen, or an automatic shade of the
 * discipline's color), otherwise the discipline's color.
 */
export function getCourseEffectiveColor(course?: Course, subject?: Subject): string {
  if (course?.customColor && course.customColor.trim()) {
    return course.customColor.trim();
  }
  if (course?.folderId && subject) {
    const folderColor = folderColorMap(subject).get(course.folderId);
    if (folderColor) return folderColor;
  }
  if (subject?.color && subject.color.trim()) {
    return subject.color.trim();
  }
  return '#0d9488'; // Default teal
}

/**
 * Adjust hex color brightness by a delta (-255 to +255)
 */
export function adjustHexBrightness(hex: string, delta: number): string {
  const cleanHex = hex.replace('#', '');
  const validHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex.padEnd(6, '0').slice(0, 6);

  const num = parseInt(validHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) + delta;
  let g = ((num >> 8) & 0x00ff) + delta;
  let b = (num & 0x00ff) + delta;

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Check if the color is light or dark to guarantee optimal text contrast
 */
export function getContrastTextColor(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const validHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex.padEnd(6, '0').slice(0, 6);

  const num = parseInt(validHex, 16);
  if (isNaN(num)) return '#ffffff';

  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.68 ? '#0f172a' : '#ffffff';
}

/**
 * Generates an eye-catching, deeply saturated gradient style for calendar course blocks
 */
export function getCourseGradientStyle(color: string, isCompleted = false) {
  const colorStart = adjustHexBrightness(color, 18);
  const colorEnd = adjustHexBrightness(color, -26);
  const textColor = getContrastTextColor(color);
  const isDarkText = textColor === '#0f172a';

  if (isCompleted) {
    return {
      background: `linear-gradient(135deg, ${colorStart} 0%, ${color} 50%, ${colorEnd} 100%)`,
      color: textColor,
      opacity: 0.65,
      border: isDarkText ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.18)',
      boxShadow: `0 2px 6px -2px rgba(0, 0, 0, 0.2)`,
      badgeBg: isDarkText ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.25)',
      badgeText: textColor,
      badgeBorder: isDarkText ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.35)',
      buttonBg: isDarkText ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.22)',
      textShadow: isDarkText ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.25)',
    };
  }

  return {
    background: `linear-gradient(135deg, ${colorStart} 0%, ${color} 48%, ${colorEnd} 100%)`,
    color: textColor,
    opacity: 1,
    border: isDarkText ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.18)',
    boxShadow: `0 2px 6px -1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.08)`,
    badgeBg: isDarkText ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.25)',
    badgeText: textColor,
    badgeBorder: isDarkText ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.35)',
    buttonBg: isDarkText ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.22)',
    textShadow: isDarkText ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.25)',
  };
}

/**
 * Fond très discret pour une carte de cours : un voile de la couleur
 * du cours (alpha faible) qui se superpose au fond blanc / sombre de la carte.
 */
export function getCourseSoftBackground(color: string, isDark = false) {
  const clean = color.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (isNaN(num)) return {};

  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  // Plus léger en clair, un peu plus présent en sombre pour rester visible
  /* const alphaTop = isDark ? 0.1 : 0.06;
  const alphaBottom = isDark ? 0.03 : 0.015; */
  const alphaTop = isDark ? 0.24 : 0.2;
  const alphaBottom = isDark ? 0.1 : 0.08;

  return {
    backgroundImage: `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, ${alphaTop}) 0%, rgba(${r}, ${g}, ${b}, ${alphaBottom}) 100%)`,
    borderColor: `rgba(${r}, ${g}, ${b}, ${isDark ? 0.28 : 0.22})`,
  };
}
/**
 * Variables CSS du badge matière (classe `.subject-badge`, voir index.css) :
 * pastel + texte coloré en clair, puce pleine à la couleur du cours en sombre.
 */
export function getSubjectBadgeStyle(course: Course | undefined, subject: Subject | undefined): Record<string, string> {
  const color = getCourseEffectiveColor(course, subject);
  return {
    '--sb-soft-bg': subject?.accentBg || '#f0fdfa',
    '--sb-soft-fg': subject?.color || color,
    '--sb-solid-bg': color,
    '--sb-solid-fg': getContrastTextColor(color),
  };
}
