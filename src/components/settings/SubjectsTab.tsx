import React, { useRef, useState } from 'react';
import type { Course, Subject } from '../../types';
import { plural, t } from '../../i18n';
import { useConfirm } from '../ConfirmDialog';
import { PRESET_COURSE_COLORS } from '../../utils/colorUtils';
import { parseSubjectsImport } from '../../utils/subjectsImport';
import { APP_NAME } from '../../appInfo';
import { Upload, Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';

/** État de l'onglet Disciplines (gardé dans la fenêtre des réglages, comme les autres onglets). */
export function useSubjectsDraft(subjects: Subject[]) {
  const [localSubjects, setLocalSubjects] = useState<Subject[]>(subjects);
  // Suppression d'une matière qui a des cours : choix du sort de ces cours
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deleteMode, setDeleteMode] = useState<'reassign' | 'delete'>('reassign');
  const [reassignToId, setReassignToId] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subNameInput, setSubNameInput] = useState('');
  const [subCodeInput, setSubCodeInput] = useState('');
  const [subColorInput, setSubColorInput] = useState('#0d9488');
  // Ajout d'une matière
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubColor, setNewSubColor] = useState('#0d9488');
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  return {
    localSubjects, setLocalSubjects, subjectToDelete, setSubjectToDelete, deleteMode, setDeleteMode,
    reassignToId, setReassignToId, editingSubjectId, setEditingSubjectId, subNameInput, setSubNameInput,
    subCodeInput, setSubCodeInput, subColorInput, setSubColorInput, isAddingSubject, setIsAddingSubject,
    newSubName, setNewSubName, newSubCode, setNewSubCode, newSubColor, setNewSubColor, importMsg, setImportMsg,
    /** Reprend la liste enregistrée (à l'ouverture de la fenêtre). */
    reset: (s: Subject[]) => setLocalSubjects(s),
  };
}

export type SubjectsDraft = ReturnType<typeof useSubjectsDraft>;

interface SubjectsTabProps {
  draft: SubjectsDraft;
  courses: Course[];
  /** Enregistre aussitôt la liste des disciplines. */
  onSaveSubjects: (newSubjects: Subject[]) => void;
}

/** Onglet Disciplines : liste, ajout, modification, suppression et import des disciplines. */
export const SubjectsTab: React.FC<SubjectsTabProps> = ({ draft, courses, onSaveSubjects }) => {
  const confirm = useConfirm();
  const { localSubjects, setLocalSubjects, setSubjectToDelete, setDeleteMode, setReassignToId, editingSubjectId, setEditingSubjectId, subNameInput, setSubNameInput, subCodeInput, setSubCodeInput, subColorInput, setSubColorInput, isAddingSubject, setIsAddingSubject, newSubName, setNewSubName, newSubCode, setNewSubCode, newSubColor, setNewSubColor, importMsg, setImportMsg } = draft;

  const subjectsFileRef = useRef<HTMLInputElement>(null);

  // Subject management handlers
  const handleStartEditSubject = (sub: Subject) => {
    setEditingSubjectId(sub.id);
    setSubNameInput(sub.name);
    setSubCodeInput(sub.code);
    setSubColorInput(sub.color);
  };

  const handleSaveEditSubject = (subjectId: string) => {
    if (!subNameInput.trim()) return;
    const updated = localSubjects.map((s) => {
      if (s.id === subjectId) {
        return {
          ...s,
          name: subNameInput.trim(),
          code: subCodeInput.trim() || 'MED',
          color: subColorInput,
          accentBg: `${subColorInput}15`,
        };
      }
      return s;
    });
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setEditingSubjectId(null);
  };

  const handleAddNewSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const newSub: Subject = {
      id: `sub_${Date.now()}`,
      name: newSubName.trim(),
      code: newSubCode.trim().toUpperCase() || 'MED',
      color: newSubColor,
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-200',
      accentBg: `${newSubColor}15`,
    };
    const updated = [...localSubjects, newSub];
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setNewSubName('');
    setNewSubCode('');
    setIsAddingSubject(false);
  };

  // Suppression : simple confirmation sans cours ; sinon on demande ce que deviennent les cours rattachés
  const handleDeleteSubject = async (subject: Subject) => {
    const attachedCourses = courses.filter((c) => c.subjectId === subject.id);
    const count = attachedCourses.length;

    if (count === 0) {
      const ok = await confirm({
        title: t('Supprimer la matière « {name} » ?', { name: subject.name }),
        confirmLabel: t('Supprimer'),
        tone: 'danger',
      });
      if (ok) {
        const updated = localSubjects.filter((s) => s.id !== subject.id);
        setLocalSubjects(updated);
        onSaveSubjects(updated);
      }
      return;
    }

    const others = localSubjects.filter((s) => s.id !== subject.id);
    setDeleteMode(others.length > 0 ? 'reassign' : 'delete');
    setReassignToId(others[0]?.id ?? '');
    setSubjectToDelete(subject);
  };

  const handleImportSubjects = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file) return;
    if (file.size > 1_000_000) {
      setImportMsg({ type: 'error', text: t('Fichier trop volumineux (max 1 Mo).') });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { added, updated: enriched, foldersAdded, duplicates, invalid } = parseSubjectsImport(
          String(ev.target?.result ?? ''),
          localSubjects
        );
        const changed = added.length > 0 || enriched.length > 0;
        if (changed) {
          const enrichedById = new Map(enriched.map((s) => [s.id, s]));
          const updated = [...localSubjects.map((s) => enrichedById.get(s.id) ?? s), ...added];
          setLocalSubjects(updated);
          onSaveSubjects(updated);
        }
        const extra = [
          duplicates ? t('{n} doublon(s) ignoré(s)', { n: duplicates }) : '',
          invalid ? t('{n} ligne(s) invalide(s)', { n: invalid }) : '',
        ].filter(Boolean).join(', ');
        setImportMsg({
          type: changed ? 'ok' : 'error',
          text: `${t('{n} matière(s) importée(s)', { n: added.length })}${foldersAdded ? ` · ${t('{n} dossier(s) créé(s)', { n: foldersAdded })}` : ''}${extra ? ` · ${extra}` : ''}.`,
        });
      } catch (err) {
        setImportMsg({
          type: 'error',
          text: err instanceof Error ? t('Import impossible : {msg}', { msg: err.message }) : t('Fichier illisible.'),
        });
      }
    };
    reader.readAsText(file);
  };

  return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {t('Matières médicales enregistrées')}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('Modifiez le libellé, le code et le code couleur de chaque matière.')}
                        </p>
                      </div>

                      {!isAddingSubject && (
                        <button
                          type="button"
                          onClick={() => setIsAddingSubject(true)}
                          className="px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-xl hover:bg-teal-100 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('Ajouter une matière')}</span>
                        </button>
                      )}
                    </div>

                    {/* Form to add a new subject */}
                    {isAddingSubject && (
                      <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 space-y-3 animate-in fade-in">
                        <span className="text-xs font-bold text-teal-900 dark:text-teal-300 block">
                          {t('Nouvelle matière médicale')}
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="sm:col-span-2">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                              {t('Nom de la matière')}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder={t('Ex: Ophtalmologie, Dermatologie...')}
                              value={newSubName}
                              onChange={(e) => setNewSubName(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                              {t('Code court')}
                            </label>
                            <input
                              type="text"
                              placeholder={t('OPHTALMO')}
                              value={newSubCode}
                              onChange={(e) => setNewSubCode(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Color selection */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            {t('Couleur associée')}
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            {PRESET_COURSE_COLORS.map((col) => (
                              <button
                                key={col.hex}
                                type="button"
                                onClick={() => setNewSubColor(col.hex)}
                                className={`w-6 h-6 rounded-full transition-transform ${
                                  newSubColor === col.hex ? 'ring-2 ring-offset-2 ring-teal-500 scale-110' : 'hover:scale-105'
                                }`}
                                style={{ backgroundColor: col.hex }}
                              />
                            ))}
                            <input
                              type="color"
                              value={newSubColor}
                              onChange={(e) => setNewSubColor(e.target.value)}
                              className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsAddingSubject(false)}
                            className="px-3 py-1 text-xs text-slate-500"
                          >
                            {t('Annuler')}
                          </button>
                          <button
                            type="button"
                            onClick={handleAddNewSubject}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                          >
                            {t('Créer la matière')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* List of existing subjects */}
                    <div className="space-y-2">
                      {localSubjects.map((sub) => {
                        const attachedCount = courses.filter((c) => c.subjectId === sub.id).length;
                        const isEditing = editingSubjectId === sub.id;

                        return (
                          <div
                            key={sub.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                          >
                            {isEditing ? (
                              <div className="space-y-2 flex-1">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    value={subNameInput}
                                    onChange={(e) => setSubNameInput(e.target.value)}
                                    className="sm:col-span-2 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={subCodeInput}
                                    onChange={(e) => setSubCodeInput(e.target.value)}
                                    className="px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {PRESET_COURSE_COLORS.map((col) => (
                                    <button
                                      key={col.hex}
                                      type="button"
                                      onClick={() => setSubColorInput(col.hex)}
                                      className={`w-5 h-5 rounded-full ${
                                        subColorInput === col.hex ? 'ring-2 ring-offset-1 ring-teal-500 scale-110' : ''
                                      }`}
                                      style={{ backgroundColor: col.hex }}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    value={subColorInput}
                                    onChange={(e) => setSubColorInput(e.target.value)}
                                    className="w-6 h-6 rounded border-0 cursor-pointer p-0 bg-transparent"
                                  />
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setEditingSubjectId(null)}
                                    className="text-xs text-slate-500"
                                  >
                                    {t('Annuler')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEditSubject(sub.id)}
                                    className="px-3 py-1 text-xs font-bold text-white bg-teal-600 rounded-md"
                                  >
                                    {t('Enregistrer')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <span
                                    className="w-4 h-4 rounded-full shrink-0 shadow-2xs"
                                    style={{ backgroundColor: sub.color }}
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        {sub.name}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded">
                                        {sub.code}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {attachedCount === 0 ? (
                                        <span className="text-slate-400">{t('Aucun cours rattaché')}</span>
                                      ) : (
                                        <span className="font-medium text-teal-700 dark:text-teal-400">
                                          {plural(attachedCount, '{n} cours rattaché', '{n} cours rattachés')}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 self-end sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditSubject(sub)}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                    title={t('Modifier le nom ou la couleur')}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSubject(sub)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                    title={
                                      attachedCount > 0
                                        ? t('Supprimer ({n} cours rattachés : à rattacher ailleurs ou supprimer)', { n: attachedCount })
                                        : t('Supprimer cette matière')
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Import en bas de liste */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <input
                        ref={subjectsFileRef}
                        type="file"
                        accept=".json,.csv,.txt"
                        onChange={handleImportSubjects}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => subjectsFileRef.current?.click()}
                        className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1"
                      >
                        <Upload className="w-3.5 h-3.5 text-teal-600" />
                        <span>{t('Importer des matières')}</span>
                      </button>
                      {importMsg && (
                        <p
                          className={`text-[11px] font-medium ${
                            importMsg.type === 'ok'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {importMsg.text}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {t('Formats acceptés :')}{' '}<strong>{t('CSV/TXT')}</strong> {t('(une matière par ligne :')}{' '}
                        <code className="font-mono">{t('Nom;CODE;#couleur')}</code>{t(', code et couleur optionnels ; une ligne décalée par des espaces ou une tabulation devient un dossier de la matière au-dessus, un second décalage un sous-dossier) ou')}{' '}
                        <strong>{t('JSON')}</strong>{' '}{t('(liste de matières, ou un fichier de sauvegarde {app}).', { app: APP_NAME })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pt-1">{t('Exemple de fichier .txt :')}</p>
                      <pre className="text-[11px] leading-relaxed font-mono p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 overflow-x-auto">{`Cardiologie;CARDIO;#e11d48
      Rythmologie
        ECG
        Fibrillation atriale
      Insuffisance cardiaque
    ICM;ICM;#2563eb
      Intro Médicaments
        Pharmacocinétique
    Pneumologie`}</pre>
                    </div>
                  </div>
  );
};

/** Suppression d'une discipline qui a des cours : les rattacher ailleurs ou les supprimer. */
export const SubjectDeleteDialog: React.FC<{
  draft: SubjectsDraft;
  courses: Course[];
  onSaveSubjects: (newSubjects: Subject[]) => void;
  onResolveSubjectCourses?: (
    subjectId: string,
    resolution: { kind: 'reassign'; toSubjectId: string } | { kind: 'delete' }
  ) => void;
}> = ({ draft, courses, onSaveSubjects, onResolveSubjectCourses }) => {
  const { localSubjects, setLocalSubjects, subjectToDelete, setSubjectToDelete, deleteMode, setDeleteMode, reassignToId, setReassignToId } = draft;

  if (!subjectToDelete) return null;
  const confirmDeleteSubject = () => {
    if (!subjectToDelete) return;
    onResolveSubjectCourses?.(
      subjectToDelete.id,
      deleteMode === 'reassign' ? { kind: 'reassign', toSubjectId: reassignToId } : { kind: 'delete' }
    );
    const updated = localSubjects.filter((s) => s.id !== subjectToDelete.id);
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setSubjectToDelete(null);
  };

  const count = courses.filter((c) => c.subjectId === subjectToDelete.id).length;
  const others = localSubjects.filter((s) => s.id !== subjectToDelete.id);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('Supprimer « {name} » ?', { name: subjectToDelete.name })}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {plural(count, '{n} cours est rattaché à cette discipline. Que doit-il devenir ?', '{n} cours sont rattachés à cette discipline. Que doivent-ils devenir ?')}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <label
            className={`flex items-start gap-2 p-3 rounded-xl border ${
              others.length === 0
                ? 'opacity-50 border-slate-200 dark:border-slate-700'
                : deleteMode === 'reassign'
                ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="delete-subject-mode"
              checked={deleteMode === 'reassign'}
              disabled={others.length === 0}
              onChange={() => setDeleteMode('reassign')}
              className="mt-0.5"
            />
            <span className="flex-1 space-y-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-100 block">
                {t('Les rattacher à une autre discipline')}
              </span>
              <select
                aria-label={t('Discipline de remplacement')}
                value={reassignToId}
                disabled={deleteMode !== 'reassign'}
                onChange={(e) => setReassignToId(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label
            className={`flex items-start gap-2 p-3 rounded-xl border ${
              deleteMode === 'delete'
                ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="delete-subject-mode"
              checked={deleteMode === 'delete'}
              onChange={() => setDeleteMode('delete')}
              className="mt-0.5"
            />
            <span>
              <span className="font-bold text-rose-700 dark:text-rose-400 block">
                {t('Supprimer aussi les {n} cours', { n: count })}
              </span>
              <span className="text-slate-600 dark:text-slate-400">
                {t('avec toutes leurs révisions. Irréversible.')}
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setSubjectToDelete(null)}
            className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            {t('Annuler')}
          </button>
          <button
            type="button"
            onClick={confirmDeleteSubject}
            disabled={deleteMode === 'reassign' && !reassignToId}
            className={`px-3 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 ${
              deleteMode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {deleteMode === 'delete' ? t('Supprimer la discipline et {n} cours', { n: count }) : t('Rattacher et supprimer la discipline')}
          </button>
        </div>
      </div>
    </div>
  );

};
