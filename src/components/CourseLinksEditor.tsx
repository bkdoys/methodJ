import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CourseLink, LinkType } from '../types';
import {
  MAX_LINKS_PER_COURSE,
  addCourseLink,
  addLinkType,
  getLinkIcon,
  guessLinkTypeId,
  hostLabel,
  linkLabel,
  linkTypeName,
  normalizeUrl,
  resolveLinkType,
} from '../utils/courseLinks';
import { LinkTypeFields } from './LinkTypeFields';
import { t } from '../i18n';

const NEW_TYPE = '__new__';

interface CourseLinksEditorProps {
  links: CourseLink[];
  linkTypes: LinkType[];
  onChangeLinks: (links: CourseLink[]) => void;
  /** Création d'un type depuis le formulaire : il rejoint la liste commune à tous les cours. */
  onChangeLinkTypes: (types: LinkType[]) => void;
}

const field =
  'px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500';

/** Liste des liens d'un cours et formulaire d'ajout (adresse, type, libellé facultatif ; « + Nouveau type… » crée un type au vol). */
export const CourseLinksEditor: React.FC<CourseLinksEditorProps> = ({ links, linkTypes, onChangeLinks, onChangeLinkTypes }) => {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [typeId, setTypeId] = useState(linkTypes[0]?.id ?? '');
  const [typeTouched, setTypeTouched] = useState(false);
  const [newType, setNewType] = useState({ name: '', icon: 'link', color: '#0d9488' });
  const [error, setError] = useState<string | null>(null);

  const creatingType = typeId === NEW_TYPE;
  const full = links.length >= MAX_LINKS_PER_COURSE;

  const handleUrl = (value: string) => {
    setUrl(value);
    setError(null);
    // Le type se suggère d'après le site, tant qu'on n'a pas choisi soi-même
    if (!typeTouched) {
      const normalized = normalizeUrl(value);
      const guess = normalized ? guessLinkTypeId(normalized) : undefined;
      if (guess && linkTypes.some((x) => x.id === guess)) setTypeId(guess);
    }
  };

  const handleAdd = () => {
    if (!normalizeUrl(url)) {
      setError(t('Adresse invalide : collez un lien http(s), par exemple https://drive.google.com/…'));
      return;
    }
    let finalType = typeId;
    if (creatingType) {
      const created = addLinkType(linkTypes, newType);
      if (!created.id) {
        setError(t('Donnez un nom au nouveau type.'));
        return;
      }
      if (created.types !== linkTypes) onChangeLinkTypes(created.types);
      finalType = created.id;
    }
    const next = addCourseLink(links, { url, typeId: finalType, label });
    if (next === links) {
      setError(t('Ce lien est déjà dans la liste.'));
      return;
    }
    onChangeLinks(next);
    setUrl('');
    setLabel('');
    setTypeTouched(false);
    setTypeId(finalType);
    setNewType({ name: '', icon: 'link', color: '#0d9488' });
    setError(null);
  };

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link) => {
            const type = resolveLinkType(linkTypes, link.typeId);
            const Icon = getLinkIcon(type);
            return (
              <li
                key={link.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"
              >
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ color: type.color, backgroundColor: `color-mix(in srgb, ${type.color} 14%, transparent)` }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:underline"
                  title={link.url}
                >
                  <span className="block truncate">{linkLabel(link)}</span>
                  {link.label?.trim() && (
                    <span className="block truncate text-[10px] font-normal text-slate-400">{hostLabel(link.url)}</span>
                  )}
                </a>
                <select
                  value={type.id}
                  onChange={(e) => onChangeLinks(links.map((l) => (l.id === link.id ? { ...l, typeId: e.target.value } : l)))}
                  aria-label={t('Type du lien')}
                  className={`${field} !py-1 max-w-[8.5rem]`}
                >
                  {!linkTypes.some((x) => x.id === type.id) && <option value={type.id}>{linkTypeName(type)}</option>}
                  {linkTypes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {linkTypeName(x)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChangeLinks(links.filter((l) => l.id !== link.id))}
                  title={t('Retirer ce lien')}
                  aria-label={t('Retirer ce lien')}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('Nombre maximal de liens atteint ({n}).', { n: MAX_LINKS_PER_COURSE })}</p>
      ) : (
        <div className="space-y-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => handleUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={t('Coller un lien (Drive, flashcards…)')}
              aria-label={t('Adresse du lien')}
              className={`${field} flex-1 min-w-[12rem]`}
            />
            <select
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setTypeTouched(true);
              }}
              aria-label={t('Type du lien')}
              className={field}
            >
              {linkTypes.map((x) => (
                <option key={x.id} value={x.id}>
                  {linkTypeName(x)}
                </option>
              ))}
              <option value={NEW_TYPE}>{t('+ Nouveau type…')}</option>
            </select>
          </div>
          <input
            type="text"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={t('Libellé (facultatif, sinon le nom du site)')}
            aria-label={t('Libellé du lien')}
            className={`${field} w-full`}
          />
          {creatingType && (
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <LinkTypeFields {...newType} onChange={setNewType} autoFocus />
            </div>
          )}
          {error && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Ajouter le lien')}
          </button>
        </div>
      )}
    </div>
  );
};
