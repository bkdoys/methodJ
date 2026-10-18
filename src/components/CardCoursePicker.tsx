import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Inbox, Layers, Plus, Search, X } from 'lucide-react';
import { Course, Subject } from '../types';
import { courseChoices } from '../utils/courseTree';
import { t } from '../i18n';

interface CardCoursePickerProps {
  courses: Course[];
  subjects: Subject[];
  /** Cours mis en évidence et ramené dans la vue (le dernier où l'on a ajouté une carte). */
  defaultCourseId?: string;
  onPick: (courseId: string) => void;
  /** Carte sans cours : elle va dans « Cartes à trier », à ranger plus tard. */
  onPickInbox?: () => void;
  /** Titre et sous-titre de la fenêtre (par défaut : ajout d'une carte). */
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

/**
 * Choix du cours où ranger des cartes : une liste de cours seulement (jamais de dossier à ouvrir), groupés par
 * discipline, chacun avec son dossier en petit sous le titre, et une recherche. Toujours la même, avec ou sans import.
 */
export const CardCoursePicker: React.FC<CardCoursePickerProps> = ({ courses, subjects, defaultCourseId, onPick, onPickInbox, title, subtitle, onClose }) => {
  const [query, setQuery] = useState('');
  const lastRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => courseChoices(subjects, courses, query), [subjects, courses, query]);
  const hasCourses = useMemo(() => courseChoices(subjects, courses).length > 0, [subjects, courses]);
  const searching = query.trim().length > 0;

  // Le dernier cours utilisé est mis en évidence : on le montre
  useEffect(() => {
    lastRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? t('Ajouter une carte')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <Plus className="w-5 h-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title ?? t('Ajouter une carte')}</h2>
            <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{subtitle ?? t('Dans quel cours ?')}</p>
          </div>
          <button
            type="button"
            aria-label={t('Fermer')}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {onPickInbox && (
          <div className="px-4 pt-3 shrink-0">
            <button
              type="button"
              onClick={onPickInbox}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <Inbox className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{t('Sans cours pour l\'instant')}</span>
                <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">{t('Dans « Cartes à trier », à ranger plus tard dans un cours')}</span>
              </span>
            </button>
          </div>
        )}

        {!hasCourses ? (
          <p className="p-5 text-sm text-slate-600 dark:text-slate-400">{t('Créez d\'abord un cours : les cartes sont rangées par cours.')}</p>
        ) : (
          <>
            <div className="px-4 pt-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Entrée prend le premier cours trouvé
                    const first = searching ? groups[0]?.items[0]?.course.id : undefined;
                    if (e.key === 'Enter' && first) {
                      e.preventDefault();
                      onPick(first);
                    }
                  }}
                  placeholder={t('Rechercher un cours')}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2 pt-1.5">
              {groups.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">{t('Aucun cours ne correspond.')}</p>
              ) : (
                groups.map((g) => (
                  <section key={g.subject.id} className="mb-1">
                    <h3 className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.subject.color }} />
                      <span className="truncate">{g.subject.name}</span>
                    </h3>
                    {g.items.map(({ course, folderPath, color }, idx) => {
                      const last = course.id === defaultCourseId;
                      // En-tête de dossier (non cliquable) à chaque changement de dossier : les lignes cliquables sont toujours des cours
                      const newFolder = folderPath !== '' && folderPath !== (idx > 0 ? g.items[idx - 1].folderPath : '');
                      return (
                        <React.Fragment key={course.id}>
                          {newFolder && (
                            <div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[0.6875rem] font-semibold text-slate-500 dark:text-slate-400" aria-hidden="true">
                              <Folder className="w-3.5 h-3.5 shrink-0" />
                              <span className="break-words">{folderPath}</span>
                            </div>
                          )}
                          <button
                            ref={last ? lastRef : undefined}
                            type="button"
                            onClick={() => onPick(course.id)}
                            className={`w-full flex items-center gap-2.5 py-2 pr-3 text-left rounded-lg hover:bg-teal-50 dark:hover:bg-teal-500/10 ${
                              folderPath ? 'pl-7' : 'pl-3'
                            } ${last ? 'bg-teal-50 dark:bg-teal-500/10 ring-1 ring-teal-300 dark:ring-teal-500/40' : ''}`}
                          >
                            <Layers className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                            <span className="min-w-0 flex-1 text-sm text-slate-900 dark:text-slate-100 break-words">{course.title}</span>
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </section>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
