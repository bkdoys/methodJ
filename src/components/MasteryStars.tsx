import React from 'react';
import { Star } from 'lucide-react';
import { MasteryLevel } from '../types';
import { MASTERY_CONFIG } from './MasteryBadge';

/** Couleur de l'étoile selon le niveau, la même teinte que la frise de progression. */
const STAR_COLOR: Record<MasteryLevel, string> = {
  0: 'text-slate-300 dark:text-slate-600',
  1: 'text-rose-400',
  2: 'text-amber-400',
  3: 'text-sky-500',
  4: 'text-emerald-500',
};

interface MasteryStarsProps {
  level: MasteryLevel;
  /** Avec `onChange`, les étoiles se cliquent ; recliquer sur le niveau actuel remet à 0. */
  onChange?: (level: MasteryLevel) => void;
  /** Faux : recliquer sur le niveau actuel ne le remet pas à 0 (ex. validation d'un créneau). */
  allowClear?: boolean;
  /** Taille des étoiles en pixels. */
  size?: number;
  className?: string;
}

/**
 * Niveau de maîtrise en étoiles : 1 à 4 étoiles pleines et colorées, ou une seule étoile vide quand rien n'est évalué.
 * (La couleur dit le niveau comme la frise de progression : rose, ambre, bleu, vert.)
 */
export const MasteryStars: React.FC<MasteryStarsProps> = ({ level, onChange, allowClear = true, size = 14, className = '' }) => {
  const config = MASTERY_CONFIG[level] ?? MASTERY_CONFIG[0];
  const star = (filled: boolean, key: number, color: string, onClick?: () => void, label?: string) => {
    const icon = <Star key={key} width={size} height={size} className={color} fill={filled ? 'currentColor' : 'none'} />;
    if (!onClick) return icon;
    return (
      <button
        key={key}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={label}
        aria-label={label}
        className="p-0.5 rounded hover:scale-110 transition-transform"
      >
        {icon}
      </button>
    );
  };

  if (onChange) {
    return (
      <span className={`inline-flex items-center ${className}`} role="group" aria-label={config.label}>
        {([1, 2, 3, 4] as MasteryLevel[]).map((n) =>
          star(n <= level, n, n <= level ? STAR_COLOR[level] : 'text-slate-300 dark:text-slate-600', () => onChange(n === level && allowClear ? 0 : n), MASTERY_CONFIG[n].label)
        )}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`} title={config.label} role="img" aria-label={config.label}>
      {level === 0
        ? star(false, 0, STAR_COLOR[0])
        : Array.from({ length: level }, (_, i) => star(true, i, STAR_COLOR[level]))}
    </span>
  );
};
