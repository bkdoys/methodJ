import React from 'react';
import { CalendarRange, Trash2 } from 'lucide-react';
import { RevisionItem, RevisionPeriod } from '../../types';
import { plural, t } from '../../i18n';
import { formatFrenchDate } from '../../utils/dateUtils';
import { useConfirm } from '../ConfirmDialog';

interface Props {
  periods: RevisionPeriod[];
  revisions: RevisionItem[];
  todayIso: string;
  onDelete: (periodId: string, removePendingReviews: boolean) => void;
}

/** Réglages › Examen : les périodes de révision enregistrées ; supprimer une période rend les réglages habituels. */
export const RevisionPeriodsSection: React.FC<Props> = ({ periods, revisions, todayIso, onDelete }) => {
  const confirm = useConfirm();

  if (periods.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('Aucune période pour l\'instant.')}</p>
    );
  }

  const handleDelete = async (p: RevisionPeriod) => {
    const pending = revisions.filter(
      (r) => r.kind === 'R' && !r.completed && p.courseIds.includes(r.courseId) && r.scheduledDate >= p.start && r.scheduledDate <= p.end
    ).length;
    const ok = await confirm({
      title: t('Supprimer la période « {name} » ?', { name: p.name }),
      message: t('Ses horaires, pauses et objectif cessent de s\'appliquer : ces jours reprennent vos réglages habituels.'),
      confirmLabel: t('Supprimer'),
      tone: 'danger',
    });
    if (!ok) return;
    const removePending =
      pending > 0 &&
      (await confirm({
        title: plural(pending, 'Retirer aussi {n} révision à venir ?', 'Retirer aussi les {n} révisions à venir ?'),
        message: t('Sinon, elles restent dans le planning. Les révisions faites sont toujours gardées.'),
        confirmLabel: t('Retirer'),
        cancelLabel: t('Garder'),
        tone: 'danger',
      }));
    onDelete(p.id, removePending);
  };

  return (
    <ul className="space-y-2">
      {[...periods]
        .sort((a, b) => b.start.localeCompare(a.start))
        .map((p) => (
          <li key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <CalendarRange className="w-4 h-4 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white break-words">{p.name}</p>
              <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {t('Du {start} au {end}', { start: formatFrenchDate(p.start), end: formatFrenchDate(p.end) })}
                {' · '}
                {plural(p.courseIds.length, '{n} cours', '{n} cours')}
                {p.targetHours ? ` · ${t('{h} h/jour', { h: p.targetHours })}` : ''}
                {p.end < todayIso ? ` · ${t('terminée')}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('Supprimer la période')}
              onClick={() => handleDelete(p)}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
    </ul>
  );
};
