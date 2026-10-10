import React from 'react';
import { formatTime, parseTime } from '../utils/dayLayout';
import { t } from '../i18n';

interface TimeSelectProps {
  value: string; // HH:MM ('23:59' = minuit quand `allowMidnight`)
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Pas des choix proposés, en minutes. */
  stepMinutes?: number;
  /** Propose « 24:00 (minuit) » comme dernier choix (stocké « 23:59 »). */
  allowMidnight?: boolean;
  /** Premier choix proposé, en minutes (ex. 30 pour une heure de fin). */
  fromMinutes?: number;
  className?: string;
}

/** Liste d'heures par pas fixe : plus rapide à utiliser que le champ « heure » du navigateur. */
export const TimeSelect: React.FC<TimeSelectProps> = ({
  value,
  onChange,
  ariaLabel,
  stepMinutes = 30,
  allowMidnight = false,
  fromMinutes = 0,
  className = '',
}) => {
  const options: { value: string; label: string }[] = [];
  for (let m = fromMinutes; m < 24 * 60; m += stepMinutes) options.push({ value: formatTime(m), label: formatTime(m) });
  if (allowMidnight) options.push({ value: '23:59', label: t('24:00 (minuit)') });

  // Une valeur enregistrée hors de la grille (ex. 09:45) reste visible et sélectionnée
  if (!options.some((o) => o.value === value) && parseTime(value) !== null) {
    options.push({ value, label: value });
    options.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 dark:text-white ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
