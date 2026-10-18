import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Loader2, Maximize2, X } from 'lucide-react';
import { OcclusionMask, OcclusionMode } from '../types';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { normalizeMasks } from '../utils/occlusion';
import { MaskCanvas, MaskLabel, MaskShape } from './MaskShape';
import { t } from '../i18n';

/** Place réservée pendant le chargement, ou quand l'image n'est pas encore arrivée d'un autre appareil. */
const Placeholder: React.FC<{ missing: boolean; className?: string }> = ({ missing, className = '' }) => (
  <div
    className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 min-h-24 px-3 ${className}`}
  >
    {missing ? <ImageOff className="w-4 h-4 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
    {missing ? t('Image pas encore disponible sur cet appareil') : t('Chargement de l\'image…')}
  </div>
);

export interface MaskView {
  masks: OcclusionMask[];
  mode: OcclusionMode;
  /** Groupe deviné (lecteur) ; absent = aperçu de l'éditeur, tous les masques en contour numéroté. */
  activeGroup?: number;
  revealed?: boolean;
}

/** Masques posés sur l'image (en % de sa taille). */
const MaskLayer: React.FC<MaskView> = ({ masks, mode, activeGroup, revealed }) => {
  const list = normalizeMasks(masks);
  return (
    <div className="absolute inset-0 pointer-events-none">
      <MaskCanvas>
        {list.map((m) => {
          if (activeGroup === undefined) return <MaskShape key={m.id} mask={m} className="fill-teal-500/20 stroke-teal-500" />;
          if (m.group === activeGroup) {
            return revealed ? (
              <MaskShape key={m.id} mask={m} strokeWidth={3} className="fill-transparent stroke-rose-500" />
            ) : (
              <MaskShape key={m.id} mask={m} className="fill-rose-500 stroke-rose-700" />
            );
          }
          if (mode === 'hide-one') return null;
          return <MaskShape key={m.id} mask={m} strokeWidth={1} className="fill-slate-400 dark:fill-slate-500 stroke-slate-500" />;
        })}
      </MaskCanvas>
      {list.map((m) => {
        if (activeGroup === undefined) {
          return (
            <MaskLabel key={m.id} mask={m} className="text-[0.625rem] font-bold text-white bg-teal-600 rounded px-1">
              {m.group}
            </MaskLabel>
          );
        }
        if (m.group === activeGroup && !revealed) {
          return (
            <MaskLabel key={m.id} mask={m} className="text-white font-bold text-sm">
              ?
            </MaskLabel>
          );
        }
        return null;
      })}
    </div>
  );
};

interface CardImageProps {
  id: string;
  /** Masques à poser (carte `occlusion`). */
  occlusion?: MaskView;
  /** Hauteur maximale de l'image (classe Tailwind). */
  maxHeight?: string;
  /** Bouton d'agrandissement en plein écran. */
  zoomable?: boolean;
  className?: string;
}

/** Image d'une carte (et ses masques), avec agrandissement en plein écran. */
export const CardImage: React.FC<CardImageProps> = ({ id, occlusion, maxHeight = 'max-h-[50vh]', zoomable = false, className = '' }) => {
  const media = useMediaUrl(id);
  const [zoom, setZoom] = useState(false);
  if (media.status !== 'ready') return <Placeholder missing={media.status === 'missing'} className={className} />;

  return (
    <div className={`relative inline-block max-w-full align-top ${className}`}>
      <img src={media.url} alt="" draggable={false} className={`block max-w-full w-auto h-auto ${maxHeight} rounded-lg select-none`} />
      {occlusion && <MaskLayer {...occlusion} />}
      {zoomable && (
        <button
          type="button"
          aria-label={t('Agrandir l\'image')}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(true);
          }}
          className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-slate-900/60 text-white hover:bg-slate-900/80"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
      {zoom && <ImageZoom url={media.url} occlusion={occlusion} onClose={() => setZoom(false)} />}
    </div>
  );
};

/** Plein écran : l'image ajustée à l'écran, un toucher passe à la taille réelle (défilement pour se déplacer). */
const ImageZoom: React.FC<{ url: string; occlusion?: MaskView; onClose: () => void }> = ({ url, occlusion, onClose }) => {
  const [actual, setActual] = useState(false);
  // Les touches ne vont pas au lecteur derrière (Échap fermerait la séance, Espace afficherait la réponse)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/90 overflow-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={t('Fermer')}
        onClick={onClose}
        autoFocus
        className="fixed top-3 right-3 z-10 p-2 rounded-lg bg-white/15 text-white hover:bg-white/25"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <X className="w-5 h-5" />
      </button>
      <div className={`min-h-full flex p-4 ${actual ? '' : 'items-center justify-center'}`}>
        <div className={`relative ${actual ? '' : 'max-w-full'} cursor-zoom-in`} onClick={() => setActual((a) => !a)}>
          <img
            src={url}
            alt=""
            draggable={false}
            className={actual ? 'block max-w-none' : 'block max-w-full max-h-[calc(100dvh-2rem)] w-auto h-auto'}
          />
          {occlusion && <MaskLayer {...occlusion} />}
        </div>
      </div>
    </div>,
    document.body
  );
};
