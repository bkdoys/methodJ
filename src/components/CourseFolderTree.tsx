import React, { useState } from 'react';
import { ChevronRight, Folder, FolderPlus, Layers, Palette, Pencil, Trash2 } from 'lucide-react';
import { Course, Subject } from '../types';
import { addFolder, courseInNode, deleteFolder, getChildFolders, getFolders, newFolderId, renameFolder, setChildFoldersColor, setFolderColor } from '../utils/folders';
import { getFolderColor } from '../utils/folderColors';
import { FolderColorPopover } from './FolderColorPopover';
import { t } from '../i18n';
import { useConfirm } from './ConfirmDialog';

/** Type de glisser-déposer d'un cours depuis le catalogue. */
export const COURSE_DRAG_MIME = 'application/x-medj-course';

export interface TreeSelection {
  subjectId: string;
  folderId?: string;
}

interface CourseFolderTreeProps {
  subjects: Subject[];
  courses: Course[];
  selected: TreeSelection | null;
  onSelect: (selection: TreeSelection | null) => void;
  /** Un cours est déposé sur un nœud de l'arbre. */
  onDropCourse: (courseId: string, node: TreeSelection) => void;
  /** `moveCourses` : les cours du dossier supprimé passent dans `to` (undefined = racine de la discipline). */
  onUpdateSubject: (subject: Subject, moveCourses?: { from: string; to: string | undefined }) => void;
  /** Retire la couleur personnelle de ces cours : ils reprennent celle de leur dossier. */
  onResetCourseColors: (courseIds: string[]) => void;
}

type Editing = { kind: 'add'; subjectId: string; parentId?: string } | { kind: 'rename'; subjectId: string; folderId: string };

/** Arbre discipline > dossier > sous-dossier pour filtrer et ranger les cours. */
export const CourseFolderTree: React.FC<CourseFolderTreeProps> = ({
  subjects,
  courses,
  selected,
  onSelect,
  onDropCourse,
  onUpdateSubject,
  onResetCourseColors,
}) => {
  const confirm = useConfirm();
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  // Palette de couleur ouverte : quel dossier et quel bouton l'a ouverte
  const [palette, setPalette] = useState<{ subjectId: string; folderId: string; anchor: HTMLElement } | null>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = (node: TreeSelection) => courses.filter((c) => courseInNode(c, node, subjects)).length;
  const isSelected = (node: TreeSelection) =>
    selected?.subjectId === node.subjectId && selected?.folderId === node.folderId;

  const startEdit = (e: Editing, initial = '') => {
    setEditing(e);
    setDraft(initial);
  };

  const commit = () => {
    const e = editing;
    const name = draft.trim();
    setEditing(null);
    setDraft('');
    if (!e || !name) return;
    const subject = subjects.find((s) => s.id === e.subjectId);
    if (!subject) return;
    if (e.kind === 'add') {
      const id = newFolderId();
      const next = addFolder(subject, name, e.parentId, id);
      if (next === subject) return;
      onUpdateSubject(next);
      setCollapsed((prev) => new Set([...prev].filter((x) => x !== (e.parentId ?? subject.id))));
      onSelect({ subjectId: subject.id, folderId: id });
    } else {
      onUpdateSubject(renameFolder(subject, e.folderId, name));
    }
  };

  const nameInput = (indent: number) => (
    <input
      autoFocus
      value={draft}
      maxLength={100}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') commit();
        if (ev.key === 'Escape') {
          setEditing(null);
          setDraft('');
        }
      }}
      placeholder={t('Nom du dossier')}
      style={{ marginLeft: indent }}
      className="my-0.5 w-[calc(100%-1rem)] px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
    />
  );

  const actionBtn =
    'p-1 rounded text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800';

  const row = (
    subject: Subject,
    node: TreeSelection,
    label: string,
    depth: number,
    opts: { hasChildren: boolean; folderId?: string; canAddChild: boolean }
  ) => {
    const sel = isSelected(node);
    // Un dossier a sa propre couleur (choisie, ou nuance automatique de la discipline). Son icône est pleine : avec un
    // trait fin, elle paraissait plus claire que ses cours, dessinés en aplat dans le planning et le catalogue.
    const color = getFolderColor(subject, node.folderId) ?? subject.color;
    const isOpen = !collapsed.has(node.folderId ?? node.subjectId);
    const renaming =
      editing?.kind === 'rename' && editing.subjectId === subject.id && editing.folderId === node.folderId;
    if (renaming) return nameInput(depth * 14 + 4);
    const key = `${node.subjectId}/${node.folderId ?? ''}`;
    const dropTarget = dropKey === key;
    return (
      <div
        className="group flex items-center rounded-lg border transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
        style={{
          paddingLeft: depth * 14,
          backgroundColor: dropTarget ? `${color}26` : sel ? (node.folderId ? `${color}1f` : subject.accentBg) : undefined,
          borderColor: dropTarget || sel ? color : 'transparent',
          borderStyle: dropTarget ? 'dashed' : undefined,
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(COURSE_DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dropKey !== key) setDropKey(key);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropKey(null);
        }}
        onDrop={(e) => {
          const courseId = e.dataTransfer.getData(COURSE_DRAG_MIME);
          setDropKey(null);
          if (!courseId) return;
          e.preventDefault();
          onDropCourse(courseId, node);
        }}
      >
        <button
          type="button"
          onClick={() => opts.hasChildren && toggle(node.folderId ?? node.subjectId)}
          className={`p-1 shrink-0 ${opts.hasChildren ? 'text-slate-400' : 'invisible'}`}
          aria-label={isOpen ? t('Replier') : t('Déplier')}
          tabIndex={opts.hasChildren ? 0 : -1}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(node)}
          title={label}
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left text-xs font-semibold"
        >
          {node.folderId ? (
            <Folder className="w-3.5 h-3.5 shrink-0" style={{ color }} fill={color} />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
          )}
          <span
            // Jusqu'à deux lignes (le nom complet est dans l'infobulle), au lieu d'une ligne coupée
            className={`min-w-0 line-clamp-2 break-words leading-snug ${node.folderId ? '' : 'font-bold'} dark:text-slate-100`}
            style={{ color: sel ? color : undefined }}
          >
            {label}
          </span>
          <span className="ml-auto pl-1 text-[10px] font-mono text-slate-400 shrink-0">{count(node)}</span>
        </button>
        {/* Les boutons restent affichés tant que la palette de ce dossier est ouverte (elle se place contre le bouton) */}
        <span
          className={`${
            palette?.folderId !== undefined && palette.folderId === node.folderId && palette.subjectId === subject.id ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'
          } items-center shrink-0 pr-0.5`}
        >
          {opts.canAddChild && (
            <button
              type="button"
              title={t('Nouveau dossier')}
              aria-label={t('Nouveau dossier')}
              onClick={() => startEdit({ kind: 'add', subjectId: subject.id, parentId: node.folderId })}
              className={actionBtn}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          )}
          {node.folderId && (
            <>
              <button
                type="button"
                title={t('Couleur du dossier')}
                aria-label={t('Couleur du dossier')}
                aria-haspopup="dialog"
                onClick={(e) => setPalette({ subjectId: subject.id, folderId: node.folderId!, anchor: e.currentTarget })}
                className={actionBtn}
              >
                <Palette className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={t('Renommer')}
                aria-label={t('Renommer')}
                onClick={() => startEdit({ kind: 'rename', subjectId: subject.id, folderId: node.folderId! }, label)}
                className={actionBtn}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title={t('Supprimer ce dossier')}
                aria-label={t('Supprimer ce dossier')}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('Supprimer le dossier « {name} » ?', { name: label }),
                    message: t('Ses cours et sous-dossiers remontent d\'un niveau.'),
                    confirmLabel: t('Supprimer'),
                    tone: 'danger',
                  });
                  if (!ok) return;
                  const { subject: next, courseTarget } = deleteFolder(subject, node.folderId!);
                  onUpdateSubject(next, { from: node.folderId!, to: courseTarget });
                  if (selected?.subjectId === subject.id && selected.folderId === node.folderId) {
                    onSelect({ subjectId: subject.id, folderId: courseTarget });
                  }
                }}
                className={`${actionBtn} hover:text-rose-600 dark:hover:text-rose-400`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  const adding = (subject: Subject, parentId: string | undefined, depth: number) =>
    editing?.kind === 'add' && editing.subjectId === subject.id && editing.parentId === parentId
      ? nameInput(depth * 14 + 4)
      : null;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg border text-left text-xs font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
          selected === null ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300' : 'border-transparent dark:text-slate-100'
        }`}
      >
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{t('Tous les cours')}</span>
        <span className="ml-auto text-[10px] font-mono text-slate-400">{courses.length}</span>
      </button>

      {subjects.map((subject) => {
        const level1 = getChildFolders(subject);
        const subjectOpen = !collapsed.has(subject.id);
        return (
          <div key={subject.id}>
            {row(subject, { subjectId: subject.id }, subject.name, 0, {
              hasChildren: level1.length > 0,
              canAddChild: true,
            })}
            {adding(subject, undefined, 1)}
            {subjectOpen &&
              level1.map((f) => {
                const level2 = getChildFolders(subject, f.id);
                const open = !collapsed.has(f.id);
                return (
                  <React.Fragment key={f.id}>
                    {row(subject, { subjectId: subject.id, folderId: f.id }, f.name, 1, {
                      hasChildren: level2.length > 0,
                      canAddChild: true,
                    })}
                    {adding(subject, f.id, 2)}
                    {open &&
                      level2.map((g) => (
                        <React.Fragment key={g.id}>
                          {row(subject, { subjectId: subject.id, folderId: g.id }, g.name, 2, {
                            hasChildren: false,
                            canAddChild: false,
                          })}
                        </React.Fragment>
                      ))}
                  </React.Fragment>
                );
              })}
          </div>
        );
      })}
      {palette && (() => {
        const subject = subjects.find((x) => x.id === palette.subjectId);
        const folder = getFolders(subject).find((f) => f.id === palette.folderId);
        if (!subject || !folder) return null;
        // Cours du dossier (sous-dossiers compris) qui ont leur propre couleur : elle l'emporte sur celle du dossier
        const personal = courses.filter((c) => c.customColor && courseInNode(c, { subjectId: subject.id, folderId: folder.id }, subjects));
        return (
          <FolderColorPopover
            childFolderCount={getChildFolders(subject, folder.id).length}
            onApplyToChildren={() => onUpdateSubject(setChildFoldersColor(subject, folder.id, getFolderColor(subject, folder.id) ?? subject.color))}
            personalColorCount={personal.length}
            onUseFolderColor={() => onResetCourseColors(personal.map((c) => c.id))}
            anchor={palette.anchor}
            folderName={folder.name}
            chosen={folder.color}
            current={getFolderColor(subject, folder.id) ?? subject.color}
            onPick={(color) => onUpdateSubject(setFolderColor(subject, folder.id, color))}
            onClose={() => setPalette(null)}
          />
        );
      })()}
    </div>
  );
};
