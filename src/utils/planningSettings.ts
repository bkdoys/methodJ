import { AppSettings } from '../types';
import { t } from '../i18n';
import { getJPool, getSlotDurationMinutes } from './jMethod';
import {
  BlockDetails,
  defaultDayWindowStrings,
  formatTime,
  getDayWindow,
  getMultiDayCount,
  getTimelineConfig,
  parseTime,
} from './dayLayout';

/** Pauses par jour de la semaine (clé `all` = tous les jours), comme dans `AppSettings.breaks`. */
export type BreaksValue = Record<string, { start: string; end: string }[]>;
export type DayWindowStrings = Record<string, { start: string; end: string }>;

/** Libellés des jours, du lundi (index 0) au dimanche. */
export const weekdayLabels = () => [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];

/** Le n-ième jour d'une semaine de référence (0 = lundi) : sert à lire la plage d'un jour de la semaine. */
export const referenceDay = (index: number) => {
  const d = new Date(2026, 9, 5 + index);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Pauses valides seulement (fin après début) ; la liste commune vide est omise, un jour vide reste (= aucune pause ce jour-là). */
export function cleanBreaks(breaks: BreaksValue): BreaksValue {
  const out: BreaksValue = {};
  Object.entries(breaks).forEach(([key, list]) => {
    const valid = list.filter((b) => {
      const s = parseTime(b.start);
      const e = b.end === '23:59' ? 24 * 60 : parseTime(b.end);
      return s !== null && e !== null && e > s;
    });
    if (key !== 'all' || valid.length) out[key] = valid;
  });
  return out;
}

/** Plages personnalisées déjà enregistrées (seuls les jours modifiés y figurent). */
export function customWindowsFromSettings(s: AppSettings): DayWindowStrings {
  const out: DayWindowStrings = {};
  weekdayLabels().forEach((_, i) => {
    if (s.dayWindows?.[String(i)]) {
      const w = getDayWindow(s, referenceDay(i));
      out[String(i)] = { start: formatTime(w.start), end: w.end >= 24 * 60 ? '23:59' : formatTime(w.end) };
    }
  });
  return out;
}

/** Durée des créneaux : valeur par défaut + réglages propres à certains J. */
export function slotDurationsFromSettings(settings: AppSettings): { def: number; byJ: Record<string, number> } {
  return {
    def: getSlotDurationMinutes(99, settings),
    byJ: Object.fromEntries(
      getJPool(settings)
        .concat(settings.defaultJPattern)
        .filter((j) => settings.slotDurationByJ?.[String(j)] !== undefined || (!settings.slotDurationByJ && j <= 1))
        .map((j) => [String(j), getSlotDurationMinutes(j, settings)])
    ) as Record<string, number>,
  };
}

/** Durée d'un créneau ramenée entre 5 min et 10 h, au pas de 5 min. */
export const clampSlot = (m: number) => Math.min(600, Math.max(5, Math.round((Number(m) || 60) / 5) * 5));

/** Valeurs saisies dans l'onglet Planning des réglages. */
export interface PlanningValues {
  defaultPattern: number[];
  jPool: number[];
  slotDefault: number;
  slotByJ: Record<string, number>;
  autoCascade: boolean;
  dailyTargetHours: number;
  /** AAAA-MM-JJ, ou vide : pas d'examen. */
  examDate: string;
  dayStartTime: string;
  timelineStartHour: number;
  timelineEndHour: number;
  timelineStepMinutes: number;
  customWindows: DayWindowStrings;
  breaks: BreaksValue;
  multiDayCount: number;
  blockDetails: BlockDetails;
}

/** Réglages enregistrés correspondant aux valeurs saisies dans l'onglet Planning (validées). */
export function planningSettingsFromValues(v: PlanningValues): Partial<AppSettings> {
  // Valide la plage (fin après début) et le pas ; retombe sur les valeurs par défaut sinon
  const timeline = getTimelineConfig({
    timelineStartHour: Number(v.timelineStartHour),
    timelineEndHour: Number(v.timelineEndHour),
    timelineStepMinutes: Number(v.timelineStepMinutes),
  });
  // On ne mémorise que les jours modifiés (les autres suivent la plage par défaut) ; une plage invalide est ignorée
  const defaults = defaultDayWindowStrings({
    dayStartTime: v.dayStartTime,
    timelineStartHour: timeline.startHour,
    timelineEndHour: timeline.endHour,
    timelineStepMinutes: timeline.stepMinutes,
  });
  const dayWindows: DayWindowStrings = {};
  Object.entries(v.customWindows).forEach(([day, w]) => {
    const s = parseTime(w.start);
    const e = w.end === '23:59' ? 24 * 60 : parseTime(w.end);
    const valid = s !== null && e !== null && e > s;
    if (valid && (w.start !== defaults.start || w.end !== defaults.end)) dayWindows[day] = { start: w.start, end: w.end };
  });
  return {
    dayWindows,
    breaks: cleanBreaks(v.breaks),
    multiDayCount: getMultiDayCount({ multiDayCount: Number(v.multiDayCount) }),
    blockDetails: v.blockDetails,
    defaultJPattern: v.defaultPattern.includes(0) ? v.defaultPattern : [0, ...v.defaultPattern],
    jPool: [...new Set([...v.jPool, ...v.defaultPattern, 0])].sort((a, b) => a - b),
    slotDurationDefault: clampSlot(v.slotDefault),
    slotDurationByJ: Object.fromEntries(Object.entries(v.slotByJ).map(([j, m]) => [j, clampSlot(m)])),
    // Anciens champs gardés cohérents (autres versions de l'app)
    slotDurationOthers: clampSlot(v.slotDefault),
    slotDurationJ0J1: clampSlot(v.slotByJ['0'] ?? v.slotDefault),
    autoCascadeShift: v.autoCascade,
    dailyTargetHours: Number(v.dailyTargetHours),
    examDate: /^\d{4}-\d{2}-\d{2}$/.test(v.examDate) ? v.examDate : undefined,
    dayStartTime: v.dayStartTime,
    timelineStartHour: timeline.startHour,
    timelineEndHour: timeline.endHour,
    timelineStepMinutes: timeline.stepMinutes,
  };
}
