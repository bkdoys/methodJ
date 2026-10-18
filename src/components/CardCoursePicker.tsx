import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Inbox, Plus, Search, X } from 'lucide-react';
import { Course, Subject } from '../types';
import { buildCourseTree, CourseTreeNode, filterCourseTree, pathToCourse } from '../utils/courseTree';
import { t } from '../i18n';

interface CardCoursePickerProps {
  courses: Course[];
  subjects: Subject[];
  /** Cours mis en évidence, branche dépliée (le dernier où l'on a ajouté une carte). */
  defaultCourseId?: string;
  onPick: (courseId: string) => void;
  /** Carte sans cours : elle va dans « Cartes à trier », à ranger plus tard. */
  onPickInbox?: () => void;
  /** Titre et sous-titre de la fenêtre (par défaut : ajout d'une carte). */
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

/** Premier cours de l'arbre (dans l'ordre d'affichage). */
function firstCourse(nodes: CourseTreeNode[]): string | undefined {
  for (const n of nodes) {
    const id = n.courseId ?? firstCourse(n.children);
    if (id) return id;
  }
  return undefined;
}

/**
 * Choix du cours dans lequel ajouter une carte, depuis la vue Cartes : arbre discipline › dossier › cours aux
 * couleurs du catalogue, avec recherche. Un clic sur un cours ouvre son éditeur.
 */
export const CardCoursePicker: React.FC<CardCoursePickerProps> = ({ courses, subjects, defaultCourseId, onPick, onPickInbox, title, subtitle, onClose }) => {
  const tree = useMemo(() => buildCourseTree(subjects, courses), [subjects, courses]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultCourseId ? pathToCourse(tree, defaultCourseId) : []));
  const lastRef = useRef<HTMLButtonElement>(null);

  const searching = query.trim().length > 0;
  const shown = useMemo(() => filterCourseTree(tree, query), [tree, query]);

  // La branche du dernier cours utilisé est dépliée : on la montre
  useEffect(() => {
    lastRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderNode = (node: CourseTreeNode, depth: number): React.ReactNode => {
    const pad = { paddingLeft: `${0.5 + depth * 1.1}rem` };
    if (node.courseId) {
      const last = node.courseId === defaultCourseId;
      return (
        <button
          key={node.key}
          ref={last ? lastRef : undefined}
          type="button"
          onClick={() => onPick(node.courseId!)}
          style={pad}
          className={`w-full flex items-center gap-2 py-2 pr-2 text-left text-sm rounded-lg hover:bg-teal-50 dark:hover:bg-teal-500/10 ${
            last ? 'bg-teal-50 dark:bg-teal-500/10 ring-1 ring-teal-300 dark:ring-teal-500/40' : ''
          }`}
        >
          <span className="w-4 shrink-0" />
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          <span className="min-w-0 break-words text-slate-900 dark:text-slate-100">{node.label}</span>
        </button>
      );
    }
    const expanded = searching || open.has(node.key);
    return (
      <div key={node.key}>
        <button
          type="button"
          onClick={() => toggle(node.key)}
          aria-expanded={expanded}
          style={pad}
          className="w-full flex items-center gap-2 py-2 pr-2 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
          )}
          {node.kind === 'folder' ? (
            <Folder className="w-4 h-4 shrink-0" style={{ color: node.color }} />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          )}
          <span className={`min-w-0 break-words text-sm text-slate-900 dark:text-slate-100 ${node.kind === 'subject' ? 'font-bold' : 'font-semibold'}`}>
            {node.label}
          </span>
        </button>
        {expanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

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

        {tree.length === 0 ? (
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
                    const first = searching ? firstCourse(shown) : undefined;
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
              {shown.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">{t('Aucun cours ne correspond.')}</p>
              ) : (
                shown.map((n) => renderNode(n, 0))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
