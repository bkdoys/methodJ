import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArchiveRestore, Check, FolderTree, Loader2, X } from 'lucide-react';
import { Course, Deck, Subject } from '../types';
import { plural, t } from '../i18n';
import { getTodayIso } from '../utils/dateUtils';
import { applyApkgPlan, ApplyResult } from '../utils/apkg/apply';
import { planApkgImport } from '../utils/apkg/convert';
import { imagesOfPlan, storePackageImages } from '../utils/apkg/media';
import type { AnkiPackage } from '../utils/apkg/reader';
import { storeImageFile } from './ImagePickerField';

export interface ApkgImportInfo {
  /** Images du paquet qu'on n'a pas pu enregistrer (les cartes concernées restent, sans image). */
  failedImages: number;
}

interface ApkgImportModalProps {
  file: File;
  subjects: Subject[];
  courses: Course[];
  decks: Record<string, Deck>;
  onImport: (result: ApplyResult, info: ApkgImportInfo) => void;
  onClose: () => void;
}

/** Au-delà, la lecture en mémoire risque de dépasser ce qu'un navigateur (surtout sur iPad) accepte. */
const MAX_FILE_BYTES = 800 * 1024 * 1024;
// Identifiant de média factice : l'aperçu compte les cartes sans enregistrer d'images
const DRY_MEDIA_ID = '0'.repeat(64);

type Stage = 'reading' | 'preview' | 'importing' | 'error';

const CHECK =
  'rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4 shrink-0';

/**
 * Import d'un paquet Anki (.apkg) : lecture dans le navigateur, aperçu (cours à créer ou à réutiliser, cartes, ce qui
 * est laissé de côté), puis import avec les images. Rien n'est enregistré avant « Importer ».
 */
export const ApkgImportModal: React.FC<ApkgImportModalProps> = ({ file, subjects, courses, decks, onImport, onClose }) => {
  const [stage, setStage] = useState<Stage>('reading');
  const [error, setError] = useState('');
  const [pkg, setPkg] = useState<AnkiPackage | null>(null);
  const [keepProgress, setKeepProgress] = useState(true);
  const [recreateTree, setRecreateTree] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelled = useRef(false);
  const pkgRef = useRef<AnkiPackage | null>(null);

  // Lecture du fichier : les bibliothèques (décompression, SQLite) ne sont chargées qu'ici
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error(t('Ce paquet est trop volumineux (800 Mo au plus).'));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const [{ readApkg, ApkgError }, { loadSqlJs }] = await Promise.all([import('../utils/apkg/reader'), import('../utils/apkg/loadSqlJs')]);
        try {
          const opened = await readApkg(bytes, loadSqlJs);
          if (!alive) {
            opened.close();
            return;
          }
          pkgRef.current = opened;
          setPkg(opened);
          setStage('preview');
        } catch (err) {
          if (err instanceof ApkgError) {
            throw new Error(
              err.code === 'not-zip'
                ? t('Ce fichier n\'est pas un paquet Anki (archive illisible).')
                : err.code === 'no-collection'
                  ? t('Aucune collection Anki dans ce fichier.')
                  : t('La collection du paquet est illisible (fichier endommagé ?).')
            );
          }
          throw err;
        }
      } catch (err) {
        if (!alive) return;
        console.warn('Apkg read error:', err);
        setError(err instanceof Error ? err.message : t('Lecture impossible.'));
        setStage('error');
      }
    })();
    return () => {
      alive = false;
      cancelled.current = true;
      pkgRef.current?.close();
      pkgRef.current = null;
    };
  }, [file]);

  const plan = useMemo(
    () => (pkg ? planApkgImport(pkg, { keepProgress, recreateTree, fallbackSubject: t('Import Anki'), now: new Date() }) : null),
    [pkg, keepProgress, recreateTree]
  );

  // Tout est coché au départ ; une bascule d'option ne change pas les clés des paquets
  useEffect(() => {
    if (plan) setSelected((prev) => (prev.size === 0 ? new Set(plan.courses.map((c) => c.key)) : prev));
  }, [plan]);

  // Simulation pour l'aperçu : quels cours sont créés ou réutilisés, combien de cartes, quels doublons
  const preview = useMemo(() => {
    if (!plan || !pkg) return null;
    const mediaIds = new Map(pkg.mediaNames.map((n) => [n, DRY_MEDIA_ID]));
    return applyApkgPlan(plan, { subjects, courses, decks, todayIso: getTodayIso(), nowIso: new Date().toISOString(), mediaIds, selected });
  }, [plan, pkg, subjects, courses, decks, selected]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async () => {
    if (!plan || !pkg) return;
    cancelled.current = false;
    setStage('importing');
    const names = imagesOfPlan(plan, selected);
    setProgress({ done: 0, total: names.length });
    const stored = await storePackageImages(
      names,
      (n) => pkg.readMedia(n),
      (blob) => storeImageFile(blob, () => undefined),
      { onProgress: (done, total) => setProgress({ done, total }), isCancelled: () => cancelled.current }
    );
    if (stored.cancelled) {
      setStage('preview');
      return;
    }
    // Les données ont pu changer pendant l'enregistrement des images : on applique sur les plus récentes
    const result = applyApkgPlan(plan, {
      subjects,
      courses,
      decks,
      todayIso: getTodayIso(),
      nowIso: new Date().toISOString(),
      mediaIds: stored.ids,
      selected,
    });
    onImport(result, { failedImages: stored.failed.length });
  };

  const stats = plan?.stats;
  const chosenCards = preview?.totals.cards ?? 0;
  const notes: string[] = [];
  if (stats) {
    if (stats.suspended > 0) notes.push(plural(stats.suspended, '{n} note suspendue dans Anki, laissée de côté', '{n} notes suspendues dans Anki, laissées de côté'));
    if (stats.skipped > 0) notes.push(plural(stats.skipped, '{n} note inutilisable (vide, sans verso ou sans trou), laissée de côté', '{n} notes inutilisables (vides, sans verso ou sans trou), laissées de côté'));
    if (stats.missingImages > 0) notes.push(plural(stats.missingImages, '{n} image citée mais absente du paquet', '{n} images citées mais absentes du paquet'));
    if (stats.droppedImages > 0) notes.push(plural(stats.droppedImages, '{n} image en plus (une seule par face est gardée)', '{n} images en plus (une seule par face est gardée)'));
    if (stats.ignoredShapes > 0) notes.push(plural(stats.ignoredShapes, '{n} forme d\'occlusion non reprise (texte ou forme illisible)', '{n} formes d\'occlusion non reprises (texte ou forme illisible)'));
    if (stats.sounds > 0) notes.push(plural(stats.sounds, '{n} son ignoré', '{n} sons ignorés'));
  }

  const rowOf = (key: string) => preview?.outcomes.find((o) => o.key === key);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Importer un paquet Anki')}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-6 overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)]"
      >
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <ArchiveRestore className="w-5 h-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('Importer un paquet Anki')}</h2>
            <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 truncate">{file.name}</p>
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

        {stage === 'reading' && (
          <div className="p-10 flex flex-col items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            {t('Lecture du paquet…')}
          </div>
        )}

        {stage === 'error' && (
          <div className="p-6 space-y-3">
            <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('Dans Anki : Fichier › Exporter › « Paquet Anki (*.apkg) », en cochant « Inclure les médias ».')}
            </p>
          </div>
        )}

        {(stage === 'preview' || stage === 'importing') && plan && stats && (
          <>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <p className="font-semibold">
                  {plural(stats.notes, '{n} note', '{n} notes')} → {plural(stats.cards, '{n} carte', '{n} cartes')}
                  {stats.images > 0 && ` · ${plural(stats.images, '{n} image', '{n} images')}`}
                  {keepProgress && stats.withProgress > 0 && ` · ${t('avancement repris pour {n}', { n: stats.withProgress })}`}
                </p>
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {t('Chaque paquet devient un cours en révision libre, rangé comme dans Anki. Les cours et disciplines qui existent déjà sont réutilisés, les cartes déjà présentes ne sont pas dupliquées.')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className={`${CHECK} mt-0.5`} checked={keepProgress} onChange={(e) => setKeepProgress(e.target.checked)} />
                  <span>
                    <span className="font-semibold">{t('Reprendre l\'avancement d\'Anki')}</span>
                    <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">
                      {t('Intervalles et échéances converties en état FSRS (approché : les prochaines notes le recalent). Sinon, toutes les cartes sont nouvelles.')}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" className={`${CHECK} mt-0.5`} checked={recreateTree} onChange={(e) => setRecreateTree(e.target.checked)} />
                  <span>
                    <span className="font-semibold">{t('Recréer l\'arborescence des paquets')}</span>
                    <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">
                      {t('Paquet de premier niveau = discipline, sous-paquets = dossiers, dernier niveau = cours. Sinon, tout va dans une discipline « Import Anki ».')}
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FolderTree className="w-4 h-4 text-teal-600" />
                    {plural(plan.courses.length, '{n} paquet', '{n} paquets')}
                  </h3>
                  <span className="text-[0.6875rem] space-x-3">
                    <button type="button" className="font-semibold text-teal-700 dark:text-teal-400 hover:underline" onClick={() => setSelected(new Set(plan.courses.map((c) => c.key)))}>
                      {t('Tout cocher')}
                    </button>
                    <button type="button" className="font-semibold text-slate-500 hover:underline" onClick={() => setSelected(new Set())}>
                      {t('Tout décocher')}
                    </button>
                  </span>
                </div>
                <ul className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[38vh] overflow-y-auto">
                  {plan.courses.map((c) => {
                    const o = rowOf(c.key);
                    return (
                      <li key={c.key}>
                        <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <input type="checkbox" className={CHECK} checked={selected.has(c.key)} onChange={() => toggle(c.key)} disabled={stage === 'importing'} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 break-words">{c.title}</span>
                            <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400 break-words">
                              {[c.subjectName, ...c.folderNames].join(' › ')}
                            </span>
                          </span>
                          {o && (
                            <span
                              className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                o.created ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {o.created ? t('Nouveau') : t('Réutilisé')}
                            </span>
                          )}
                          <span className="text-[0.6875rem] font-mono text-slate-500 dark:text-slate-400 shrink-0 w-20 text-right">
                            {o ? (o.duplicates > 0 ? `+${o.added} / ${c.cards.length}` : `+${o.added}`) : c.cards.length}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {stats.images > 0 && preview && preview.outcomes.some((o) => !o.created) && (
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
                  {t('Les cartes avec image déjà présentes sont reconnues pendant l\'import.')}
                </p>
              )}

              {preview && preview.totals.full > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {plural(preview.totals.full, '{n} carte ne tient pas (1 000 cartes au plus par cours).', '{n} cartes ne tiennent pas (1 000 cartes au plus par cours).')}
                </p>
              )}

              {notes.length > 0 && (
                <ul className="text-[0.6875rem] text-slate-500 dark:text-slate-400 space-y-0.5 list-disc pl-4">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
              {stage === 'importing' ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-teal-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
                    </div>
                    <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 mt-1">
                      {progress.total > 0 ? t('Images : {done} / {total}', progress) : t('Enregistrement…')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cancelled.current = true;
                    }}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    {t('Annuler')}
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[0.6875rem] text-slate-500 dark:text-slate-400">
                    {preview && preview.totals.duplicates > 0 && plural(preview.totals.duplicates, '{n} carte déjà présente, ignorée', '{n} cartes déjà présentes, ignorées')}
                  </span>
                  <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                    {t('Annuler')}
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={selected.size === 0 || chosenCards === 0}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    {chosenCards > 0 ? t('Importer ({n})', { n: chosenCards }) : t('Importer')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
