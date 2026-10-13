import React from 'react';
import { MasteryLevel, RevisionItem } from '../types';
import { getTodayIso } from '../utils/dateUtils';

/**
 * Effet visuel d'une révision "Fait" selon la note donnée.
 *
 * - Un liseré coloré en bas de la case reste affiché en permanence
 *   (rose = Faible, ambre = Moyen, bleu = Bon, vert = Maîtrisé).
 * - Une courte animation se joue à la validation :
 *     Faible    : 2 pulsations lentes
 *     Moyen     : 1 pulsation
 *     Bon       : 1 pulsation
 *     Maîtrisé  : 1 pulsation + le liseré vert se remplit de gauche à droite
 *
 * À placer comme premier enfant d'une case ayant la classe "relative".
 */

// true : l'animation ne joue que pour les séances validées aujourd'hui
// false : elle rejoue à chaque affichage du planning
const ANIMATE_ONLY_TODAY = true;

/** Couleur associée à chaque note de créneau (1 = faible … 4 = maîtrisé). */
export const RATING_COLOR: Record<number, string> = {
  1: '#fb7185', // rose  – Faible
  2: '#fbbf24', // ambre – Moyen
  3: '#0ea5e9', // bleu  – Bon
  4: '#10b981', // vert  – Maîtrisé
};

const FX: Record<
  Exclude<MasteryLevel, 0>,
  { color: string; duration: number; repeat: number }
> = {
  1: { color: '#fb7185', duration: 1400, repeat: 2 },
  2: { color: '#fbbf24', duration: 1100, repeat: 1 },
  3: { color: '#0ea5e9', duration: 1100, repeat: 1 },
  4: { color: '#10b981', duration: 1100, repeat: 1 },
};

interface RatingFxProps {
  rev: RevisionItem;
}

export const RatingFx: React.FC<RatingFxProps> = ({ rev }) => {
  if (!rev.completed || !rev.rating) return null;

  const cfg = FX[rev.rating as Exclude<MasteryLevel, 0>];
  const animate = !ANIMATE_ONLY_TODAY || rev.completedDate === getTodayIso();

  return (
    <>
      {animate && (
        <span
          aria-hidden
          className="rate-fx pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          style={
            {
              '--rate-color': cfg.color,
              animation: `rate-pulse ${cfg.duration}ms ease-out ${cfg.repeat}`,
            } as React.CSSProperties
          }
        />
      )}
    </>
  );
};
