import React from 'react';
import { MasteryLevel } from '../types';
import { t } from '../i18n';

interface MasteryBadgeProps {
  level: MasteryLevel;
  interactive?: boolean;
  onChange?: (newLevel: MasteryLevel) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const MASTERY_CONFIG: Record<
  MasteryLevel,
  { label: string; shortLabel: string; bg: string; text: string; border: string; stars: number }
> = {
  0: {
    get label() {
      return t('Non évalué (Nouveau)');
    },
    get shortLabel() {
      return t('Nouveau');
    },
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    stars: 0,
  },
  1: {
    get label() {
      return t('À consolider (Faible)');
    },
    get shortLabel() {
      return t('Faible');
    },
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    stars: 1,
  },
  2: {
    get label() {
      return t('Notions clés (Moyen)');
    },
    get shortLabel() {
      return t('Moyen');
    },
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    stars: 2,
  },
  3: {
    get label() {
      return t('Solide (Bon)');
    },
    get shortLabel() {
      return t('Bon');
    },
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    stars: 3,
  },
  4: {
    get label() {
      return t('Maîtrisé (Optimal)');
    },
    get shortLabel() {
      return t('Maîtrisé');
    },
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    stars: 4,
  },
};

export const MasteryBadge: React.FC<MasteryBadgeProps> = ({
  level,
  interactive = false,
  onChange,
  size = 'md',
}) => {
  const config = MASTERY_CONFIG[level] || MASTERY_CONFIG[0];

  const sizeClasses = {
    sm: 'text-[11px] py-0.5 px-2 gap-1',
    md: 'text-xs py-1 px-2.5 gap-1.5',
    lg: 'text-sm py-1.5 px-3.5 gap-2',
  }[size];

  if (interactive && onChange) {
    return (
      <div className="flex items-center gap-1">
        {([0, 1, 2, 3, 4] as MasteryLevel[]).map((val) => {
          const isSelected = level === val;
          const valCfg = MASTERY_CONFIG[val];
          return (
            <button
              key={val}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(val);
              }}
              title={valCfg.label}
              className={`rounded-lg px-2 py-1 text-xs font-bold transition-all ${
                isSelected
                  ? `${valCfg.bg} ${valCfg.text} ring-1 ring-inset ${valCfg.border} shadow-xs`
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {val === 0 ? t('0 · Nouveau') : `${val} ★`}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
      title={config.label}
    >
      <span className="flex gap-0.5">
        {[1, 2, 3, 4].map((star) => (
          <span
            key={star}
            className={star <= config.stars ? 'opacity-100' : 'opacity-25'}
          >
            ★
          </span>
        ))}
      </span>
      <span className="font-semibold">{config.shortLabel}</span>
    </span>
  );
};
