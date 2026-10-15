import { RefObject, useEffect, useRef } from 'react';
import { classifySwipe, pinchSteps, SWIPE_MAX_HOLD_MS, SWIPE_RATIO } from '../utils/gestures';

// Gestes tactiles du planning (écouteurs touch natifs : il faut voir deux doigts à la fois, y compris sur iOS).
// - un doigt, balayage horizontal → onSwipe('prev' | 'next') ;
// - deux doigts posés dans la zone de pincement → onPinch(paliers, y du milieu des doigts).
// La souris et le stylet ne passent pas par ici.

/** Un geste parti d'ici ne fait pas changer de jour (saisie, réglette, poignée de glisser d'un créneau). */
const NO_SWIPE = 'input, select, textarea, [role="slider"], [data-no-swipe]';
/** Mouvement en dessous duquel le doigt est considéré immobile (même seuil que l'appui long des créneaux). */
const MOVE_SLOP = 10;
/** Retour visuel : le contenu suit le doigt, freiné et borné. */
const FEEDBACK_FACTOR = 0.25;
const FEEDBACK_MAX = 40;

interface Options {
  onSwipe: (direction: 'prev' | 'next') => void;
  onPinch: (steps: number, clientY: number) => void;
  /** Zone qui suit le doigt pendant un balayage et où l'on peut pincer. */
  contentRef: RefObject<HTMLElement | null>;
  /** Faux : le pincement garde son comportement normal (zoom de la page), ex. vue Mois. */
  pinchEnabled: boolean;
}

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'swipe';
      x0: number;
      y0: number;
      t0: number;
      dx: number;
      dy: number;
      movedAt: number | null;
      /** Un conteneur sous le doigt pouvait encore défiler de ce côté au départ : il passe d'abord. */
      scrollPrev: boolean;
      scrollNext: boolean;
    }
  | { kind: 'pinch'; d0: number; played: number };

/** Un ancêtre (jusqu'à la racine) qui défile horizontalement peut-il encore aller à gauche / à droite ? */
function horizontalRoom(target: Element, root: Element): { prev: boolean; next: boolean } {
  const room = { prev: false, next: false };
  for (let el: Element | null = target; el && el !== root.parentElement; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) continue;
    const overflow = getComputedStyle(el).overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (el.scrollLeft > 1) room.prev = true;
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) room.next = true;
  }
  return room;
}

const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function usePlanningGestures(rootRef: RefObject<HTMLElement | null>, options: Options) {
  // Toujours la dernière version des rappels, sans réabonner les écouteurs
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let g: Gesture = { kind: 'none' };

    const setFeedback = (dx: number | null) => {
      const el = latest.current.contentRef.current;
      if (!el) return;
      if (dx === null) {
        if (!el.style.transform) return;
        el.style.transition = 'transform 150ms ease-out';
        el.style.transform = '';
        setTimeout(() => {
          if (!el.style.transform) el.style.transition = '';
        }, 160);
        return;
      }
      const shift = Math.max(-FEEDBACK_MAX, Math.min(FEEDBACK_MAX, dx * FEEDBACK_FACTOR));
      el.style.transition = '';
      // pas de transform du tout au repos : il changerait le bloc de référence des éléments fixes
      el.style.transform = shift === 0 ? '' : `translateX(${shift}px)`;
    };

    const inPinchZone = (t: Touch) => {
      const zone = latest.current.contentRef.current;
      return !!zone && t.target instanceof Node && zone.contains(t.target);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const target = t.target instanceof Element ? t.target : null;
        if (!target || target.closest(NO_SWIPE)) {
          g = { kind: 'none' };
          return;
        }
        const room = horizontalRoom(target, root);
        g = {
          kind: 'swipe',
          x0: t.clientX,
          y0: t.clientY,
          t0: e.timeStamp,
          dx: 0,
          dy: 0,
          movedAt: null,
          scrollPrev: room.prev,
          scrollNext: room.next,
        };
        return;
      }
      setFeedback(null);
      if (e.touches.length === 2 && latest.current.pinchEnabled && inPinchZone(e.touches[0]) && inPinchZone(e.touches[1])) {
        g = { kind: 'pinch', d0: distance(e.touches), played: 0 };
      } else {
        g = { kind: 'none' };
      }
    };

    const onMove = (e: TouchEvent) => {
      if (g.kind === 'pinch') {
        if (e.touches.length < 2) return;
        if (e.cancelable) e.preventDefault(); // la page ne zoome pas pendant ce pincement
        const steps = pinchSteps(g.d0, distance(e.touches));
        if (steps !== g.played) {
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          latest.current.onPinch(steps - g.played, midY);
          g.played = steps;
        }
        return;
      }
      if (g.kind !== 'swipe' || e.touches.length !== 1) return;
      const t = e.touches[0];
      g.dx = t.clientX - g.x0;
      g.dy = t.clientY - g.y0;
      if (g.movedAt === null && Math.hypot(g.dx, g.dy) > MOVE_SLOP) g.movedAt = e.timeStamp;
      const held = (g.movedAt ?? e.timeStamp) - g.t0 >= SWIPE_MAX_HOLD_MS;
      const blocked = g.dx < 0 ? g.scrollNext : g.scrollPrev;
      const horizontal = Math.abs(g.dx) >= SWIPE_RATIO * Math.abs(g.dy);
      setFeedback(!held && !blocked && horizontal ? g.dx : 0);
    };

    const onEnd = (e: TouchEvent) => {
      if (g.kind === 'pinch') {
        // le doigt restant ne devient pas un balayage
        if (e.touches.length < 2) g = { kind: 'none' };
        return;
      }
      if (g.kind !== 'swipe' || e.touches.length > 0) return;
      const s = g;
      g = { kind: 'none' };
      setFeedback(null);
      if (e.type === 'touchcancel') return;
      const direction = classifySwipe({
        dx: s.dx,
        dy: s.dy,
        dt: e.timeStamp - s.t0,
        holdMs: (s.movedAt ?? e.timeStamp) - s.t0,
      });
      if (!direction || (direction === 'next' ? s.scrollNext : s.scrollPrev)) return;
      latest.current.onSwipe(direction);
    };

    // Safari (iOS) zoome la page sur ses propres événements gesture* : on les coupe dans la zone de pincement
    const onGesture = (e: Event) => {
      const zone = latest.current.contentRef.current;
      if (latest.current.pinchEnabled && zone && e.target instanceof Node && zone.contains(e.target)) e.preventDefault();
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    root.addEventListener('gesturestart', onGesture);
    root.addEventListener('gesturechange', onGesture);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
      root.removeEventListener('gesturestart', onGesture);
      root.removeEventListener('gesturechange', onGesture);
    };
  }, [rootRef]);
}
