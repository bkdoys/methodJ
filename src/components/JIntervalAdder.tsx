import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { J_CHOICES } from '../utils/jMethod';
import { t } from '../i18n';

interface JIntervalAdderProps {
  label: string;
  /** Intervalles déjà présents (ni proposés ni ajoutés en double). */
  existing: number[];
  onAdd: (j: number) => void;
}

/**
 * Saisie d'un intervalle J (1 à 365 jours) avec une liste déroulante de suggestions. La liste ne garde que
 * les valeurs qui commencent par ce qu'on tape : « 8 » n'en propose aucune (on crée un nouvel intervalle),
 * « 2 » propose 20, 28, 240…
 */
export const JIntervalAdder: React.FC<JIntervalAdderProps> = ({ label, existing, onAdd }) => {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  const add = (num: number) => {
    if (Number.isInteger(num) && num >= 1 && num <= 365 && !existing.includes(num)) {
      onAdd(num);
      setValue('');
    }
  };

  const suggestions = J_CHOICES.filter((j) => !existing.includes(j) && String(j).startsWith(value.trim()));

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
        <div className="relative">
          <input
            type="number"
            min="1"
            max="365"
            inputMode="numeric"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-autocomplete="list"
            aria-label={t('Intervalle à ajouter (jours)')}
            placeholder="J…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              // Entrée ajoute l'intervalle sans valider tout le formulaire
              if (e.key === 'Enter') {
                e.preventDefault();
                add(parseInt(value, 10));
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white font-mono"
          />
          {open && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 top-full mt-1 z-30 w-24 max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
            >
              {suggestions.map((j) => (
                <li key={j} role="option" aria-selected={false}>
                  <button
                    type="button"
                    // mouseDown pour agir avant que le champ perde le focus (et ferme la liste)
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(j);
                    }}
                    className="w-full text-left px-3 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                  >
                    J{j}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          disabled={value === ''}
          onClick={() => add(parseInt(value, 10))}
          className="px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 disabled:opacity-50 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('Ajouter')}</span>
        </button>
      </div>
    </div>
  );
};
