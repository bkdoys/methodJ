import React, { useState } from 'react';
import { Check, ChevronRight, Folder, FolderPlus } from 'lucide-react';
import { Subject } from '../types';
import { addFolder, getChildFolders, newFolderId } from '../utils/folders';
import { getFolderColor } from '../utils/folderColors';
import { t } from '../i18n';

interface FolderTreePickerProps {
  subjects: Subject[];
  subjectId: string;
  folderId?: string;
  onChange: (subjectId: string, folderId?: string) => void;
  /** Présent : permet de créer un dossier sur place (« + Dossier »). */
  onUpdateSubject?: (subject: Subject) => void;
}

/** Choix de l'emplacement d'un cours : discipline (colorée) puis arborescence de ses dossiers. */
export const FolderTreePicker: React.FC<FolderTreePickerProps> = ({
  subjects,
  subjectId,
  folderId,
  onChange,
  onUpdateSubject,
}) => {
  // Où on est en train de saisir un nouveau dossier : `${subjectId}` ou `${subjectId}/${parentFolderId}`
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commitAdd = (subject: Subject, parentId?: string) => {
    const name = draft.trim();
    setAdding(null);
    setDraft('');
    if (!name || !onUpdateSubject) return;
    const id = newFolderId();
    const next = addFolder(subject, name, parentId, id);
    if (next === subject) return;
    onUpdateSubject(next);
    onChange(subject.id, id);
  };

  const addRow = (subject: Subject, parentId: string | undefined, depth: number) => {
    const key = parentId ? `${subject.id}/${parentId}` : subject.id;
    if (adding === key) {
      return (
        <input
          autoFocus
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitAdd(subject, parentId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAdd(subject, parentId);
            }
            if (e.key === 'Escape') {
              setAdding(null);
              setDraft('');
            }
          }}
          placeholder={t('Nom du dossier')}
          style={{ marginLeft: depth * 16 }}
          className="my-0.5 w-48 px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      );
    }
    if (!onUpdateSubject) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setAdding(key);
          setDraft('');
        }}
        style={{ marginLeft: depth * 16 }}
        className="flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-400 hover:text-teal-600 transition-colors"
      >
        <FolderPlus className="w-3 h-3" />
        {t('Dossier')}
      </button>
    );
  };

  const folderRow = (subject: Subject, id: string, name: string, depth: number) => {
    const selected = subject.id === subjectId && folderId === id;
    const color = getFolderColor(subject, id) ?? subject.color;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onChange(subject.id, id)}
        style={{
          marginLeft: depth * 16,
          backgroundColor: selected ? `${color}1f` : undefined,
          borderColor: selected ? color : 'transparent',
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <Folder className="w-3.5 h-3.5 shrink-0" style={{ color }} fill={color} />
        <span className="truncate dark:text-slate-100" style={{ color: selected ? color : undefined }}>
          {name}
        </span>
        {selected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color }} />}
      </button>
    );
  };

  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-1.5 space-y-0.5">
      {subjects.map((sub) => {
        const open = sub.id === subjectId;
        const selected = open && !folderId;
        return (
          <div key={sub.id}>
            <button
              type="button"
              onClick={() => onChange(sub.id, undefined)}
              style={{
                backgroundColor: selected ? sub.accentBg : undefined,
                borderColor: selected ? sub.color : 'transparent',
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
              />
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
              <span className="truncate dark:text-white" style={{ color: selected ? sub.color : undefined }}>
                {sub.name}
              </span>
              {selected && <Check className="w-3.5 h-3.5 shrink-0 ml-auto" style={{ color: sub.color }} />}
            </button>

            {open && (
              <div
                className="ml-4 pl-2 mt-0.5 mb-1 space-y-0.5 flex flex-col items-start border-l-2"
                style={{ borderColor: `${sub.color}55` }}
              >
                {getChildFolders(sub).map((f) => (
                  <React.Fragment key={f.id}>
                    {folderRow(sub, f.id, f.name, 0)}
                    {getChildFolders(sub, f.id).map((g) => folderRow(sub, g.id, g.name, 1))}
                    {addRow(sub, f.id, 1)}
                  </React.Fragment>
                ))}
                {addRow(sub, undefined, 0)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
