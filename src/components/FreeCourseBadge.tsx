import React from 'react';
import { CalendarOff } from 'lucide-react';
import { t } from '../i18n';

/** Marque bien visible d'un cours sans J programmé (révisions R ajoutées à la main). */
export const FreeCourseBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.6875rem] font-bold whitespace-nowrap bg-violet-100 text-violet-800 border border-dashed border-violet-400 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-600 ${className}`}
    title={t('Aucun J programmé : les révisions (R) sont ajoutées à la main')}
  >
    <CalendarOff className="w-3 h-3 shrink-0" />
    {t('Libre')}
  </span>
);
