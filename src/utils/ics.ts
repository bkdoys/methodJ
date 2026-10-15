import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { APP_FILE_PREFIX } from '../appInfo';
import { addDays, formatFrenchDate } from './dateUtils';
import { getDayBreaks, getDayWindow, resolveDayLayout } from './dayLayout';
import { formatCoursePath } from './folders';
import { getLinkTypes, linkTypeName, resolveLinkType } from './courseLinks';
import { t } from '../i18n';
import { revLabel } from './jMethod';

export interface IcsOptions {
  /** Premier jour exporté (AAAA-MM-JJ) et dernier (inclus) ; absent = sans limite. */
  fromIso: string;
  toIso?: string;
  includeCompleted: boolean;
  /** Rappel avant le début (minutes) ; 0 = aucun. */
  reminderMinutes: number;
  calendarName: string;
  /** Adresse de l'application, ajoutée en description. */
  appUrl?: string;
  now?: Date;
}

export interface IcsData {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Échappement des textes (RFC 5545). */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lignes de 75 octets au plus (UTF-8), les suites commencent par une espace. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // la ligne de suite commence par une espace
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Heure locale « flottante » (sans fuseau) : l'agenda l'interprète dans le fuseau de l'utilisateur. */
function localStamp(dateIso: string, minutes: number): string {
  let date = dateIso;
  let m = minutes;
  while (m >= 24 * 60) {
    date = addDays(date, 1);
    m -= 24 * 60;
  }
  return `${date.replace(/-/g, '')}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
}

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Créneaux à exporter, avec l'heure telle qu'elle apparaît dans le planning (pauses et empilement compris). */
export function selectIcsSlots(data: IcsData, opts: Pick<IcsOptions, 'fromIso' | 'toIso' | 'includeCompleted'>) {
  const byDate = new Map<string, RevisionItem[]>();
  data.revisions.forEach((r) => {
    const list = byDate.get(r.scheduledDate);
    if (list) list.push(r);
    else byDate.set(r.scheduledDate, [r]);
  });

  const out: { rev: RevisionItem; course: Course; start: number; end: number }[] = [];
  [...byDate.keys()].sort().forEach((date) => {
    if (date < opts.fromIso || (opts.toIso && date > opts.toIso)) return;
    const dayRevs = byDate.get(date)!;
    const placements = new Map(
      resolveDayLayout(dayRevs, getDayWindow(data.settings, date).start, getDayBreaks(data.settings, date)).map((p) => [p.id, p])
    );
    dayRevs.forEach((rev) => {
      if (rev.completed && !opts.includeCompleted) return;
      const course = data.courses.find((c) => c.id === rev.courseId);
      const p = placements.get(rev.id);
      if (course && p) out.push({ rev, course, start: p.start, end: p.end });
    });
  });
  return out.sort((a, b) => a.rev.scheduledDate.localeCompare(b.rev.scheduledDate) || a.start - b.start);
}

/** Un événement d'agenda tiré d'un créneau (commun au fichier .ics et à l'envoi vers Google Agenda). */
export interface SlotEvent {
  revisionId: string;
  title: string;
  description: string;
  category?: string;
  completed: boolean;
  date: string;
  start: number;
  end: number;
}

export function buildSlotEvents(data: IcsData, opts: Pick<IcsOptions, 'fromIso' | 'toIso' | 'includeCompleted' | 'appUrl'>): SlotEvent[] {
  const linkTypes = getLinkTypes(data.settings);
  return selectIcsSlots(data, opts).map(({ rev, course, start, end }) => {
    const subject = data.subjects.find((s) => s.id === course.subjectId);
    const path = formatCoursePath(subject, course.folderId, Infinity).full;
    const desc: string[] = [];
    if (path) desc.push(path);
    desc.push(t('Créneau de {n} min', { n: rev.durationMinutes }));
    // Intitulé du lien, sinon son type (« Flashcards », « Cours »…) : plus parlant que le nom du site
    (course.links ?? []).forEach((l) =>
      desc.push(`${l.label?.trim() || linkTypeName(resolveLinkType(linkTypes, l.typeId))} : ${l.url}`)
    );
    if (rev.completed) {
      const when = rev.completedDate ? formatFrenchDate(rev.completedDate) : '';
      const stars = rev.rating ? ` (${rev.rating}★)` : '';
      desc.push(when ? t('Validé le {date}{stars}', { date: when, stars }) : t('Validé{stars}', { stars }));
    }
    if (opts.appUrl) desc.push(opts.appUrl);
    return {
      revisionId: rev.id,
      // Un créneau validé reste visible dans l'agenda, repéré par le ✓ devant son titre
      title: `${rev.completed ? '✓ ' : ''}${revLabel(rev)} · ${course.title}`,
      completed: rev.completed,
      description: desc.join('\n'),
      category: subject?.name,
      date: rev.scheduledDate,
      start,
      end,
    };
  });
}

/** Date et heure locales « AAAA-MM-JJTHH:MM:SS » (sans fuseau) ; une heure au-delà de minuit passe au jour suivant. */
export function localIsoDateTime(dateIso: string, minutes: number): string {
  const s = localStamp(dateIso, minutes);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
}

/** Fichier .ics (UTF-8, fins de ligne CRLF). L'UID d'un événement est celui du créneau : réimporter met à jour au lieu de dupliquer. */
export function buildIcs(data: IcsData, opts: IcsOptions): { ics: string; count: number } {
  const events = buildSlotEvents(data, opts);
  const stamp = utcStamp(opts.now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${APP_FILE_PREFIX}//revisions//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`,
  ];

  events.forEach((e) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.revisionId}@${APP_FILE_PREFIX}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(e.date, e.start)}`,
      `DTEND:${localStamp(e.date, e.end)}`,
      `SUMMARY:${escapeIcsText(e.title)}`,
      `DESCRIPTION:${escapeIcsText(e.description)}`
    );
    if (e.category) lines.push(`CATEGORIES:${escapeIcsText(e.category)}`);
    if (e.completed) lines.push('TRANSP:TRANSPARENT');
    if (opts.reminderMinutes > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(e.title)}`,
        `TRIGGER:-PT${opts.reminderMinutes}M`,
        'END:VALARM'
      );
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  return { ics: lines.map(foldIcsLine).join('\r\n') + '\r\n', count: events.length };
}

/** Télécharge le fichier .ics. */
export function downloadIcs(ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${APP_FILE_PREFIX}-agenda-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
