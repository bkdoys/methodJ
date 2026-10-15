import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Course, RevisionItem, Subject } from '../types';
import { RatingFx, RATING_COLOR } from './RatingFx';
import { getCourseEffectiveColor, getCourseGradientStyle, getSubject } from '../utils/colorUtils';
import {
  BlockDetails,
  DEFAULT_BLOCK_DETAILS,
  Placement,
  formatTime,
  dayHasLimits,
  getDayBounds,
  getConfiguredBreaks,
  getDayBreaks,
  isForcedDay,
  getDayWindow,
  getTimelineConfig,
  moveSlotInLayout,
  placementsToUpdates,
  resolveDayLayout,
  snapToStep,
} from '../utils/dayLayout';
import { stripRichText } from '../utils/richText';
import { ArrowRightLeft, CheckCircle2, Circle, GripVertical, Lock, LockOpen, Minus, Play, Plus, Square, AlertTriangle } from 'lucide-react';
import { stepHourHeight, normalizeHourHeight } from '../utils/dayLayout';
import { t } from '../i18n';
import { formatMinutes } from '../utils/dateUtils';
import { isRReview, revLabel } from '../utils/jMethod';

/** Largeur de la colonne des heures (w-12). */
export const SCALE_WIDTH_CLASS = 'left-12';
/** Seuils de hauteur (px) en dessous desquels une ligne du bloc est masquée : cliquer ouvre la fiche. */
const MIN_HEIGHT_FOR_NOTE = 104;
const MIN_HEIGHT_DETAILS = 62;
const MIN_HEIGHT_COMPACT_DETAILS = 58;
const MIN_HEIGHT_COMPACT_ACTIONS = 92;
/** Sous cette hauteur, le titre garde une ligne de moins pour laisser la place aux pastilles. */
const MIN_HEIGHT_TALL_TITLE = 84;
const AUTOSCROLL_EDGE = 70;
const AUTOSCROLL_SPEED = 14;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

// ---------------------------------------------------------------------------------------------
// Réglage discret de la hauteur d'une heure (− / +), à placer au-dessus des libellés d'heures
// ---------------------------------------------------------------------------------------------

/**
 * Case discrète « Forcer ce jour » : lève pour ce jour les pauses et les limites de la plage autorisée, pour pouvoir
 * y poser un créneau à la main. N'apparaît que sur un jour qui a de telles zones (ou déjà forcé).
 */
export const ForceDayToggle: React.FC<{
  date: string;
  settings: AppSettings;
  onToggle?: (date: string) => void;
  /** Texte à côté de l'icône (vue Jour) ; sans lui, icône seule (en-têtes étroits). */
  showLabel?: boolean;
}> = ({ date, settings, onToggle, showLabel = false }) => {
  const forced = isForcedDay(settings, date);
  if (!onToggle || (!forced && !dayHasLimits(settings, date))) return null;
  const title = forced
    ? t('Pauses et horaires ignorés ce jour : cliquer pour les rétablir')
    : t('Forcer ce jour : ignorer les pauses et les horaires limites pour y placer un créneau');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={forced}
      onClick={() => onToggle(date)}
      title={title}
      aria-label={t('Forcer ce jour')}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
        forced
          ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
          : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {forced ? <LockOpen className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
      {showLabel && t('Forcer ce jour')}
    </button>
  );
};

export const HourZoomControl: React.FC<{ hourHeight: number; onChange: (direction: -1 | 1) => void }> = ({
  hourHeight,
  onChange,
}) => {
  const current = normalizeHourHeight(hourHeight);
  const btn =
    'p-1 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400';
  return (
    <div className="flex items-center" role="group" aria-label={t('Hauteur d\'une heure')}>
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={stepHourHeight(current, -1) === current}
        title={t('Réduire la hauteur des heures')}
        aria-label={t('Réduire la hauteur des heures')}
        className={btn}
      >
        <Minus className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={stepHourHeight(current, 1) === current}
        title={t('Agrandir la hauteur des heures')}
        aria-label={t('Agrandir la hauteur des heures')}
        className={btn}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Échelle : une ligne par heure (avec son libellé), un pointillé à la demi-heure
// ---------------------------------------------------------------------------------------------

export const TimelineScale: React.FC<{ displayStart: number; displayEnd: number; pxPerMin: number }> = ({
  displayStart,
  displayEnd,
  pxPerMin,
}) => {
  const yOf = (minutes: number) => (minutes - displayStart) * pxPerMin;
  const hours: number[] = [];
  for (let m = displayStart; m <= displayEnd; m += 60) hours.push(m);

  return (
    <>
      {hours.map((m) => (
        <React.Fragment key={m}>
          <div className="absolute left-0 right-0 border-t border-slate-200 dark:border-slate-800" style={{ top: yOf(m) }}>
            <span className="absolute -top-2 left-0 w-11 text-right pr-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 leading-4 select-none">
              {formatTime(m)}
            </span>
          </div>
          {m < displayEnd && (
            <div
              className={`absolute ${SCALE_WIDTH_CLASS} right-0 border-t border-dashed border-slate-100 dark:border-slate-800/70`}
              style={{ top: yOf(m + 30) }}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

// ---------------------------------------------------------------------------------------------
// Colonne d'une journée : blocs positionnés par heure, déplaçables verticalement
// ---------------------------------------------------------------------------------------------

export interface DayColumnProps {
  date: string;
  isToday: boolean;
  /** Créneaux de CETTE journée. */
  revisions: RevisionItem[];
  courses: Course[];
  subjects: Subject[];
  settings: AppSettings;
  /** Minute (depuis minuit) correspondant au haut de l'échelle. */
  displayStart: number;
  /** Minute correspondant au bas de l'échelle. */
  displayEnd: number;
  /** Hauteur d'une minute, en pixels. */
  pxPerMin: number;
  /** Colonne étroite : blocs réduits à l'essentiel. */
  compact?: boolean;
  /** Ce que les blocs pleine taille affichent (matière, code, note, étoiles). */
  details?: BlockDetails;
  activeSessionRevisionId?: string;
  onCloseStudySession?: () => void;
  onOpenSlotDetail: (revision: RevisionItem) => void;
  onOpenCompleteModal: (revision: RevisionItem) => void;
  onOpenQuickShift: (revision: RevisionItem) => void;
  onStartStudySession: (revision: RevisionItem) => void;
  onMoveSlots: (updates: { id: string; startTime: string; slotOrder: number }[]) => void;
  /** Fin de la disposition en cours de glisser (null à la fin), pour que l'échelle puisse s'agrandir. */
  onDragExtent?: (maxEnd: number | null) => void;
  /** Vue Semaine : jour sous le pointeur (null = hors des colonnes). Active le glisser vers un autre jour. */
  resolveTargetDay?: (clientX: number) => string | null;
  /** Aperçu du dépôt dans un autre jour (null quand le pointeur revient ou à la fin du geste). */
  onCrossDayHover?: (hover: CrossDayHover | null) => void;
  /** Dépôt dans un autre jour : jour visé et heure de début (minutes). */
  onMoveToDay?: (revisionId: string, targetDate: string, startMinutes: number) => void;
}

export interface CrossDayHover {
  revisionId: string;
  date: string;
  start: number;
}

interface DragState {
  id: string;
  start: number;
  /** Le pointeur est au-dessus d'un autre jour : ce bloc est atténué, l'aperçu est dans l'autre colonne. */
  cross?: boolean;
}

interface DragInfo {
  id: string;
  pointerId: number;
  /** Appui sur le bloc (souris) : le glisser ne démarre qu'après un petit mouvement. */
  pending: boolean;
  startClientX: number;
  startClientY: number;
  startPageY: number;
  lastClientX: number;
  /** Ce créneau peut changer de jour (vue Semaine, créneau pas encore fait). */
  crossAllowed: boolean;
  /** Jour visé quand le pointeur a quitté la colonne d'origine. */
  targetDate: string | null;
  crossStart: number;
  origStart: number;
  duration: number;
  lastClientY: number;
  current: number;
  raf: number | null;
  /** Appui long au doigt : déclenche le glisser sans toucher à la poignée. */
  longPress?: ReturnType<typeof setTimeout>;
  touch?: boolean;
}

/** Distance (px) à partir de laquelle un appui sur le bloc devient un glisser et non un clic. */
const DRAG_THRESHOLD = 5;
// Au doigt, un appui long sur le bloc démarre le glisser ; bouger avant = défilement normal
const LONG_PRESS_MS = 300;
const LONG_PRESS_SLOP = 10;

export const DayColumn: React.FC<DayColumnProps> = ({
  date,
  isToday,
  revisions,
  courses,
  subjects,
  settings,
  displayStart,
  displayEnd,
  pxPerMin,
  compact = false,
  details = DEFAULT_BLOCK_DETAILS,
  activeSessionRevisionId,
  onCloseStudySession,
  onOpenSlotDetail,
  onOpenCompleteModal,
  onOpenQuickShift,
  onStartStudySession,
  onMoveSlots,
  onDragExtent,
  resolveTargetDay,
  onCrossDayHover,
  onMoveToDay,
}) => {
  const config = getTimelineConfig(settings);
  const step = config.stepMinutes;
  // Plage autorisée ce jour-là (préférences par jour de la semaine) : les créneaux sans heure s'y empilent
  // depuis son début et on ne peut pas y déplacer un créneau hors de ses limites
  const win = getDayWindow(settings, date);
  const dayStartMinutes = win.start;
  const bounds = getDayBounds(settings, date);
  // Jour forcé : les zones de non-travail restent dessinées, en ambre, pour rappeler qu'on les a levées
  const forced = isForcedDay(settings, date);
  const zoneStyle = forced
    ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(217,119,6,0.16)_6px_7px)] bg-amber-500/[0.04] border-dashed border-amber-400/50 dark:border-amber-500/40'
    : 'bg-slate-900/[0.04] dark:bg-white/[0.05] border-slate-300/80 dark:border-slate-600/60';
  const breaks = useMemo(() => getDayBreaks(settings, date), [settings, date]);
  const shownBreaks = forced ? getConfiguredBreaks(settings, date) : breaks;
  const yOf = (minutes: number) => (minutes - displayStart) * pxPerMin;

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  // Heure courante (trait rouge), rafraîchie chaque minute
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, [isToday]);

  // Pas de boucle d'auto-défilement qui survive au composant
  useEffect(
    () => () => {
      if (dragRef.current?.raf != null) cancelAnimationFrame(dragRef.current.raf);
    },
    []
  );

  const basePlacements = useMemo(() => resolveDayLayout(revisions, dayStartMinutes, breaks), [revisions, dayStartMinutes, breaks]);
  const placements: Placement[] = useMemo(
    () =>
      drag && !drag.cross
        ? moveSlotInLayout(revisions, dayStartMinutes, drag.id, drag.start, breaks) ?? basePlacements
        : basePlacements,
    [drag, revisions, dayStartMinutes, breaks, basePlacements]
  );

  // Prévient le parent pour qu'il élargisse l'échelle si le glisser pousse des blocs plus bas.
  // Seule la colonne qui glisse parle : les autres ne doivent jamais effacer sa valeur.
  const reportedExtent = useRef(false);
  useEffect(() => {
    if (!onDragExtent) return;
    if (drag && !drag.cross && placements.length) {
      reportedExtent.current = true;
      onDragExtent(Math.max(...placements.map((p) => p.end)));
    } else if (reportedExtent.current) {
      reportedExtent.current = false;
      onDragExtent(null);
    }
  }, [drag, placements, onDragExtent]);
  useEffect(
    () => () => {
      if (reportedExtent.current) onDragExtent?.(null);
    },
    [onDragExtent]
  );

  const revById = new Map(revisions.map((r) => [r.id, r]));
  // Les blocs gardent leur ordre dans le DOM pendant un geste : déplacer l'élément qui porte la
  // capture du pointeur la ferait perdre et le relâchement n'arriverait jamais à la poignée.
  const previewById = new Map(placements.map((p) => [p.id, p]));

  // ---------- Glisser-déposer (pointeur) ----------
  // Les écouteurs sont posés sur `window` pendant le geste (pas de dépendance à la capture du pointeur) :
  // le geste continue même si le navigateur réordonne le DOM ou si la souris sort du bloc.
  const suppressClick = useRef(false);

  const computeStart = (d: DragInfo) => {
    const pageY = d.lastClientY + window.scrollY;
    const raw = d.origStart + (pageY - d.startPageY) / pxPerMin;
    return clamp(snapToStep(raw, step), bounds.start, Math.max(bounds.start, bounds.end - d.duration));
  };

  const updateDrag = () => {
    const d = dragRef.current;
    if (!d || d.pending) return;

    // Vue Semaine : pointeur au-dessus d'un autre jour ?
    const hoverDate = d.crossAllowed && resolveTargetDay ? resolveTargetDay(d.lastClientX) : null;
    if (hoverDate && hoverDate !== date) {
      const targetWin = getDayBounds(settings, hoverDate);
      const pageY = d.lastClientY + window.scrollY;
      const raw = d.origStart + (pageY - d.startPageY) / pxPerMin;
      const start = clamp(
        snapToStep(raw, step),
        targetWin.start,
        Math.max(targetWin.start, targetWin.end - d.duration)
      );
      if (d.targetDate !== hoverDate || d.crossStart !== start) {
        d.targetDate = hoverDate;
        d.crossStart = start;
        onCrossDayHover?.({ revisionId: d.id, date: hoverDate, start });
        setDrag({ id: d.id, start: d.origStart, cross: true });
      }
      return;
    }
    if (d.targetDate) {
      // Retour sur la colonne d'origine
      d.targetDate = null;
      onCrossDayHover?.(null);
      setDrag({ id: d.id, start: d.current });
    }

    const start = computeStart(d);
    if (start === d.current) return;
    // Un dépôt qui ferait déborder la journée au-delà de minuit est ignoré : on garde la dernière position valide
    if (moveSlotInLayout(revisions, dayStartMinutes, d.id, start, breaks) === null) return;
    d.current = start;
    setDrag({ id: d.id, start });
  };

  const autoScrollLoop = () => {
    const d = dragRef.current;
    if (!d || d.pending) return;
    if (d.lastClientY < AUTOSCROLL_EDGE) window.scrollBy(0, -AUTOSCROLL_SPEED);
    else if (d.lastClientY > window.innerHeight - AUTOSCROLL_EDGE) window.scrollBy(0, AUTOSCROLL_SPEED);
    else {
      d.raf = requestAnimationFrame(autoScrollLoop);
      return;
    }
    updateDrag();
    d.raf = requestAnimationFrame(autoScrollLoop);
  };

  const activate = (d: DragInfo) => {
    d.pending = false;
    d.startPageY = d.lastClientY + window.scrollY;
    d.raf = requestAnimationFrame(autoScrollLoop);
    suppressClick.current = true;
    setDrag({ id: d.id, start: d.current });
    updateDrag(); // le pointeur peut déjà être au-dessus d'un autre jour
  };

  const finishDrag = (commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    window.removeEventListener('pointermove', listeners.current.move);
    window.removeEventListener('pointerup', listeners.current.up);
    window.removeEventListener('pointercancel', listeners.current.cancel);
    if (d.raf != null) cancelAnimationFrame(d.raf);
    if (d.longPress) clearTimeout(d.longPress);
    dragRef.current = null;
    const wasActive = !d.pending;
    if (wasActive) {
      setDrag(null);
      // Le clic qui suit le relâchement ne doit pas ouvrir la fiche
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    if (d.targetDate) onCrossDayHover?.(null);
    if (commit && wasActive && d.targetDate && onMoveToDay) {
      onMoveToDay(d.id, d.targetDate, d.crossStart);
      return;
    }
    if (!commit || !wasActive || d.current === d.origStart) return;
    const result = moveSlotInLayout(revisions, dayStartMinutes, d.id, d.current, breaks);
    if (result) onMoveSlots(placementsToUpdates(result));
  };

  const onWindowMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.lastClientY = e.clientY;
    d.lastClientX = e.clientX;
    // Bouton relâché hors de la fenêtre : on termine le geste ici
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      finishDrag(true);
      return;
    }
    if (d.pending) {
      if (d.touch) {
        // Le doigt a bougé avant la fin de l'appui long : c'est un défilement, pas un glisser
        if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) > LONG_PRESS_SLOP) finishDrag(false);
        return;
      }
      if (Math.abs(e.clientY - d.startClientY) < DRAG_THRESHOLD) return;
      activate(d);
    }
    updateDrag();
  };

  // Toujours la dernière version des fonctions ci-dessus, sans réabonner les écouteurs
  const listeners = useRef({
    move: (e: PointerEvent) => latestHandlers.current.move(e),
    up: (e: PointerEvent) => latestHandlers.current.up(e),
    cancel: () => latestHandlers.current.cancel(),
  });
  const latestHandlers = useRef({
    move: onWindowMove,
    up: (e: PointerEvent) => {
      if (dragRef.current && dragRef.current.pointerId === e.pointerId) finishDrag(true);
    },
    cancel: () => finishDrag(false),
  });
  latestHandlers.current = {
    move: onWindowMove,
    up: (e: PointerEvent) => {
      if (dragRef.current && dragRef.current.pointerId === e.pointerId) finishDrag(true);
    },
    cancel: () => finishDrag(false),
  };

  // Pendant un glisser au doigt, le navigateur ne doit pas faire défiler la page (touch-action ne peut
  // plus changer une fois le geste commencé, donc on bloque touchmove, écouteur non passif)
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (dragRef.current && !dragRef.current.pending && e.cancelable) e.preventDefault();
    };
    window.addEventListener('touchmove', block, { passive: false });
    return () => window.removeEventListener('touchmove', block);
  }, []);

  // Les écouteurs ne survivent pas au composant
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', listeners.current.move);
      window.removeEventListener('pointerup', listeners.current.up);
      window.removeEventListener('pointercancel', listeners.current.cancel);
    },
    []
  );

  /** `fromHandle` : la poignée démarre tout de suite ; le bloc (souris/stylet) après un petit mouvement. */
  const armDrag = (e: React.PointerEvent<HTMLElement>, p: Placement, rev: RevisionItem, fromHandle: boolean) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (dragRef.current) return;
    const d: DragInfo = {
      id: rev.id,
      pointerId: e.pointerId,
      pending: !fromHandle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      touch: e.pointerType === 'touch',
      startPageY: e.clientY + window.scrollY,
      lastClientX: e.clientX,
      crossAllowed: !!resolveTargetDay && !!onMoveToDay && !rev.completed,
      targetDate: null,
      crossStart: p.start,
      origStart: p.start,
      duration: rev.durationMinutes,
      lastClientY: e.clientY,
      current: p.start,
      raf: null,
    };
    dragRef.current = d;
    window.addEventListener('pointermove', listeners.current.move);
    window.addEventListener('pointerup', listeners.current.up);
    window.addEventListener('pointercancel', listeners.current.cancel);
    if (d.touch && !fromHandle) {
      d.longPress = setTimeout(() => {
        if (dragRef.current === d && d.pending) {
          navigator.vibrate?.(15);
          activate(d);
        }
      }, LONG_PRESS_MS);
    }
    if (fromHandle) {
      e.preventDefault(); // pas de sélection de texte ni de défilement pendant le geste
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // sans capture, les écouteurs sur window suffisent
      }
      activate(d);
    }
  };

  // ---------- Clavier : flèches haut/bas = un pas ----------
  const nudge = (p: Placement, rev: RevisionItem, direction: -1 | 1) => {
    const target = clamp(snapToStep(p.start + direction * step, step), bounds.start, Math.max(bounds.start, bounds.end - rev.durationMinutes));
    if (target === p.start) return;
    const result = moveSlotInLayout(revisions, dayStartMinutes, rev.id, target, breaks);
    if (result) onMoveSlots(placementsToUpdates(result));
  };

  return (
    <div className="absolute inset-0">
      {/* Hors de la plage autorisée de ce jour : teinte légère, avec un fin trait à la limite de la plage */}
      {[
        { from: displayStart, to: win.start, edge: 'border-b' },
        { from: win.end, to: displayEnd, edge: 'border-t' },
      ]
        .filter((z) => z.to > z.from)
        .map((z) => (
          <div
            key={z.from}
            aria-hidden="true"
            data-outside-window
            className={`absolute left-0 right-0 pointer-events-none ${zoneStyle} ${z.edge}`}
            style={{ top: yOf(z.from), height: (z.to - z.from) * pxPerMin }}
          />
        ))}

      {/* Pauses (temps de non-travail) : même teinte légère, avec un motif rayé discret */}
      {shownBreaks.map((b) => (
        <div
          key={`${b.start}-${b.end}`}
          aria-hidden="true"
          data-break
          className={`absolute left-0 right-0 pointer-events-none border-y border-dashed ${
            forced ? zoneStyle : `${zoneStyle} bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(100,116,139,0.10)_6px_7px)]`
          }`}
          style={{ top: yOf(Math.max(b.start, displayStart)), height: Math.max(0, Math.min(b.end, displayEnd) - Math.max(b.start, displayStart)) * pxPerMin }}
        />
      ))}

      {/* Heure courante */}
      {isToday && (
        <div
          className="absolute -left-2 right-0 z-10 pointer-events-none flex items-center"
          style={{ top: yOf(nowMinutes) }}
          aria-hidden="true"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <span className="flex-1 border-t border-rose-500/80" />
        </div>
      )}

      {basePlacements.map((basePlacement) => {
        const p = previewById.get(basePlacement.id) ?? basePlacement;
        const rev = revById.get(p.id);
        const course = rev ? courses.find((c) => c.id === rev.courseId) : undefined;
        if (!rev || !course) return null;
        const subject = getSubject(course.subjectId, subjects);
        const g = getCourseGradientStyle(getCourseEffectiveColor(course, subject), rev.completed);
        const isDragging = drag?.id === rev.id;
        // Créneau empilé après la fin de la plage de travail (jamais sur un jour forcé : limites levées exprès)
        const outsideWindow = !forced && !rev.completed && (p.end > win.end || p.start < win.start);
        const height = Math.max(14, rev.durationMinutes * pxPerMin - 3);
        const sessionOpen = activeSessionRevisionId === rev.id && !!onCloseStudySession;
        const startLabel = `${formatTime(p.start)}–${formatTime(p.end)}`;
        const hasRating = rev.rating != null && rev.rating > 0;
        const showRatingLine = details.rating && hasRating;
        const showNoteText = details.notes && !!rev.notes?.trim();
        const hasNoteRow = !compact && height >= MIN_HEIGHT_FOR_NOTE && (showRatingLine || showNoteText);
        const showDetailsRow = height >= (compact ? MIN_HEIGHT_COMPACT_DETAILS : MIN_HEIGHT_DETAILS);
        const showCompactActions = compact && height >= MIN_HEIGHT_COMPACT_ACTIONS;

        const handle = (
          <button
            type="button"
            onPointerDown={(e) => armDrag(e, p, rev, true)}
            data-no-swipe
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                nudge(p, rev, e.key === 'ArrowUp' ? -1 : 1);
              }
            }}
            title={t('Glisser pour changer l\'heure (ou flèches haut/bas)')}
            aria-label={t('Déplacer le créneau {title}, {time}. Flèches haut et bas pour changer l\'heure.', { title: course.title, time: startLabel })}
            className={`shrink-0 rounded-md opacity-80 hover:opacity-100 focus-visible:opacity-100 ${
              compact ? 'p-2 -m-1' : 'p-2.5 -m-1'
            } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ color: g.color, touchAction: 'none' }}
          >
            <GripVertical className={compact ? 'w-4 h-4' : 'w-4 h-4'} />
          </button>
        );

        const circle = (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCompleteModal(rev);
            }}
            className="mt-0.5 shrink-0 transition-transform hover:scale-110 active:scale-95"
            style={{ color: g.color }}
            title={rev.completed ? t('Marqué comme fait') : t('Valider ce créneau')}
            aria-label={rev.completed ? t('Créneau fait') : t('Valider ce créneau')}
          >
            {rev.completed ? (
              <CheckCircle2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} fill-white/20`} />
            ) : (
              <Circle className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} opacity-80 hover:opacity-100`} />
            )}
          </button>
        );

        const actions = !rev.completed && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onOpenQuickShift(rev)}
              title={t('Décaler ce créneau à un autre jour')}
              aria-label={t('Décaler ce créneau à un autre jour')}
              className={`${compact ? 'p-1' : 'p-1.5'} rounded-lg transition-all hover:brightness-110 shadow-2xs`}
              style={{ backgroundColor: g.buttonBg, color: g.color }}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => (sessionOpen ? onCloseStudySession?.() : onStartStudySession(rev))}
              title={sessionOpen ? t('Fermer le chronomètre') : t('Lancer le chronomètre sur ce créneau')}
              aria-label={sessionOpen ? t('Fermer le chronomètre') : t('Lancer le chronomètre sur ce créneau')}
              aria-pressed={sessionOpen}
              className={`${compact ? 'p-1' : 'p-1.5'} rounded-lg transition-all hover:brightness-110 shadow-2xs ${
                sessionOpen ? 'ring-2 ring-white/90 shadow-md' : ''
              }`}
              style={{
                backgroundColor: g.badgeBg,
                color: g.color,
                border: `1px solid ${g.badgeBorder || 'transparent'}`,
              }}
            >
              {sessionOpen ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
          </div>
        );

        // Révision R (cours sans J) : étiquette en pointillés, pour la distinguer d'un J au premier coup d'œil
        const labelBorder: React.CSSProperties = isRReview(rev) ? { border: `1px dashed ${g.badgeText}` } : {};

        const stars = hasRating && (
          <span className="flex gap-px" aria-label={t('Note de ce créneau : {n} sur 4', { n: rev.rating ?? 0 })}>
            {Array.from({ length: rev.rating! }, (_, i) => (
              <span key={i} className="text-xs leading-none" style={{ color: RATING_COLOR[rev.rating!] }}>
                ★
              </span>
            ))}
          </span>
        );

        return (
          <div
            key={rev.id}
            data-rev-id={rev.id}
            onPointerDown={(e) => {
              // Souris / stylet : on peut saisir le bloc lui-même (les boutons gardent leur rôle)
              if ((e.target as HTMLElement).closest('button')) return;
              armDrag(e, p, rev, false);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onOpenSlotDetail(rev);
            }}
            title={`${compact ? `${course.title} · ${subject.name} · ${startLabel}` : startLabel}${outsideWindow ? ` · ${t('Hors de la plage de travail')}` : ''}`}
            className={`absolute left-0 right-0 rounded-xl overflow-hidden cursor-pointer select-none ${
              isDragging && drag?.cross
                ? 'z-20 opacity-30'
                : isDragging
                ? 'z-30 shadow-2xl ring-2 ring-white/80'
                : `z-20 transition-[top] duration-150 ${rev.completed ? 'opacity-70' : 'shadow-md hover:shadow-lg hover:brightness-105'}`
            }`}
            style={{
              top: yOf(p.start),
              height,
              background: g.background,
              color: g.color,
              border: g.border,
              boxShadow: isDragging ? undefined : g.boxShadow,
              WebkitTouchCallout: 'none',
            }}
          >
            <RatingFx rev={rev} />
            {outsideWindow && (
              <span
                aria-hidden
                className="absolute bottom-1 left-1 z-10 w-4 h-4 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center shadow-2xs pointer-events-none"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
              </span>
            )}

            {compact ? (
              <div className="h-full p-1.5 flex flex-col gap-1 min-h-0">
                <div className="flex items-start gap-1">
                  {handle}
                  {circle}
                  <h3
                    className={`flex-1 min-w-0 text-[11px] font-bold leading-tight ${height >= MIN_HEIGHT_TALL_TITLE ? 'line-clamp-3' : 'line-clamp-2'} ${
                      rev.completed ? 'line-through opacity-85' : ''
                    }`}
                    style={{ color: g.color }}
                  >
                    {course.title}
                  </h3>
                </div>
                {showDetailsRow && (
                <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono font-bold">
                  {isDragging && (
                    <span
                      className="px-1 py-0.5 rounded shadow-2xs"
                      style={{ backgroundColor: g.badgeBg, color: g.badgeText }}
                    >
                      {formatTime(p.start)}
                    </span>
                  )}
                  <span
                    className="px-1 py-0.5 rounded shadow-2xs"
                    style={{ backgroundColor: g.badgeBg, color: g.badgeText, ...labelBorder }}
                  >
                    {revLabel(rev)}
                  </span>
                  {stars}
                </div>
                )}
                {actions && showCompactActions && <div className="mt-auto flex justify-end">{actions}</div>}
              </div>
            ) : (
              <div className="h-full p-2 flex flex-col gap-1 min-h-0">
                {/* Ligne 1 : poignée · valider · titre · actions */}
                <div className="flex items-start gap-1.5 shrink-0">
                  {handle}
                  {circle}
                  <h3
                    title={course.title}
                    className={`flex-1 min-w-0 text-sm font-bold leading-snug ${height >= MIN_HEIGHT_TALL_TITLE ? 'line-clamp-2' : 'line-clamp-1'} ${
                      rev.completed ? 'line-through opacity-85' : ''
                    }`}
                    style={{ color: g.color }}
                  >
                    {course.title}
                  </h3>
                  {actions}
                </div>

                {/* Ligne 2 : horaire · J · matière */}
                {showDetailsRow && (
                <div className="flex items-center gap-1.5 flex-wrap pl-[26px] shrink-0">
                  {/* L'heure se lit sur l'échelle ; on ne l'écrit dans le bloc que pendant un déplacement */}
                  {isDragging && (
                    <span
                      className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded shadow-2xs"
                      style={{ backgroundColor: g.badgeBg, color: g.badgeText }}
                    >
                      {startLabel}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-extrabold shadow-2xs"
                    style={{ backgroundColor: g.badgeBg, color: g.badgeText, ...labelBorder }}
                  >
                    {revLabel(rev)}
                    <span className="opacity-80 font-mono font-normal">({formatMinutes(rev.durationMinutes)})</span>
                  </span>
                  {details.subject !== 'none' && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold shadow-2xs max-w-full"
                      style={{ backgroundColor: g.badgeBg, color: g.badgeText }}
                      title={subject.name}
                    >
                      <span className="w-2 h-2 rounded-full ring-1 ring-white/50 shrink-0" style={{ backgroundColor: subject.color }} />
                      <span className="truncate">{details.subject === 'name' ? subject.name : subject.code}</span>
                    </span>
                  )}
                  {details.code && course.itemCode && (
                    <span
                      className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded shadow-2xs"
                      style={{ backgroundColor: g.badgeBg, color: g.badgeText }}
                    >
                      {course.itemCode}
                    </span>
                  )}
                </div>
                )}

                {/* Ligne 3 : note du créneau (étoiles + texte de CE créneau) */}
                {hasNoteRow && (
                  <div className="flex items-center gap-2 pl-[26px] min-w-0 min-h-0 overflow-hidden">
                    {showRatingLine && (
                      <span
                        className="inline-flex items-center gap-1 shrink-0 select-none text-[11px] font-semibold"
                        title={t('Note de ce créneau : {n}/4', { n: rev.rating ?? 0 })}
                        style={{ color: g.color }}
                      >
                        <span className="opacity-85">{t('Note')}</span>
                        {stars}
                      </span>
                    )}
                    {showNoteText && (
                      <p
                        className="text-xs line-clamp-2 italic opacity-90 min-w-0 whitespace-pre-line"
                        style={{ color: g.color }}
                        title={stripRichText(rev.notes ?? '')}
                      >
                        "{stripRichText(rev.notes ?? '').trim()}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
