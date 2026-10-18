import React, { useEffect, useRef, useState } from 'react';
import { Check, Circle, Group, MousePointer2, Pentagon, Square, SquareDashed, Trash2, Ungroup, X } from 'lucide-react';
import { OcclusionMask, OcclusionShape } from '../types';
import { useMediaUrl } from '../hooks/useMediaUrl';
import {
  Corner,
  groupMasks,
  hitMask,
  MAX_MASKS,
  maskGroups,
  MAX_POLYGON_POINTS,
  movePolygonPoint,
  moveMask,
  newMaskId,
  nextGroup,
  polygonFromPoints,
  rectFromPoints,
  resizeMask,
  ungroupMasks,
} from '../utils/occlusion';
import { MaskCanvas, MaskLabel, MaskShape } from './MaskShape';
import { plural, t } from '../i18n';

interface OcclusionEditorProps {
  imageId: string;
  masks: OcclusionMask[];
  onChange: (masks: OcclusionMask[]) => void;
}

type Drag =
  | { kind: 'draw'; x0: number; y0: number; x: number; y: number }
  | { kind: 'move'; id: string; x0: number; y0: number; orig: OcclusionMask; moved: boolean }
  | { kind: 'resize'; id: string; corner: Corner }
  | { kind: 'vertex'; id: string; index: number };

type Pt = { x: number; y: number };
/** Distance (en pixels) sous laquelle un toucher sur le premier point ferme le polygone. */
const CLOSE_DISTANCE = 16;

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const TOOL =
  'inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-semibold rounded-md border disabled:opacity-40 disabled:cursor-not-allowed';
const TOOL_OFF = 'text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800';
const TOOL_ON = 'text-white border-teal-600 bg-teal-600';

/**
 * Pose des masques sur une image, au doigt, au Pencil ou à la souris : glisser sur une zone libre trace un
 * rectangle ou une ellipse (une nouvelle sous-carte), ou on pose les sommets d'un polygone un à un ; toucher un masque le sélectionne, le glisser le déplace, ses coins le
 * redimensionnent. Plusieurs masques groupés = une seule sous-carte (ex. les deux reins).
 */
export const OcclusionEditor: React.FC<OcclusionEditorProps> = ({ imageId, masks, onChange }) => {
  const media = useMediaUrl(imageId);
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Sélection de plusieurs masques au toucher (Maj + clic à la souris)
  const [multi, setMulti] = useState(false);
  const [tool, setTool] = useState<OcclusionShape>('rect');
  // Polygone en cours de tracé et position du pointeur (pour le segment qui suit le doigt)
  const [poly, setPoly] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);

  const cancelPoly = () => {
    setPoly([]);
    setCursor(null);
  };
  const pickTool = (next: OcclusionShape) => {
    setTool(next);
    cancelPoly();
  };
  const finishPoly = (points: Pt[] = poly) => {
    const shape = polygonFromPoints(points);
    if (shape) {
      const mask: OcclusionMask = { id: newMaskId(), ...shape, group: nextGroup(masks) };
      onChange([...masks, mask]);
      setSelected(new Set([mask.id]));
    }
    cancelPoly();
  };

  // Entrée termine, Retour arrière retire le dernier point, Échap annule (sans fermer la fenêtre de la carte)
  const polyRef = useRef(poly);
  polyRef.current = poly;
  const finishRef = useRef(finishPoly);
  finishRef.current = finishPoly;
  useEffect(() => {
    if (poly.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        setPoly([]);
        setCursor(null);
      } else if (e.key === 'Enter') {
        finishRef.current(polyRef.current);
      } else if (e.key === 'Backspace') {
        setPoly((prev) => prev.slice(0, -1));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [poly.length === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    boxRef.current?.setPointerCapture(e.pointerId);
    const p = point(e);
    const corner = (e.target as HTMLElement).dataset.corner as Corner | undefined;
    const vertex = (e.target as HTMLElement).dataset.vertex;
    const cornerOf = (e.target as HTMLElement).dataset.mask;
    if (corner && cornerOf) {
      setDrag({ kind: 'resize', id: cornerOf, corner });
      return;
    }
    if (vertex !== undefined && cornerOf) {
      setDrag({ kind: 'vertex', id: cornerOf, index: Number(vertex) });
      return;
    }
    // Polygone en cours : chaque toucher pose un point, le premier (ou « Terminer ») ferme la forme
    if (poly.length > 0) {
      const box = boxRef.current!.getBoundingClientRect();
      const first = poly[0];
      const close = poly.length >= 3 && Math.hypot((p.x - first.x) * box.width, (p.y - first.y) * box.height) < CLOSE_DISTANCE;
      if (close) finishPoly();
      else if (poly.length < MAX_POLYGON_POINTS) setPoly([...poly, p]);
      return;
    }
    const hit = hitMask(masks, p.x, p.y);
    if (hit) {
      const adding = multi || e.shiftKey;
      setSelected((prev) => {
        if (!adding) return prev.has(hit.id) ? prev : new Set([hit.id]);
        const next = new Set(prev);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        return next;
      });
      if (!adding) setDrag({ kind: 'move', id: hit.id, x0: p.x, y0: p.y, orig: hit, moved: false });
      return;
    }
    setSelected(new Set());
    if (masks.length >= MAX_MASKS) return;
    if (tool === 'polygon') setPoly([p]);
    else setDrag({ kind: 'draw', x0: p.x, y0: p.y, x: p.x, y: p.y });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) {
      if (poly.length > 0) setCursor(point(e));
      return;
    }
    const p = point(e);
    if (drag.kind === 'vertex') onChange(masks.map((m) => (m.id === drag.id ? movePolygonPoint(m, drag.index, p.x, p.y) : m)));
    else if (drag.kind === 'draw') setDrag({ ...drag, x: p.x, y: p.y });
    else if (drag.kind === 'move') {
      const next = moveMask(drag.orig, p.x - drag.x0, p.y - drag.y0);
      onChange(masks.map((m) => (m.id === drag.id ? next : m)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else {
      onChange(masks.map((m) => (m.id === drag.id ? resizeMask(m, drag.corner, p.x, p.y) : m)));
    }
  };

  const onPointerUp = () => {
    if (drag?.kind === 'draw') {
      const r = rectFromPoints(drag.x0, drag.y0, drag.x, drag.y);
      if (r) {
        const mask: OcclusionMask = { id: newMaskId(), ...r, ...(tool === 'ellipse' ? { shape: 'ellipse' as const } : {}), group: nextGroup(masks) };
        onChange([...masks, mask]);
        setSelected(new Set([mask.id]));
      }
    }
    setDrag(null);
  };

  const sel = masks.filter((m) => selected.has(m.id));
  const selGroups = new Set(sel.map((m) => m.group));
  const canGroup = sel.length >= 2 && selGroups.size > 1;
  const canUngroup = sel.some((m) => masks.some((o) => o.id !== m.id && o.group === m.group));
  const removeSelected = () => {
    onChange(masks.filter((m) => !selected.has(m.id)));
    setSelected(new Set());
  };

  const draft = drag?.kind === 'draw' ? rectFromPoints(drag.x0, drag.y0, drag.x, drag.y) : null;
  const single = sel.length === 1 ? sel[0] : null;
  const groups = maskGroups(masks).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="inline-flex items-center gap-1" role="group" aria-label={t('Forme du masque')}>
          {(
            [
              ['rect', Square, t('Rectangle')],
              ['ellipse', Circle, t('Ovale')],
              ['polygon', Pentagon, t('Polygone')],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              onClick={() => pickTool(id)}
              className={`${TOOL} ${tool === id ? TOOL_ON : TOOL_OFF}`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {poly.length > 0 && (
          <>
            <button type="button" disabled={poly.length < 3} onClick={() => finishPoly()} className={`${TOOL} ${TOOL_OFF}`}>
              <Check className="w-3.5 h-3.5" />
              {t('Terminer')}
            </button>
            <button type="button" onClick={cancelPoly} className={`${TOOL} ${TOOL_OFF}`}>
              <X className="w-3.5 h-3.5" />
              {t('Annuler')}
            </button>
          </>
        )}
        <button
          type="button"
          aria-pressed={multi}
          onClick={() => setMulti((v) => !v)}
          className={`${TOOL} ${multi ? TOOL_ON : TOOL_OFF}`}
          title={t('Toucher plusieurs masques pour les sélectionner ensemble (Maj + clic à la souris)')}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
          {t('Sélection multiple')}
        </button>
        <button type="button" disabled={!canGroup} onClick={() => onChange(groupMasks(masks, selected))} className={`${TOOL} ${TOOL_OFF}`}>
          <Group className="w-3.5 h-3.5" />
          {t('Grouper')}
        </button>
        <button type="button" disabled={!canUngroup} onClick={() => onChange(ungroupMasks(masks, selected))} className={`${TOOL} ${TOOL_OFF}`}>
          <Ungroup className="w-3.5 h-3.5" />
          {t('Séparer')}
        </button>
        <button
          type="button"
          disabled={sel.length === 0}
          onClick={removeSelected}
          className={`${TOOL} ${TOOL_OFF} hover:text-rose-600`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('Supprimer')}
        </button>
        <span className="ml-auto text-[0.6875rem] text-slate-500 dark:text-slate-400">
          {poly.length > 0
            ? t('Touchez le premier point (ou « Terminer ») pour fermer la forme.')
            : groups > 0
              ? plural(groups, '{n} carte à réviser', '{n} cartes à réviser')
              : tool === 'polygon'
                ? t('Touchez l\'image pour poser les points du contour.')
                : t('Glissez sur l\'image pour masquer une zone.')}
        </span>
      </div>

      {media.status !== 'ready' ? (
        <div className="flex items-center justify-center min-h-32 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
          <SquareDashed className="w-4 h-4 mr-1.5" />
          {media.status === 'missing' ? t('Image pas encore disponible sur cet appareil') : t('Chargement de l\'image…')}
        </div>
      ) : (
        <div className="flex justify-center">
          <div
            ref={boxRef}
            className="relative inline-block max-w-full select-none cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={media.url} alt="" draggable={false} className="block max-w-full max-h-[55vh] w-auto h-auto rounded-lg pointer-events-none" />
            <MaskCanvas>
              {masks.map((m) => (
                <MaskShape
                  key={m.id}
                  mask={m}
                  className={selected.has(m.id) ? 'fill-amber-400/45 stroke-amber-500' : 'fill-teal-500/35 stroke-teal-600'}
                />
              ))}
              {draft && <MaskShape mask={{ ...draft, shape: tool === 'ellipse' ? 'ellipse' : 'rect' }} dashed className="fill-teal-500/20 stroke-teal-600" />}
              {poly.length > 0 && (
                <polyline
                  points={[...poly, ...(cursor ? [cursor] : [])].map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none"
                  className="stroke-teal-600"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                />
              )}
            </MaskCanvas>
            {masks.map((m) => (
              <MaskLabel key={m.id} mask={m} className={`text-[0.625rem] font-bold text-white rounded px-1 ${selected.has(m.id) ? 'bg-amber-600' : 'bg-teal-700'}`}>
                {m.group}
              </MaskLabel>
            ))}
            {poly.map((q, i) => (
              <div
                key={i}
                className={`absolute -ml-1.5 -mt-1.5 rounded-full border-2 border-teal-600 pointer-events-none ${
                  i === 0 ? `w-3 h-3 ${poly.length >= 3 ? 'bg-teal-400 ring-2 ring-teal-300' : 'bg-white'}` : 'w-3 h-3 bg-white'
                }`}
                style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }}
              />
            ))}
            {single && single.shape !== 'polygon' &&
              CORNERS.map((c) => (
                <div
                  key={c}
                  data-corner={c}
                  data-mask={single.id}
                  className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-white border-2 border-amber-500 shadow ${
                    c === 'nw' || c === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                  }`}
                  style={{
                    left: `${(c === 'nw' || c === 'sw' ? single.x : single.x + single.w) * 100}%`,
                    top: `${(c === 'nw' || c === 'ne' ? single.y : single.y + single.h) * 100}%`,
                  }}
                />
              ))}
            {single?.shape === 'polygon' &&
              single.points?.map((q, i) => (
                <div
                  key={i}
                  data-vertex={i}
                  data-mask={single.id}
                  className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-white border-2 border-amber-500 shadow cursor-move"
                  style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
