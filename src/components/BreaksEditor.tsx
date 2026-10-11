import React from 'react';
import { Plus, X } from 'lucide-react';
import { t } from '../i18n';
import { TimeSelect } from './TimeSelect';

export type BreaksValue = Record<string, { start: string; end: string }[]>;

interface BreaksEditorProps {
  value: BreaksValue;
  onChange: (value: BreaksValue) => void;
  weekdayLabels: string[];
}

const NEW_BREAK = { start: '12:00', end: '13:00' };

const BreakRows: React.FC<{
  list: { start: string; end: string }[];
  label: string;
  onChange: (list: { start: string; end: string }[]) => void;
}> = ({ list, label, onChange }) => (
  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
    {list.map((b, i) => (
      <span key={i} className="inline-flex items-center gap-1">
        <TimeSelect
          ariaLabel={t('{day} : début de la pause', { day: label })}
          value={b.start}
          onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, start: v } : x)))}
        />
        <span className="text-xs text-slate-400">{t('à')}</span>
        <TimeSelect
          ariaLabel={t('{day} : fin de la pause', { day: label })}
          value={b.end}
          onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, end: v } : x)))}
          fromMinutes={30}
          allowMidnight
        />
        <button
          type="button"
          onClick={() => onChange(list.filter((_, j) => j !== i))}
          aria-label={t('Supprimer la pause')}
          className="p-0.5 text-slate-400 hover:text-rose-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    ))}
    <button
      type="button"
      onClick={() => onChange([...list, { ...NEW_BREAK }])}
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
    >
      <Plus className="w-3 h-3" />
      {t('Ajouter une pause')}
    </button>
  </div>
);

/** Pauses (temps de non-travail) : une liste commune à tous les jours, remplaçable jour par jour. Repliée par défaut. */
export const BreaksEditor: React.FC<BreaksEditorProps> = ({ value, onChange, weekdayLabels }) => {
  const common = value.all ?? [];
  const customDays = weekdayLabels.map((_, i) => String(i)).filter((k) => value[k] !== undefined);
  const free = weekdayLabels.map((_, i) => String(i)).filter((k) => value[k] === undefined);
  const set = (key: string, list: { start: string; end: string }[]) => onChange({ ...value, [key]: list });
  const unset = (key: string) => {
    const { [key]: _removed, ...rest } = value;
    onChange(rest);
  };
  const summary = common.length
    ? common.map((b) => `${b.start}–${b.end === '23:59' ? '24:00' : b.end}`).join(', ')
    : t('aucune');

  return (
    <details className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 group">
      <summary className="cursor-pointer list-none flex items-baseline gap-2">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('Pauses')}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{summary}</span>
        <span className="ml-auto text-[11px] text-slate-400 group-open:hidden">{t('Modifier')}</span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('Temps de non-travail (déjeuner…) : aucun créneau n\'y est placé et il apparaît grisé. Un jour personnalisé remplace les pauses communes.')}
        </p>
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">{t('Tous les jours')}</span>
          <BreakRows list={common} label={t('Tous les jours')} onChange={(l) => set('all', l)} />
        </div>
        {customDays.map((k) => (
          <div key={k} className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {weekdayLabels[Number(k)]}
            </span>
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <BreakRows list={value[k]} label={weekdayLabels[Number(k)]} onChange={(l) => set(k, l)} />
              {value[k].length === 0 && <span className="text-[11px] text-slate-400">{t('aucune pause')}</span>}
              <button
                type="button"
                onClick={() => unset(k)}
                className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 hover:underline"
              >
                {t('comme les autres jours')}
              </button>
            </div>
          </div>
        ))}
        {free.length > 0 && (
          <select
            aria-label={t('Personnaliser un jour')}
            value=""
            onChange={(e) => e.target.value && set(e.target.value, common.map((b) => ({ ...b })))}
            className="px-2 py-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <option value="">{t('Personnaliser un jour…')}</option>
            {free.map((k) => (
              <option key={k} value={k}>
                {weekdayLabels[Number(k)]}
              </option>
            ))}
          </select>
        )}
      </div>
    </details>
  );
};
