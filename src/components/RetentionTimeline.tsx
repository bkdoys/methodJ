import React, { useMemo } from 'react';
import { Course, MasteryLevel, RevisionItem } from '../types';
import { MASTERY_CONFIG } from './MasteryBadge';
import { diffInDays, getTodayIso } from '../utils/dateUtils';
import { t } from '../i18n';

/**
 * Frise de progression d'un cours.
 *
 * Chaque révision notée colore la portion de la barre qui va de son J
 * jusqu'au J suivant. La largeur est proportionnelle au temps :
 * un "Bon" posé à J1 (1 -> 3 = 2 jours) est donc bien plus étroit
 * qu'un "Bon" posé à J15 (15 -> 30 = 15 jours).
 */

const BAR_COLORS: Record<MasteryLevel, string> = {
  0: 'bg-slate-300 dark:bg-slate-600',
  1: 'bg-rose-400',
  2: 'bg-amber-400',
  3: 'bg-sky-500',
  4: 'bg-emerald-500',
};

// Plus l'exposant est petit, plus les petits J sont agrandis.
// 1 = réelle · 0.5 = racine carrée · 0.3 = intermédiaire
const SCALE_EXPONENT = 0.3;

interface Segment {
  rev: RevisionItem;
  startDay: number;
  endDay: number;
  rating?: MasteryLevel;
}

interface RetentionTimelineProps {
  course: Course;
  revisions: RevisionItem[];
  /** Version compacte (catalogue) : pas de légende ni d'échelle. */
  compact?: boolean;
}

export const RetentionTimeline: React.FC<RetentionTimelineProps> = ({
  course,
  revisions,
  compact = false,
}) => {
  const todayIso = getTodayIso();
  const { segments, totalDays, todayDay } = useMemo(() => {
    const list = revisions
      .filter((r) => r.courseId === course.id)
      .sort((a, b) => a.jIndex - b.jIndex);

    if (list.length === 0) {
      return { segments: [] as Segment[], totalDays: 0, todayDay: 0 };
    }

    // Dernier tronçon : la note du dernier J reste valable "après" lui,
    // sur une durée égale au dernier intervalle (ex. J30 -> J60 => J60 -> J90).
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    const tail = Math.max(1, prev ? last.jIndex - prev.jIndex : 1);
    const total = last.jIndex + tail;

    const segs: Segment[] = list.map((rev, i) => ({
      rev,
      startDay: rev.jIndex,
      endDay: i < list.length - 1 ? list[i + 1].jIndex : total,
      rating: rev.completed ? rev.rating : undefined,
    }));

    return {
      segments: segs,
      totalDays: total,
      todayDay: diffInDays(todayIso, course.j0Date),
    };
  }, [course.id, course.j0Date, revisions, todayIso]);

  if (segments.length === 0 || totalDays <= 0) return null;

  const scale = (day: number) => {
    const d = Math.max(0, Math.min(day, totalDays));
    return Math.pow(d, SCALE_EXPONENT) / Math.pow(totalDays, SCALE_EXPONENT);
  };

  const todayPct = scale(todayDay) * 100;
  const showToday = todayDay >= 0 && todayDay <= totalDays;

  // Étiquettes J : on masque celles qui se chevauchent
  const labels: { jIndex: number; pct: number }[] = [];
  segments.map((s) => s.startDay).forEach((j) => {
    const pct = scale(j) * 100;
    const last = labels[labels.length - 1];
    if (!last || pct - last.pct >= 7) labels.push({ jIndex: j, pct });
  });

  return (
    <div className={compact ? 'w-full' : 'w-full space-y-1.5'}>
      {!compact && (
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
          {t('Progression dans le temps')}
        </span>
      )}

      <div className="relative">
        <div
          className={`relative w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${
            compact ? 'h-2' : 'h-4'
          }`}
        >
          {segments.map((seg) => {
            const left = scale(seg.startDay) * 100;
            const width = (scale(seg.endDay) - scale(seg.startDay)) * 100;
            const days = seg.endDay - seg.startDay;
            const cfg = seg.rating !== undefined ? MASTERY_CONFIG[seg.rating] : undefined;
            const title = cfg
              ? `J${seg.startDay} → J${seg.endDay} : ${cfg.shortLabel} (${days} ${t('j')})`
              : `J${seg.startDay} → J${seg.endDay} : ${t('à venir')} (${days} ${t('j')})`;

            return (
              <div
                key={seg.rev.id}
                title={title}
                className={`absolute top-0 h-full border-r border-white/70 dark:border-slate-900/70 ${
                  seg.rating !== undefined
                    ? BAR_COLORS[seg.rating]
                    : 'bg-slate-200 dark:bg-slate-700 opacity-60'
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
        </div>

        {showToday && (
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-900 dark:bg-white rounded"
            style={{ left: `calc(${todayPct}% - 1px)` }}
            title={t('Aujourd\'hui')}
          />
        )}
      </div>

      {!compact && (
        <>
          <div className="relative h-4">
            {labels.map((l) => (
              <span
                key={l.jIndex}
                className="absolute text-[10px] font-mono text-slate-500 dark:text-slate-400 -translate-x-1/2 first:translate-x-0"
                style={{ left: `${l.pct}%` }}
              >
                J{l.jIndex}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {([1, 2, 3, 4] as MasteryLevel[]).map((lvl) => (
              <span
                key={lvl}
                className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400"
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${BAR_COLORS[lvl]}`} />
                {MASTERY_CONFIG[lvl].shortLabel}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-200 dark:bg-slate-700" />
              {t('À venir')}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
