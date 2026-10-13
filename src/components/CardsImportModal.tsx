import React, { useMemo, useState } from 'react';
import { FileUp, Upload, X } from 'lucide-react';
import { Course, Deck, Subject } from '../types';
import { CardInput } from '../utils/flashcards';
import {
  ColumnMapping,
  decodeFile,
  guessMapping,
  ParsedTable,
  parseDelimited,
  planCardsImport,
  RejectReason,
} from '../utils/cardsImport';
import { plural, t } from '../i18n';

interface CardsImportModalProps {
  courses: Course[];
  subjects: Subject[];
  decks: Record<string, Deck>;
  /** Cours proposé par défaut (import lancé depuis les cartes d'un cours). */
  defaultCourseId?: string;
  onImport: (byCourse: Record<string, CardInput[]>) => void;
  onClose: () => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REJECTS_VISIBLE = 8;

const SELECT =
  'w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white';

function rejectText(reason: RejectReason, course?: string): string {
  switch (reason) {
    case 'empty':
      return t('recto vide');
    case 'no-back':
      return t('verso vide');
    case 'unknown-course':
      return t('cours « {course} » introuvable', { course: course ?? '' });
    case 'no-course':
      return t('aucun cours de destination');
    case 'full':
      return t('cours plein');
  }
}

/** Import de cartes depuis un CSV / TSV (export Anki « Notes en texte brut » ou tableur), avec aperçu avant ajout. */
export const CardsImportModal: React.FC<CardsImportModalProps> = ({
  courses,
  subjects,
  decks,
  defaultCourseId,
  onImport,
  onClose,
}) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [courseId, setCourseId] = useState(defaultCourseId ?? '');

  const table: ParsedTable | null = useMemo(() => (text.trim() ? parseDelimited(text) : null), [text]);
  const columns = useMemo(() => Math.max(0, ...(table?.rows.slice(0, 50).map((r) => r.length) ?? [0])), [table]);
  // Colonnes devinées à chaque nouveau texte, modifiables ensuite
  const effective = mapping ?? (table ? guessMapping(table) : null);
  const plan = useMemo(
    () => (table && effective ? planCardsImport(table, effective, { courses, decks, defaultCourseId: courseId || undefined }) : null),
    [table, effective, courses, decks, courseId]
  );

  const loadText = (value: string) => {
    setText(value);
    setMapping(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('Fichier trop volumineux (10 Mo au plus).'));
      return;
    }
    setFileName(file.name);
    loadText(decodeFile(await file.arrayBuffer()));
  };

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.name.localeCompare(b.name)), [subjects]);
  const firstRow = table?.rows[0] ?? [];
  const colLabel = (i: number) => {
    const sample = (firstRow[i] ?? '').replace(/\s+/g, ' ').trim();
    const short = sample.length > 28 ? `${sample.slice(0, 28)}…` : sample;
    return short ? t('Colonne {n} · {sample}', { n: i + 1, sample: short }) : t('Colonne {n}', { n: i + 1 });
  };
  const setCol = (key: 'front' | 'back' | 'course', value: number) => effective && setMapping({ ...effective, [key]: value });
  const courseCount = plan ? Object.keys(plan.byCourse).length : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl my-6 overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)]">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <FileUp className="w-5 h-5 text-teal-600 shrink-0" />
          <h2 className="flex-1 text-sm font-bold text-slate-900 dark:text-white">{t('Importer des cartes')}</h2>
          <button
            type="button"
            aria-label={t('Fermer')}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('Une ligne par carte : recto, verso, et en option le cours (code ou titre). Depuis Anki : Fichier › Exporter › « Notes en texte brut ». Depuis un tableur : enregistrer en CSV. Le texte à trous {{c1::…}} est reconnu.')}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              {t('Choisir un fichier')}
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                className="sr-only"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {fileName && <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[16rem]">{fileName}</span>}
          </div>
          {fileError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{fileError}</p>}

          <textarea
            value={text}
            onChange={(e) => {
              setFileName(null);
              loadText(e.target.value);
            }}
            rows={4}
            placeholder={t('… ou collez le contenu ici')}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white resize-y"
          />

          {table && effective && table.rows.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('Recto')}</span>
                  <select value={effective.front} onChange={(e) => setCol('front', Number(e.target.value))} className={SELECT}>
                    {Array.from({ length: columns }, (_, i) => (
                      <option key={i} value={i}>{colLabel(i)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('Verso')}</span>
                  <select value={effective.back} onChange={(e) => setCol('back', Number(e.target.value))} className={SELECT}>
                    <option value={-1}>{t('Aucune')}</option>
                    {Array.from({ length: columns }, (_, i) => (
                      <option key={i} value={i}>{colLabel(i)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('Cours')}</span>
                  <select value={effective.course} onChange={(e) => setCol('course', Number(e.target.value))} className={SELECT}>
                    <option value={-1}>{t('Aucune (cours choisi ci-dessous)')}</option>
                    {Array.from({ length: columns }, (_, i) => (
                      <option key={i} value={i}>{colLabel(i)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={effective.hasHeader}
                  onChange={(e) => setMapping({ ...effective, hasHeader: e.target.checked })}
                  className="rounded"
                />
                {t('La première ligne contient les titres des colonnes')}
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {effective.course >= 0 ? t('Cours pour les lignes sans cours') : t('Cours de destination')}
                </span>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={SELECT}>
                  <option value="">{t('— Choisir un cours —')}</option>
                  {sortedSubjects.map((s) => {
                    const list = courses.filter((c) => c.subjectId === s.id).sort((a, b) => a.title.localeCompare(b.title));
                    return list.length > 0 ? (
                      <optgroup key={s.id} label={s.name}>
                        {list.map((c) => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
            </>
          )}

          {plan && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">
                {plural(plan.added, '{n} carte à ajouter', '{n} cartes à ajouter')}
                {courseCount > 1 && <span className="font-normal"> · {t('dans {n} cours', { n: courseCount })}</span>}
              </p>
              {plan.duplicates > 0 && (
                <p className="text-slate-600 dark:text-slate-400">
                  {plural(plan.duplicates, '{n} doublon ignoré', '{n} doublons ignorés')}
                </p>
              )}
              {plan.rejected.length > 0 && (
                <div className="text-amber-800 dark:text-amber-300 space-y-0.5">
                  <p className="font-semibold">{plural(plan.rejected.length, '{n} ligne écartée :', '{n} lignes écartées :')}</p>
                  <ul className="space-y-0.5">
                    {plan.rejected.slice(0, REJECTS_VISIBLE).map((r, i) => (
                      <li key={i}>{t('Ligne {line} : {reason}', { line: r.line, reason: rejectText(r.reason, r.course) })}</li>
                    ))}
                    {plan.rejected.length > REJECTS_VISIBLE && <li>…</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            {t('Annuler')}
          </button>
          <button
            type="button"
            disabled={!plan || plan.added === 0}
            onClick={() => plan && onImport(plan.byCourse)}
            className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {plan && plan.added > 0 ? plural(plan.added, 'Importer {n} carte', 'Importer {n} cartes') : t('Importer')}
          </button>
        </div>
      </div>
    </div>
  );
};
