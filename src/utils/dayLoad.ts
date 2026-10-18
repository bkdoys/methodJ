import { AppSettings, RevisionItem } from '../types';
import { plural, t } from '../i18n';
import { getDailyTargetHours, getDayBreaks, getDayWindow, isForcedDay, resolveDayLayout } from './dayLayout';

type LoadSettings = Pick<
  AppSettings,
  'dailyTargetHours' | 'dayStartTime' | 'dayWindows' | 'timelineStartHour' | 'timelineEndHour' | 'timelineStepMinutes' | 'breaks' | 'forcedDates'
> &
  Partial<Pick<AppSettings, 'revisionPeriods'>>;

export interface DayLoad {
  date: string;
  /** Somme des durées de tous les créneaux du jour (faits ou non, comme « Charge du jour »). */
  totalMinutes: number;
  /** Objectif quotidien (réglage `dailyTargetHours`, ou celui de la période de révision du jour). */
  targetMinutes: number;
  /** Temps réellement disponible : plage du jour moins les pauses. */
  capacityMinutes: number;
  slotCount: number;
  /** Créneaux non validés placés en dehors de la plage de travail (jamais comptés un jour forcé). */
  overflowIds: string[];
  /** Total au-dessus de l'objectif. */
  overloaded: boolean;
  /** Le jour demande l'attention : surchargé ou avec des créneaux hors plage. */
  alert: boolean;
}

/** Minutes de pause qui tombent dans la plage. */
function breakMinutesWithin(win: { start: number; end: number }, breaks: { start: number; end: number }[]): number {
  return breaks.reduce((sum, b) => sum + Math.max(0, Math.min(b.end, win.end) - Math.max(b.start, win.start)), 0);
}

/**
 * Analyse un jour. La position des créneaux est celle du planning (`resolveDayLayout`) :
 * les créneaux sans heure s'empilent depuis le début de la plage, et débordent à la fin faute de place.
 */
export function analyzeDay(date: string, dayRevs: RevisionItem[], settings: LoadSettings): DayLoad {
  const win = getDayWindow(settings, date);
  const breaks = getDayBreaks(settings, date);
  const forced = isForcedDay(settings, date);

  const totalMinutes = dayRevs.reduce((sum, r) => sum + r.durationMinutes, 0);
  const targetMinutes = getDailyTargetHours(settings, date) * 60;

  const overflowIds = forced
    ? []
    : resolveDayLayout(dayRevs, win.start, breaks)
        .filter((p) => p.end > win.end || p.start < win.start)
        .map((p) => p.id)
        .filter((id) => !dayRevs.find((r) => r.id === id)?.completed);

  const overloaded = totalMinutes > targetMinutes;
  return {
    date,
    totalMinutes,
    targetMinutes,
    capacityMinutes: Math.max(0, win.end - win.start - breakMinutesWithin(win, breaks)),
    slotCount: dayRevs.length,
    overflowIds,
    overloaded,
    alert: overloaded || overflowIds.length > 0,
  };
}

/** Analyse tous les jours qui ont des créneaux, à partir de `fromIso` (aujourd'hui compris), dans l'ordre. */
export function analyzeDays(revisions: RevisionItem[], settings: LoadSettings, fromIso: string): DayLoad[] {
  const byDate = new Map<string, RevisionItem[]>();
  revisions.forEach((r) => {
    if (r.scheduledDate < fromIso) return;
    const list = byDate.get(r.scheduledDate);
    if (list) list.push(r);
    else byDate.set(r.scheduledDate, [r]);
  });
  return [...byDate.keys()].sort().map((date) => analyzeDay(date, byDate.get(date)!, settings));
}

/** Jours à surveiller (surchargés ou avec des créneaux hors plage) à partir de `fromIso`. */
export function findAlertDays(revisions: RevisionItem[], settings: LoadSettings, fromIso: string): DayLoad[] {
  return analyzeDays(revisions, settings, fromIso).filter((d) => d.alert);
}

/** Phrase décrivant pourquoi un jour demande l'attention (infobulles) ; vide si tout va bien. */
export function describeDayAlert(load: DayLoad, targetHours: number = load.targetMinutes / 60): string {
  const parts: string[] = [];
  if (load.overloaded) parts.push(t('Au-dessus de l\'objectif ({n}h)', { n: targetHours }));
  if (load.overflowIds.length > 0) {
    parts.push(plural(load.overflowIds.length, '{n} créneau hors de la plage de travail', '{n} créneaux hors de la plage de travail'));
  }
  return parts.join(' · ');
}
