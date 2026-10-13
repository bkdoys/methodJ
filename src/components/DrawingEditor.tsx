import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eraser, Pencil, Redo2, Undo2, X } from 'lucide-react';
import { useMediaUrl } from '../hooks/useMediaUrl';
import {
  acceptsPointer,
  addPoint,
  canvasSize,
  COLORS,
  commitStroke,
  drawLastSegment,
  drawStroke,
  drawStrokeEnd,
  emptyHistory,
  ERASER_FACTOR,
  PEN_WIDTHS,
  redoStroke,
  scaledWidth,
  Stroke,
  undoStroke,
} from '../utils/drawing';
import { useConfirm } from './ConfirmDialog';
import { t } from '../i18n';

interface DrawingEditorProps {
  /** Image à annoter (id de média) ; absent = page blanche. */
  background?: string;
  /** Dessin terminé : image PNG à plat (la compression et l'enregistrement sont faits par l'appelant). */
  onDone: (png: Blob) => void;
  onClose: () => void;
}

const TOOL = 'p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed';
const TOOL_OFF = 'text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700';
const TOOL_ON = 'text-white border-teal-600 bg-teal-600';

/**
 * Dessin à main levée (doigt, Pencil, souris) sur une page blanche, ou par-dessus une image pour l'annoter. Deux
 * calques : le fond (blanc ou image) et les traits ; la gomme n'efface que les traits. Rendu final : un PNG à plat.
 */
export const DrawingEditor: React.FC<DrawingEditorProps> = ({ background, onDone, onClose }) => {
  const confirm = useConfirm();
  const media = useMediaUrl(background);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [bgFailed, setBgFailed] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [history, setHistory] = useState(emptyHistory);
  // Page blanche orientée comme l'écran à l'ouverture (iPad en portrait : page en hauteur)
  const [portrait] = useState(() => window.innerHeight > window.innerWidth);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Stroke | null>(null);
  // Pointeur qui trace en ce moment, et stylet vu pendant cette ouverture (rejet de la paume)
  const livePointer = useRef<number | null>(null);
  const penSeen = useRef(false);

  // L'image de fond est chargée avant d'afficher le canvas (sa taille donne celle du dessin)
  useEffect(() => {
    if (!background) return;
    if (media.status === 'missing') setBgFailed(true);
    if (media.status !== 'ready') return;
    const img = new Image();
    img.onload = () => setBg(img);
    img.onerror = () => setBgFailed(true);
    img.src = media.url;
  }, [background, media]);

  const ready = !background || !!bg;
  const size = canvasSize(bg ? { width: bg.naturalWidth, height: bg.naturalHeight } : undefined, portrait);

  const compose = useCallback(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !layer || !ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
  }, [bg]);

  // Calque des traits : recréé à la taille du canvas, puis rejoué à chaque changement de l'historique
  useEffect(() => {
    if (!ready) return;
    const layer = layerRef.current ?? document.createElement('canvas');
    layerRef.current = layer;
    layer.width = size.width;
    layer.height = size.height;
    const ctx = layer.getContext('2d')!;
    history.strokes.forEach((s) => drawStroke(ctx, s));
    compose();
    // la taille ne change qu'avec le fond, déjà couvert par `ready` et `compose`
  }, [ready, history, compose]);

  const toCanvas = (e: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !layerRef.current) return;
    e.preventDefault();
    if (e.pointerType === 'pen') penSeen.current = true;
    if (!acceptsPointer(e.pointerType, penSeen.current)) return;
    if (live.current) {
      // Un deuxième doigt est ignoré ; le stylet reprend la main et efface le trait de paume déjà commencé
      if (e.pointerType !== 'pen') return;
      live.current = null;
      setHistory((h) => ({ ...h }));
    }
    livePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà terminé : on trace quand même
    }
    const base = PEN_WIDTHS[widthIdx] * (tool === 'eraser' ? ERASER_FACTOR : 1);
    const [x, y] = toCanvas(e);
    const stroke: Stroke = { tool, color, width: scaledWidth(base, Math.max(size.width, size.height)), points: [[x, y]] };
    live.current = stroke;
    drawLastSegment(layerRef.current.getContext('2d')!, stroke);
    compose();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = live.current;
    if (!stroke || !layerRef.current || e.pointerId !== livePointer.current) return;
    const [x, y] = toCanvas(e);
    const points = addPoint(stroke.points, x, y);
    if (points === stroke.points) return;
    stroke.points = points;
    drawLastSegment(layerRef.current.getContext('2d')!, stroke);
    compose();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== livePointer.current) return;
    const stroke = live.current;
    live.current = null;
    livePointer.current = null;
    if (!stroke || !layerRef.current) return;
    drawStrokeEnd(layerRef.current.getContext('2d')!, stroke);
    compose();
    setHistory((h) => commitStroke(h, stroke));
  };

  const undo = () => setHistory(undoStroke);
  const redo = () => setHistory(redoStroke);
  const dirty = history.strokes.length > 0;

  const done = () => {
    if (!dirty) return;
    canvasRef.current?.toBlob((blob) => blob && onDone(blob), 'image/png');
  };

  const close = useCallback(async () => {
    if (
      dirty &&
      !(await confirm({
        title: t('Abandonner ce dessin ?'),
        message: t('Les traits non enregistrés seront perdus.'),
        confirmLabel: t('Abandonner'),
        tone: 'danger',
      }))
    )
      return;
    onClose();
  }, [dirty, confirm, onClose]);

  // Cmd/Ctrl + Z, + Maj + Z ; Échap ferme (le formulaire de la carte derrière ne les reçoit pas)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        setHistory((h) => (e.shiftKey ? redoStroke(h) : undoStroke(h)));
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        setHistory(redoStroke);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 dark:bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t('Dessin')}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-[1700px] max-h-full flex flex-col overflow-hidden">
        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            aria-label={t('Stylo')}
            title={t('Stylo')}
            aria-pressed={tool === 'pen'}
            onClick={() => setTool('pen')}
            className={`${TOOL} ${tool === 'pen' ? TOOL_ON : TOOL_OFF}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={t('Gomme')}
            title={t('Gomme')}
            aria-pressed={tool === 'eraser'}
            onClick={() => setTool('eraser')}
            className={`${TOOL} ${tool === 'eraser' ? TOOL_ON : TOOL_OFF}`}
          >
            <Eraser className="w-4 h-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <div className="flex items-center gap-1.5" role="group" aria-label={t('Couleur')}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c && tool === 'pen'}
                onClick={() => {
                  setColor(c);
                  setTool('pen');
                }}
                className={`w-7 h-7 rounded-full border-2 ${
                  color === c && tool === 'pen' ? 'border-teal-500 ring-2 ring-teal-300 dark:ring-teal-500/50' : 'border-white dark:border-slate-700'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <div className="flex items-center gap-1" role="group" aria-label={t('Épaisseur')}>
            {PEN_WIDTHS.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-label={t('Épaisseur {n}', { n: i + 1 })}
                aria-pressed={widthIdx === i}
                onClick={() => setWidthIdx(i)}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center ${widthIdx === i ? TOOL_ON : TOOL_OFF}`}
              >
                <span className="rounded-full bg-current" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
              </button>
            ))}
          </div>

          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <button type="button" aria-label={t('Annuler le dernier trait')} title={t('Annuler le dernier trait')} disabled={history.strokes.length === 0} onClick={undo} className={`${TOOL} ${TOOL_OFF}`}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" aria-label={t('Rétablir')} title={t('Rétablir')} disabled={history.undone.length === 0} onClick={redo} className={`${TOOL} ${TOOL_OFF}`}>
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={t('Fermer')}
              onClick={close}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={done}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              {t('Utiliser ce dessin')}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-3 flex items-center justify-center bg-slate-100 dark:bg-slate-950">
          {!ready ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-16">
              {bgFailed ? t('Image pas encore disponible sur cet appareil') : t('Chargement de l\'image…')}
            </p>
          ) : (
            <canvas
              ref={canvasRef}
              width={size.width}
              height={size.height}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="block bg-white rounded-lg shadow-sm cursor-crosshair select-none"
              // Remplit la place disponible en gardant les proportions : toute la largeur, sans dépasser la hauteur de l'écran
              style={{ touchAction: 'none', width: `min(100%, calc((100dvh - 7.5rem) * ${size.width / size.height}))`, height: 'auto' }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
