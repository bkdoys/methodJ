import React from 'react';
import { formatMinutes } from '../utils/dateUtils';
import { t } from '../i18n';

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120];
const durationLabel = (m: number) => (m < 60 ? t('{n} min', { n: m }) : formatMinutes(m));

/**
 * Sélecteur de durée par cran de 15 min jusqu'à 2h ; une valeur existante hors cran reste choisissable.
 * Avec `defaultLabel`, la valeur 0 signifie « suit la durée par défaut ».
 */
export const DurationSelect: React.FC<{
  id?: string;
  value: number;
  onChange: (minutes: number) => void;
  label?: string;
  defaultLabel?: string;
  className?: string;
}> = ({ id, value, onChange, label, defaultLabel, className = '' }) => {
  const options =
    SLOT_DURATION_OPTIONS.includes(value) || value === 0
      ? SLOT_DURATION_OPTIONS
      : [...SLOT_DURATION_OPTIONS, value].sort((a, b) => a - b);
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white ${className}`}
    >
      {defaultLabel && <option value={0}>{defaultLabel}</option>}
      {options.map((m) => (
        <option key={m} value={m}>
          {durationLabel(m)}
        </option>
      ))}
    </select>
  );
};
