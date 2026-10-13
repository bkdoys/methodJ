import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, PenLine, Trash2 } from 'lucide-react';
import { compressImage } from '../utils/imageCompress';
import { addMedia } from '../utils/media';
import { CardImage } from './CardImage';
import { DrawingEditor } from './DrawingEditor';
import { t } from '../i18n';

/** Compresse puis enregistre une image ; renvoie son id de média, ou null (message dans `onError`). */
export async function storeImageFile(file: File | Blob, onError: (msg: string) => void): Promise<string | null> {
  if (file.type && !file.type.startsWith('image/')) {
    onError(t('Ce fichier n\'est pas une image.'));
    return null;
  }
  try {
    const { blob } = await compressImage(file);
    return await addMedia(blob);
  } catch (err) {
    console.warn('Image error:', err);
    onError(t('Impossible de lire cette image (format non pris en charge ?).'));
    return null;
  }
}

interface ImagePickerFieldProps {
  value?: string;
  onChange: (id: string | undefined) => void;
  /** Libellé lu par les lecteurs d'écran (« Image du recto »…). */
  label: string;
  /** Aperçu (absent : l'appelant montre l'image lui-même, ex. éditeur de masques). */
  preview?: boolean;
  /** Propose d'annoter l'image actuelle. */
  annotate?: boolean;
  /**
   * Appelé à la place de `onChange` quand l'image annotée remplace l'actuelle : mêmes proportions, donc l'appelant
   * peut garder ce qui s'y rapporte (les masques d'une carte à masques).
   */
  onAnnotated?: (id: string) => void;
  /** Avec une image, « Dessiner » (page blanche) est grisé : on l'annote au lieu de la remplacer. */
  lockDrawWhenImage?: boolean;
}

// « Photo » seulement sur un écran tactile (sur ordinateur, les deux boutons ouvriraient le même sélecteur)
const hasCamera = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const BTN =
  'inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50';

/**
 * Ajout d'une image à une carte : « Photo » ouvre directement l'appareil photo (iPad, téléphone), « Importer »
 * un fichier ou la photothèque. L'image est compressée avant d'être enregistrée.
 */
export const ImagePickerField: React.FC<ImagePickerFieldProps> = ({ value, onChange, label, preview = true, annotate = true, onAnnotated, lockDrawWhenImage = false }) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Éditeur de dessin ouvert : page blanche, ou par-dessus l'image actuelle (`background`)
  const [drawing, setDrawing] = useState<{ background?: string } | null>(null);

  const onDrawn = async (png: Blob) => {
    const annotating = !!drawing?.background;
    setDrawing(null);
    setBusy(true);
    setError(null);
    const id = await storeImageFile(png, setError);
    setBusy(false);
    if (id) (annotating && onAnnotated ? onAnnotated : onChange)(id);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reprendre la même photo doit redéclencher le changement
    if (!file) return;
    setBusy(true);
    setError(null);
    const id = await storeImageFile(file, setError);
    setBusy(false);
    if (id) onChange(id);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={label}>
        {hasCamera && (
          <button type="button" className={BTN} disabled={busy} onClick={() => cameraRef.current?.click()}>
            <Camera className="w-3.5 h-3.5" />
            {t('Photo')}
          </button>
        )}
        <button type="button" className={BTN} disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="w-3.5 h-3.5" />
          {value ? t('Changer l\'image') : t('Image')}
        </button>
        <button
          type="button"
          className={`${BTN} disabled:cursor-not-allowed`}
          disabled={busy || (lockDrawWhenImage && !!value)}
          title={lockDrawWhenImage && value ? t('Une image est déjà chargée : utilisez « Annoter », ou retirez-la pour dessiner sur une page blanche.') : undefined}
          onClick={() => setDrawing({})}
        >
          <PenLine className="w-3.5 h-3.5" />
          {t('Dessiner')}
        </button>
        {value && annotate && (
          <button type="button" className={BTN} disabled={busy} onClick={() => setDrawing({ background: value })}>
            <PenLine className="w-3.5 h-3.5" />
            {t('Annoter')}
          </button>
        )}
        {value && !busy && (
          <button
            type="button"
            className={`${BTN} hover:text-rose-600`}
            onClick={() => onChange(undefined)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('Retirer l\'image')}
          </button>
        )}
        {busy && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('Compression…')}
          </span>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
      {error && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      {preview && value && <CardImage id={value} maxHeight="max-h-40" />}
      {drawing && <DrawingEditor background={drawing.background} onDone={onDrawn} onClose={() => setDrawing(null)} />}
    </div>
  );
};
