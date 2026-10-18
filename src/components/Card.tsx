import React from 'react';

interface CardProps {
  title: string;
  hint?: string;
  /** Teinte de la bordure : alerte (rose) ou avertissement (ambre) ; absent = neutre. */
  tone?: 'alert' | 'warn';
  /** Élément à droite du titre (compteur, bouton…). */
  aside?: React.ReactNode;
  /** Classes en plus (placement dans une grille, sticky…). */
  className?: string;
  children: React.ReactNode;
}

const TONE_BORDER = {
  alert: 'border-rose-300 dark:border-rose-800',
  warn: 'border-amber-300 dark:border-amber-800',
} as const;

/** Carte standard des vues d'information (statistiques, tableau de bord). */
export const Card: React.FC<CardProps> = ({ title, hint, tone, aside, className = '', children }) => (
  <div
    className={`min-w-0 bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-2xs space-y-3 transition-colors ${
      tone ? TONE_BORDER[tone] : 'border-slate-200 dark:border-slate-800'
    } ${className}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        {hint && <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {aside}
    </div>
    {children}
  </div>
);
