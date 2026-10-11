import React from 'react';
import { Check } from 'lucide-react';
import { LINK_COLORS, LINK_ICONS, LINK_ICON_KEYS } from '../utils/courseLinks';
import { t } from '../i18n';

interface LinkTypeFieldsProps {
  name: string;
  icon: string;
  color: string;
  onChange: (next: { name: string; icon: string; color: string }) => void;
  autoFocus?: boolean;
}

/** Nom, icône et couleur d'un type de lien. */
export const LinkTypeFields: React.FC<LinkTypeFieldsProps> = ({ name, icon, color, onChange, autoFocus }) => (
  <div className="space-y-2">
    <input
      type="text"
      value={name}
      maxLength={40}
      autoFocus={autoFocus}
      onChange={(e) => onChange({ name: e.target.value, icon, color })}
      placeholder={t('Nom du type (ex. Résumé)')}
      aria-label={t('Nom du type')}
      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
    <div className="flex flex-wrap gap-1">
      {LINK_ICON_KEYS.map((key) => {
        const Icon = LINK_ICONS[key];
        const on = key === icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ name, icon: key, color })}
            aria-pressed={on}
            aria-label={key}
            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors ${
              on ? 'border-transparent ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            style={on ? { color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, ['--tw-ring-color' as string]: color } : undefined}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {LINK_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange({ name, icon, color: hex })}
          aria-pressed={hex === color}
          aria-label={hex}
          className="w-5 h-5 rounded-full flex items-center justify-center ring-1 ring-black/10"
          style={{ backgroundColor: hex }}
        >
          {hex === color && <Check className="w-3 h-3 text-white" />}
        </button>
      ))}
    </div>
  </div>
);
