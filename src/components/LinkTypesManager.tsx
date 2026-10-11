import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Course, LinkType } from '../types';
import { MAX_LINK_TYPES, addLinkType, getLinkIcon, linkTypeName } from '../utils/courseLinks';
import { LinkTypeFields } from './LinkTypeFields';
import { t } from '../i18n';

interface LinkTypesManagerProps {
  linkTypes: LinkType[];
  courses: Course[];
  /** Enregistre tout de suite (la liste est commune à tous les cours). */
  onChange: (types: LinkType[]) => void;
}

/** Réglages : renommer, changer l'icône et la couleur, ajouter ou supprimer des types de liens. */
export const LinkTypesManager: React.FC<LinkTypesManagerProps> = ({ linkTypes, courses, onChange }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', icon: 'link', color: '#0d9488' });

  const usage = (typeId: string) => courses.reduce((n, c) => n + (c.links?.filter((l) => l.typeId === typeId).length ?? 0), 0);

  const commitNew = () => {
    const { types } = addLinkType(linkTypes, draft);
    if (types !== linkTypes) onChange(types);
    setAdding(false);
    setDraft({ name: '', icon: 'link', color: '#0d9488' });
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {linkTypes.map((type) => {
          const Icon = getLinkIcon(type);
          const editing = editingId === type.id;
          const used = usage(type.id);
          return (
            <li key={type.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ color: type.color, backgroundColor: `color-mix(in srgb, ${type.color} 14%, transparent)` }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{linkTypeName(type)}</span>
                {used > 0 && <span className="text-[10px] font-mono text-slate-400">{used}</span>}
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : type.id)}
                  title={t('Modifier ce type')}
                  aria-label={t('Modifier ce type')}
                  aria-expanded={editing}
                  className="p-1 text-slate-400 hover:text-teal-600 rounded"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (linkTypes.length <= 1) return;
                    const msg =
                      used > 0
                        ? t('Supprimer le type « {name} » ? {n} lien(s) s\'afficheront comme « Autre ».', { name: linkTypeName(type), n: used })
                        : t('Supprimer le type « {name} » ?', { name: linkTypeName(type) });
                    if (window.confirm(msg)) onChange(linkTypes.filter((x) => x.id !== type.id));
                  }}
                  disabled={linkTypes.length <= 1}
                  title={t('Supprimer ce type')}
                  aria-label={t('Supprimer ce type')}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {editing && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <LinkTypeFields
                    name={linkTypeName(type)}
                    icon={type.icon}
                    color={type.color}
                    onChange={(next) =>
                      onChange(
                        linkTypes.map((x) =>
                          x.id === type.id
                            ? // Nom inchangé : on garde la clé d'origine pour qu'il suive la langue de l'interface
                              { ...x, name: next.name === linkTypeName(type) ? type.name : next.name.slice(0, 40), icon: next.icon, color: next.color }
                            : x
                        )
                      )
                    }
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
          <LinkTypeFields {...draft} onChange={setDraft} autoFocus />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1 text-xs text-slate-500">
              {t('Annuler')}
            </button>
            <button
              type="button"
              onClick={commitNew}
              disabled={!draft.name.trim()}
              className="px-3 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-40"
            >
              {t('Ajouter')}
            </button>
          </div>
        </div>
      ) : (
        linkTypes.length < MAX_LINK_TYPES && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Plus className="w-3.5 h-3.5 text-teal-600" />
            {t('Nouveau type de lien')}
          </button>
        )
      )}
    </div>
  );
};
