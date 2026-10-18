import React, { ReactNode } from 'react';
import { RichNote } from './RichNote';
import { RevisionItem } from '../types';
import { formatFrenchDate } from '../utils/dateUtils';
import { NotebookPen } from 'lucide-react';
import { t } from '../i18n';
import { revLabel } from '../utils/jMethod';

interface RevisionNotesJournalProps {
  courseId: string;
  revisions: RevisionItem[];
  /** Exclut ce créneau (celui en cours de saisie) du journal. */
  excludeRevisionId?: string;
  /** Ne garde que les J strictement inférieurs — rappel avant révision. */
  beforeJIndex?: number;
  title?: string;
  className?: string;
  /** Pas de hauteur max : affiche tout (vue synthèse). */
  expanded?: boolean;
  /** Couleur du cours (hex) pour les pastilles J et l'icône. */
  accentColor?: string;
  /** Texte affiché s'il n'y a aucune note (sinon le composant ne rend rien). */
  emptyMessage?: string;
  /** Action à droite de chaque note (ex. bouton « ajouter aux notes du cours »). */
  renderAction?: (revision: RevisionItem) => ReactNode;
}

/**
 * Liste chronologique des notes saisies sur les créneaux d'un cours (J0, J1, J3...).
 * Ne rend rien s'il n'y a aucune note.
 */
export const RevisionNotesJournal: React.FC<RevisionNotesJournalProps> = ({
  courseId,
  revisions,
  excludeRevisionId,
  beforeJIndex,
  title = t('Notes des créneaux'),
  className = '',
  expanded = false,
  accentColor,
  emptyMessage,
  renderAction,
}) => {
  const entries = revisions
    .filter(
      (r) =>
        r.courseId === courseId &&
        r.id !== excludeRevisionId &&
        !!r.notes?.trim() &&
        (beforeJIndex === undefined || r.jIndex < beforeJIndex)
    )
    .sort((a, b) => a.jIndex - b.jIndex);

  if (entries.length === 0 && !emptyMessage) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <NotebookPen className="w-3.5 h-3.5 text-teal-600" style={accentColor ? { color: accentColor } : undefined} />
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</span>
      </div>
      {entries.length === 0 && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">{emptyMessage}</p>
      )}
      <ul className={`space-y-1.5 ${expanded ? '' : 'max-h-40 overflow-y-auto'}`}>
        {entries.map((r) => (
          <li
            key={r.id}
            className="flex gap-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs"
            style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
          >
            <span
              className="shrink-0 h-5 px-1.5 rounded-md bg-teal-600/10 text-teal-700 dark:text-teal-400 font-bold flex items-center"
              style={accentColor ? { backgroundColor: `${accentColor}26`, color: accentColor } : undefined}
            >
              {revLabel(r)}
            </span>
            <div className="min-w-0 flex-1">
              <RichNote
                text={r.notes ?? ''}
                className={`text-slate-700 dark:text-slate-300 ${expanded ? 'text-sm' : ''}`}
              />
              <span className="text-[0.625rem] text-slate-400 dark:text-slate-500">
                {formatFrenchDate(r.completedDate || r.scheduledDate)}
              </span>
            </div>
            {renderAction && <div className="shrink-0 self-start">{renderAction(r)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
};
