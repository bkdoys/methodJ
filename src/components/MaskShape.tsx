import React from 'react';
import { OcclusionMask } from '../types';

type Geometry = Pick<OcclusionMask, 'x' | 'y' | 'w' | 'h' | 'shape' | 'points'>;

/** Calque SVG posé sur toute l'image : les formes s'y dessinent en coordonnées relatives (0 à 1). */
export const MaskCanvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 1 1" preserveAspectRatio="none">
    {children}
  </svg>
);

interface MaskShapeProps {
  mask: Geometry;
  /** Couleurs et épaisseur par classes (`fill-…`, `stroke-…`). */
  className?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** Forme d'un masque (rectangle, ellipse ou polygone) ; le trait garde la même épaisseur quelle que soit l'image. */
export const MaskShape: React.FC<MaskShapeProps> = ({ mask, className, strokeWidth = 2, dashed = false }) => {
  const common = {
    className,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeWidth,
    strokeDasharray: dashed ? '5 4' : undefined,
    strokeLinejoin: 'round' as const,
  };
  if (mask.shape === 'polygon' && mask.points && mask.points.length >= 3) {
    return <polygon points={mask.points.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />;
  }
  if (mask.shape === 'ellipse') {
    return <ellipse cx={mask.x + mask.w / 2} cy={mask.y + mask.h / 2} rx={mask.w / 2} ry={mask.h / 2} {...common} />;
  }
  return <rect x={mask.x} y={mask.y} width={mask.w} height={mask.h} {...common} />;
};

/** Pose un petit repère (numéro, « ? ») au centre de la boîte d'un masque. */
export const MaskLabel: React.FC<{ mask: Geometry; className?: string; children: React.ReactNode }> = ({ mask, className = '', children }) => (
  <span
    className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none ${className}`}
    style={{ left: `${(mask.x + mask.w / 2) * 100}%`, top: `${(mask.y + mask.h / 2) * 100}%` }}
  >
    {children}
  </span>
);
