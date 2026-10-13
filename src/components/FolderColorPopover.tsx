import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Wand2 } from 'lucide-react';
import { PRESET_COURSE_COLORS } from '../utils/colorUtils';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { plural, t } from '../i18n';

interface FolderColorPopoverProps {
  /** Le bouton qui a ouvert la palette : elle se place contre lui. */
  anchor: HTMLElement;
  folderName: string;
  /** Couleur choisie pour ce dossier ; absent = nuance automatique. */
  chosen: string | undefined;
  /** Couleur affichée aujourd'hui (choisie ou automatique). */
  current: string;
  /** `undefined` : retour à la nuance automatique. */
  onPick: (color: string | undefined) => void;
  onClose: () => void;
  /** Nombre de sous-dossiers directs : > 0 propose de leur appliquer la couleur de ce dossier. */
  childFolderCount: number;
  onApplyToChildren: () => void;
  /** Cours du dossier qui ont leur propre couleur (elle l'emporte sur celle du dossier). */
  personalColorCount: number;
  /** Retire cette couleur personnelle : tous les cours du dossier reprennent celle du dossier. */
  onUseFolderColor: () => void;
}

const WIDTH = 188;
const GAP = 6;

/** Palette d'un dossier : couleurs prédéfinies, couleur libre, ou « Automatique » (nuance de la discipline). */
export const FolderColorPopover: React.FC<FolderColorPopoverProps> = ({ anchor, folderName, chosen, current, onPick, onClose, childFolderCount, onApplyToChildren, personalColorCount, onUseFolderColor }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Placée contre le bouton, ramenée dans l'écran ; au-dessus du bouton s'il n'y a pas de place dessous
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 220;
      const left = Math.min(Math.max(8, a.right - WIDTH), window.innerWidth - WIDTH - 8);
      const below = a.bottom + GAP;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, a.top - GAP - h) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useOutsideClick(true, (target) => !!ref.current?.contains(target) || anchor.contains(target), onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [anchor, onClose]);

  const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('Couleur du dossier « {name} »', { name: folderName })}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
      className="z-[90] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 space-y-2.5"
    >
      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{folderName}</p>
      <div className="grid grid-cols-8 gap-1">
        {PRESET_COURSE_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={same(chosen, c.hex)}
            onClick={() => {
              onPick(c.hex);
              onClose();
            }}
            className="w-4 h-4 rounded-full flex items-center justify-center ring-offset-1 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{ backgroundColor: c.hex }}
          >
            {same(chosen, c.hex) && <Check className="w-2.5 h-2.5 text-white" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="color"
            value={current}
            aria-label={t('Autre couleur')}
            // Le sélecteur système envoie sa valeur à chaque déplacement : on l'enregistre sans refermer la palette
            onChange={(e) => onPick(e.target.value)}
            className="w-6 h-6 rounded border-0 cursor-pointer p-0 bg-transparent"
          />
          <span>{t('Autre')}</span>
        </label>
        <button
          type="button"
          disabled={!chosen}
          onClick={() => {
            onPick(undefined);
            onClose();
          }}
          title={t('Nuance automatique de la couleur de la discipline')}
          className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Wand2 className="w-3 h-3" />
          {t('Automatique')}
        </button>
      </div>
      {childFolderCount > 0 && (
        <button
          type="button"
          onClick={() => {
            onApplyToChildren();
            onClose();
          }}
          className="w-full px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {plural(childFolderCount, 'Même couleur pour le sous-dossier', 'Même couleur pour les {n} sous-dossiers')}
        </button>
      )}
      {personalColorCount > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {plural(
              personalColorCount,
              '{n} cours de ce dossier a sa propre couleur : elle remplace celle du dossier.',
              '{n} cours de ce dossier ont leur propre couleur : elle remplace celle du dossier.'
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              onUseFolderColor();
              onClose();
            }}
            className="w-full px-2 py-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/50"
          >
            {t('Utiliser la couleur du dossier pour tous')}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};
