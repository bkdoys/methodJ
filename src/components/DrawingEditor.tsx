import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowUpRight, Check, Circle, Copy, Eraser, Minus, MousePointer2, PaintBucket, Pencil, Pentagon, Redo2, Square, Trash2, Triangle, Type, Undo2, X } from 'lucide-react';
import { useMediaUrl } from '../hooks/useMediaUrl';
import {
  acceptsPointer,
  addPoint,
  Bounds,
  boundsIntersect,
  canvasSize,
  closesPolygon,
  COLORS,
  isClosedShape,
  commitStroke,
  drawLastSegment,
  drawStroke,
  drawStrokeEnd,
  emptyHistory,
  ERASER_FACTOR,
  PEN_WIDTHS,
  redoStroke,
  replaceStrokes,
  scaledWidth,
  Shape,
  Stroke,
  strokeBounds,
  TEXT_FACTOR,
  TEXT_LINE_HEIGHT,
  textFont,
  toggleFill,
  topClosedShapeAt,
  topStrokeAt,
  translateStroke,
  undoStroke,
  unionBounds,
} from '../utils/drawing';
import { useConfirm } from './ConfirmDialog';
import { DrawingSource } from '../utils/drawingSource';
import { plural, t } from '../i18n';

interface DrawingEditorProps {
  /** Image à annoter (id de média) ; absent = page blanche. */
  background?: string;
  /** Dessin enregistré plus tôt, rouvert pour être modifié (éléments, taille, photo dessous). */
  initial?: DrawingSource;
  /**
   * Dessin terminé : image PNG à plat (la compression et l'enregistrement sont faits par l'appelant) et ses éléments,
   * à garder pour pouvoir le rouvrir.
   */
  onDone: (png: Blob, source: DrawingSource) => void;
  onClose: () => void;
}

const SHAPES: { shape: Shape; icon: React.ComponentType<{ className?: string }>; label: () => string }[] = [
  { shape: 'line', icon: Minus, label: () => t('Ligne droite') },
  { shape: 'arrow', icon: ArrowUpRight, label: () => t('Flèche') },
  { shape: 'darrow', icon: ArrowLeftRight, label: () => t('Double flèche') },
  { shape: 'rect', icon: Square, label: () => t('Rectangle') },
  { shape: 'ellipse', icon: Circle, label: () => t('Ovale') },
  { shape: 'triangle', icon: Triangle, label: () => t('Triangle') },
  { shape: 'polygon', icon: Pentagon, label: () => t('Polygone') },
  { shape: 'text', icon: Type, label: () => t('Zone de texte') },
];

const TOOL = 'p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed';
const TOOL_OFF = 'text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700';
const TOOL_ON = 'text-white border-teal-600 bg-teal-600';

/**
 * Dessin à main levée (doigt, Pencil, souris) sur une page blanche, ou par-dessus une image pour l'annoter. Deux
 * calques : le fond (blanc ou image) et les traits ; la gomme n'efface que les traits. Rendu final : un PNG à plat.
 */
export const DrawingEditor: React.FC<DrawingEditorProps> = ({ background, initial, onDone, onClose }) => {
  const confirm = useConfirm();
  const media = useMediaUrl(background);
  // Demande au navigateur de ne pas effacer le stockage de l'appareil (dessins modifiables, images en attente d'envoi)
  useEffect(() => {
    void navigator.storage?.persist?.();
  }, []);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [bgFailed, setBgFailed] = useState(false);
  // Stylo à main levée, gomme, ou une forme tracée du point de départ au point d'arrivée
  const [tool, setTool] = useState<'pen' | 'eraser' | 'select' | 'fill' | Shape>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [history, setHistory] = useState(() => (initial ? { ...emptyHistory, strokes: initial.strokes } : emptyHistory));
  // Page blanche orientée comme l'écran à l'ouverture (iPad en portrait : page en hauteur)
  const [portrait] = useState(() => window.innerHeight > window.innerWidth);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Stroke | null>(null);
  // Pointeur qui trace en ce moment, et stylet vu pendant cette ouverture (rejet de la paume)
  const livePointer = useRef<number | null>(null);
  const penSeen = useRef(false);
  // Polygone en cours (sommets posés par touchers successifs) et zone de texte en cours de saisie
  const poly = useRef<[number, number][]>([]);
  const [polyCount, setPolyCount] = useState(0);
  const [textEdit, setTextEdit] = useState<{ x: number; y: number } | null>(null);
  const textRef = useRef('');
  const textOpen = useRef(false);
  textOpen.current = textEdit !== null;
  // Sélection (éléments de l'historique) : déplacement en cours (écart depuis le point touché) ou rectangle de sélection
  const [selected, setSelected] = useState<Stroke[]>([]);
  const [offset, setOffset] = useState<[number, number] | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const drag = useRef<{ kind: 'move' | 'marquee'; from: [number, number]; pointerId: number } | null>(null);
  // Un élément annulé ou supprimé n'est plus sélectionné
  const liveSelected = selected.filter((st) => history.strokes.includes(st));
  const selectedRef = useRef<Stroke[]>([]);
  selectedRef.current = liveSelected;

  // L'image de fond est chargée avant d'afficher le canvas (sa taille donne celle du dessin)
  useEffect(() => {
    // Dessin rouvert : la photo dessous est dans la source ; sinon, celle de l'image à annoter
    if (initial?.backgroundUrl) {
      const img = new Image();
      img.onload = () => setBg(img);
      img.onerror = () => setBgFailed(true);
      img.src = initial.backgroundUrl;
      return;
    }
    if (!background) return;
    if (media.status === 'missing') setBgFailed(true);
    if (media.status !== 'ready') return;
    const img = new Image();
    img.onload = () => setBg(img);
    img.onerror = () => setBgFailed(true);
    img.src = media.url;
  }, [background, media, initial]);

  const ready = (!background && !initial?.backgroundUrl) || !!bg;
  const size = initial ? { width: initial.width, height: initial.height } : canvasSize(bg ? { width: bg.naturalWidth, height: bg.naturalHeight } : undefined, portrait);

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

  const longSide = Math.max(size.width, size.height);
  const strokeWidth = (base: number) => scaledWidth(base, longSide);

  // Largeur d'une ligne de texte, mesurée comme elle est tracée
  const measure = (line: string, fontSize: number): number => {
    const ctx = layerRef.current?.getContext('2d');
    if (!ctx) return line.length * fontSize * 0.6;
    ctx.save();
    ctx.font = textFont(fontSize);
    const w = ctx.measureText(line).width;
    ctx.restore();
    return w;
  };
  const boundsOf = (list: Stroke[]): Bounds | null => unionBounds(list.map((st) => strokeBounds(st, measure)));

  // Rejoue le calque avec les éléments sélectionnés décalés de (dx, dy), sans toucher à l'historique
  const paintMoved = (dx: number, dy: number) => {
    const layer = layerRef.current;
    if (!layer) return;
    const ctx = layer.getContext('2d')!;
    ctx.clearRect(0, 0, layer.width, layer.height);
    history.strokes.forEach((st) => drawStroke(ctx, liveSelected.includes(st) ? translateStroke(st, dx, dy) : st));
    compose();
  };

  // Rejoue l'historique puis le polygone en cours (ligne ouverte jusqu'au curseur, sommets marqués)
  const redrawPolygon = (cursor?: [number, number]) => {
    const layer = layerRef.current;
    if (!layer) return;
    const ctx = layer.getContext('2d')!;
    ctx.clearRect(0, 0, layer.width, layer.height);
    history.strokes.forEach((st) => drawStroke(ctx, st));
    const pts = poly.current;
    if (pts.length > 0) {
      const base = strokeWidth(PEN_WIDTHS[widthIdx]);
      // Segments droits (drawStroke lisserait en courbe) jusqu'au curseur
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = base;
      ctx.strokeStyle = color;
      ctx.beginPath();
      [...pts, ...(cursor ? [cursor] : [])].forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.stroke();
      ctx.restore();
      pts.forEach((p) => drawStroke(ctx, { tool: 'pen', color, width: base * 2, points: [p] }));
    }
    compose();
  };

  const cancelPolygon = () => {
    if (poly.current.length === 0) return;
    poly.current = [];
    setPolyCount(0);
    redrawPolygon();
  };

  const finishPolygon = () => {
    const points = poly.current;
    poly.current = [];
    setPolyCount(0);
    const stroke: Stroke = { tool: 'pen', color, width: strokeWidth(PEN_WIDTHS[widthIdx]), points, shape: 'polygon' };
    setHistory((h) => {
      const next = commitStroke(h, stroke);
      return next === h ? { ...h } : next;
    });
  };

  const commitText = () => {
    const edit = textEdit;
    const value = textRef.current;
    textRef.current = '';
    setTextEdit(null);
    if (!edit || !value.trim()) return;
    const width = strokeWidth(PEN_WIDTHS[widthIdx]);
    const stroke: Stroke = { tool: 'pen', color, width, points: [[edit.x, edit.y]], shape: 'text', text: value.replace(/\s+$/, ''), fontSize: width * TEXT_FACTOR };
    setHistory((h) => commitStroke(h, stroke));
  };

  useEffect(() => {
    if (tool !== 'select') setSelected([]);
  }, [tool]);

  // Copier/coller : les éléments copiés sont recollés décalés (de plus en plus à chaque collage) et sélectionnés
  const clipboard = useRef<Stroke[]>([]);
  const pasteCount = useRef(0);
  const copySelected = () => {
    if (selectedRef.current.length === 0) return;
    clipboard.current = selectedRef.current;
    pasteCount.current = 0;
  };
  const pasteClipboard = () => {
    if (clipboard.current.length === 0) return;
    pasteCount.current += 1;
    const off = (pasteCount.current * 28 * longSide) / 1600;
    const copies = clipboard.current.map((st) => translateStroke(st, off, off));
    setTool('select');
    setSelected(copies);
    setHistory((h) => replaceStrokes(h, [...h.strokes, ...copies]));
  };
  const duplicateSelected = () => {
    copySelected();
    pasteClipboard();
  };

  // Une couleur choisie avec une sélection la recolore (trait ou texte)
  const recolorSelected = (c: string) => {
    const picked = selectedRef.current;
    if (picked.length === 0) return;
    const next = new Map(picked.map((st) => [st, { ...st, color: c }] as const));
    setSelected([...next.values()]);
    setHistory((h) => replaceStrokes(h, h.strokes.map((st) => next.get(st) ?? st)));
  };

  // Remplit les formes fermées de la sélection de la couleur choisie (la même couleur une deuxième fois l'enlève)
  const fillSelected = () => {
    const picked = selectedRef.current.filter((st) => isClosedShape(st.shape));
    if (picked.length === 0) return;
    const next = new Map(picked.map((st) => [st, toggleFill(st, color)] as const));
    setSelected(selectedRef.current.map((st) => next.get(st) ?? st));
    setHistory((h) => replaceStrokes(h, h.strokes.map((st) => next.get(st) ?? st)));
  };

  const deleteSelected = () => {
    const gone = selectedRef.current;
    if (gone.length === 0) return;
    setSelected([]);
    setHistory((h) => replaceStrokes(h, h.strokes.filter((st) => !gone.includes(st))));
  };

  // Changer d'outil abandonne un polygone commencé ; annuler/rétablir aussi (le calque est rejoué)
  useEffect(() => {
    poly.current = [];
    setPolyCount(0);
  }, [tool, history]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !layerRef.current) return;
    e.preventDefault();
    if (e.pointerType === 'pen') penSeen.current = true;
    if (!acceptsPointer(e.pointerType, penSeen.current)) return;
    if (tool === 'fill') {
      // Pot de peinture : remplit la forme fermée touchée (la plus haute) ; le fond et les traits libres ne se remplissent pas
      const [px, py] = toCanvas(e);
      const target = topClosedShapeAt(history.strokes, px, py);
      if (target) setHistory((h) => replaceStrokes(h, h.strokes.map((st) => (st === target ? toggleFill(st, color) : st))));
      return;
    }
    if (tool === 'select') {
      const [px, py] = toCanvas(e);
      // Doigt : zone de toucher plus large qu'à la souris
      const tol = ((e.pointerType === 'mouse' ? 8 : 18) * longSide) / 1600;
      const onSelected = topStrokeAt(liveSelected, px, py, tol, measure);
      const target = onSelected ?? topStrokeAt(history.strokes, px, py, tol, measure);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointeur déjà terminé
      }
      if (target) {
        if (!onSelected) setSelected([target]);
        drag.current = { kind: 'move', from: [px, py], pointerId: e.pointerId };
        setOffset([0, 0]);
      } else {
        setSelected([]);
        drag.current = { kind: 'marquee', from: [px, py], pointerId: e.pointerId };
        setMarquee({ x0: px, y0: py, x1: px, y1: py });
      }
      return;
    }
    if (tool === 'polygon') {
      const [px, py] = toCanvas(e);
      if (closesPolygon(poly.current, px, py, longSide)) finishPolygon();
      else {
        poly.current = [...poly.current, [px, py]];
        setPolyCount(poly.current.length);
        redrawPolygon();
      }
      return;
    }
    if (tool === 'text') {
      // La zone en cours est validée, puis une nouvelle s'ouvre là où l'on a touché
      commitText();
      const [px, py] = toCanvas(e);
      textRef.current = '';
      setTextEdit({ x: px, y: py });
      return;
    }
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
    const shape = tool === 'pen' || tool === 'eraser' ? undefined : tool;
    const stroke: Stroke = {
      tool: tool === 'eraser' ? 'eraser' : 'pen',
      color,
      width: scaledWidth(base, Math.max(size.width, size.height)),
      points: [[x, y]],
      ...(shape ? { shape } : {}),
    };
    live.current = stroke;
    if (!shape) {
      drawLastSegment(layerRef.current.getContext('2d')!, stroke);
      compose();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d && e.pointerId === d.pointerId) {
      const [x, y] = toCanvas(e);
      if (d.kind === 'move') {
        setOffset([x - d.from[0], y - d.from[1]]);
        paintMoved(x - d.from[0], y - d.from[1]);
      } else setMarquee({ x0: Math.min(d.from[0], x), y0: Math.min(d.from[1], y), x1: Math.max(d.from[0], x), y1: Math.max(d.from[1], y) });
      return;
    }
    if (tool === 'polygon' && poly.current.length > 0) {
      redrawPolygon(toCanvas(e));
      return;
    }
    const stroke = live.current;
    if (!stroke || !layerRef.current || e.pointerId !== livePointer.current) return;
    const [x, y] = toCanvas(e);
    if (stroke.shape) {
      // Une forme se redessine entière à chaque mouvement : calque rejoué puis forme provisoire par-dessus
      stroke.points = [stroke.points[0], [x, y]];
      const ctx = layerRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, layerRef.current.width, layerRef.current.height);
      history.strokes.forEach((s) => drawStroke(ctx, s));
      drawStroke(ctx, stroke);
      compose();
      return;
    }
    const points = addPoint(stroke.points, x, y);
    if (points === stroke.points) return;
    stroke.points = points;
    drawLastSegment(layerRef.current.getContext('2d')!, stroke);
    compose();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d && e.pointerId === d.pointerId) {
      drag.current = null;
      const [x, y] = toCanvas(e);
      if (d.kind === 'move') {
        const dx = x - d.from[0];
        const dy = y - d.from[1];
        setOffset(null);
        if (Math.hypot(dx, dy) < 3) {
          paintMoved(0, 0); // un simple toucher sélectionne, ne déplace pas
          return;
        }
        const moved = new Map(liveSelected.map((st) => [st, translateStroke(st, dx, dy)] as const));
        setSelected([...moved.values()]);
        setHistory((h) => replaceStrokes(h, h.strokes.map((st) => moved.get(st) ?? st)));
      } else {
        const box: Bounds = { x0: Math.min(d.from[0], x), y0: Math.min(d.from[1], y), x1: Math.max(d.from[0], x), y1: Math.max(d.from[1], y) };
        setMarquee(null);
        if (box.x1 - box.x0 >= 3 || box.y1 - box.y0 >= 3) {
          setSelected(history.strokes.filter((st) => st.tool !== 'eraser' && boundsIntersect(strokeBounds(st, measure), box)));
        }
      }
      return;
    }
    if (e.pointerId !== livePointer.current) return;
    const stroke = live.current;
    live.current = null;
    livePointer.current = null;
    if (!stroke || !layerRef.current) return;
    if (!stroke.shape) {
      drawStrokeEnd(layerRef.current.getContext('2d')!, stroke);
      compose();
    }
    // Une forme sans taille (simple toucher) n'entre pas dans l'historique : le calque est rejoué sans elle
    setHistory((h) => {
      const next = commitStroke(h, stroke);
      return next === h ? { ...h } : next;
    });
  };

  const undo = () => setHistory(undoStroke);
  const redo = () => setHistory(redoStroke);
  const dirty = history.strokes.length > 0;

  const done = () => {
    if (!dirty) return;
    // La photo dessous est recopiée dans la source (l'image d'origine peut disparaître de l'appareil)
    let backgroundUrl = initial?.backgroundUrl;
    if (!backgroundUrl && bg) {
      const c = document.createElement('canvas');
      c.width = size.width;
      c.height = size.height;
      c.getContext('2d')!.drawImage(bg, 0, 0, c.width, c.height);
      backgroundUrl = c.toDataURL('image/jpeg', 0.88);
    }
    const source: DrawingSource = { v: 1, width: size.width, height: size.height, strokes: history.strokes, ...(backgroundUrl ? { backgroundUrl } : {}) };
    canvasRef.current?.toBlob((blob) => blob && onDone(blob, source), 'image/png');
  };

  // Un dessin rouvert n'a « rien à perdre » tant qu'on n'y a rien changé
  const changed = initial ? history.past.length > 0 : dirty;
  const close = useCallback(async () => {
    if (
      changed &&
      !(await confirm({
        title: t('Abandonner ce dessin ?'),
        message: t('Les traits non enregistrés seront perdus.'),
        confirmLabel: t('Abandonner'),
        tone: 'danger',
      }))
    )
      return;
    onClose();
  }, [changed, confirm, onClose]);

  // Les raccourcis clavier (enregistrés une fois) appellent la version la plus récente de ces fonctions
  const finishPolygonRef = useRef(finishPolygon);
  const redrawPolygonRef = useRef(redrawPolygon);
  const cancelPolygonRef = useRef(cancelPolygon);
  const deleteSelectedRef = useRef(deleteSelected);
  const copyRef = useRef(copySelected);
  const pasteRef = useRef(pasteClipboard);
  const duplicateRef = useRef(duplicateSelected);
  const clipboardRef = clipboard;
  copyRef.current = copySelected;
  pasteRef.current = pasteClipboard;
  duplicateRef.current = duplicateSelected;
  deleteSelectedRef.current = deleteSelected;
  finishPolygonRef.current = finishPolygon;
  redrawPolygonRef.current = redrawPolygon;
  cancelPolygonRef.current = cancelPolygon;

  // Cmd/Ctrl + Z, + Maj + Z ; Échap ferme (le formulaire de la carte derrière ne les reçoit pas)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Saisie d'un texte : Entrée valide, Échap abandonne la zone, le reste revient au champ (annuler du texte compris)
      if (textOpen.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          textRef.current = '';
          setTextEdit(null);
        }
        return;
      }
      // Copier / coller / dupliquer les éléments sélectionnés (le collage marche aussi sans sélection)
      if (mod && !e.shiftKey && ['c', 'v', 'd'].includes(e.key.toLowerCase())) {
        const key = e.key.toLowerCase();
        if (key === 'v' && clipboardRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          pasteRef.current();
          return;
        }
        if ((key === 'c' || key === 'd') && selectedRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          if (key === 'c') copyRef.current();
          else duplicateRef.current();
          return;
        }
      }
      // Sélection : Suppr / Retour arrière la supprime, Échap la lâche
      if (selectedRef.current.length > 0) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          deleteSelectedRef.current();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setSelected([]);
          return;
        }
      }
      // Polygone en cours : Entrée le ferme, Retour arrière retire le dernier sommet, Échap l'abandonne
      if (poly.current.length > 0) {
        if (e.key === 'Enter' && poly.current.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          finishPolygonRef.current();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          poly.current = poly.current.slice(0, -1);
          setPolyCount(poly.current.length);
          redrawPolygonRef.current();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelPolygonRef.current();
          return;
        }
      }
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
          <button
            type="button"
            aria-label={t('Sélectionner et déplacer')}
            title={t('Sélectionner et déplacer')}
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
            className={`${TOOL} ${tool === 'select' ? TOOL_ON : TOOL_OFF}`}
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={t('Remplir une forme')}
            title={t('Remplir une forme de la couleur choisie (rectangle, ovale, triangle, polygone)')}
            aria-pressed={tool === 'fill'}
            onClick={() => setTool(tool === 'fill' ? 'pen' : 'fill')}
            className={`${TOOL} ${tool === 'fill' ? TOOL_ON : TOOL_OFF}`}
          >
            <PaintBucket className="w-4 h-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          {SHAPES.map(({ shape, icon: Icon, label }) => (
            <button
              key={shape}
              type="button"
              aria-label={label()}
              title={label()}
              aria-pressed={tool === shape}
              // Un deuxième clic revient au stylo
              onClick={() => setTool(tool === shape ? 'pen' : shape)}
              className={`${TOOL} ${tool === shape ? TOOL_ON : TOOL_OFF}`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}

          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <div className="flex items-center gap-1.5" role="group" aria-label={t('Couleur')}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c && tool !== 'eraser'}
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('pen');
                  recolorSelected(c);
                }}
                className={`w-7 h-7 rounded-full border-2 ${
                  color === c && tool !== 'eraser' ? 'border-teal-500 ring-2 ring-teal-300 dark:ring-teal-500/50' : 'border-white dark:border-slate-700'
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

          <button type="button" aria-label={t('Annuler le dernier trait')} title={t('Annuler le dernier trait')} disabled={history.past.length === 0} onClick={undo} className={`${TOOL} ${TOOL_OFF}`}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" aria-label={t('Rétablir')} title={t('Rétablir')} disabled={history.future.length === 0} onClick={redo} className={`${TOOL} ${TOOL_OFF}`}>
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
            // Remplit la place disponible en gardant les proportions : toute la largeur, sans dépasser la hauteur de l'écran
            <div className="relative" style={{ width: `min(100%, calc((100dvh - 7.5rem) * ${size.width / size.height}))`, containerType: 'inline-size' }}>
              <canvas
              ref={canvasRef}
              width={size.width}
              height={size.height}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`block w-full h-auto bg-white rounded-lg shadow-sm select-none ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              style={{ touchAction: 'none' }}
            />
              {/* Cadre de sélection et rectangle de sélection : superposés, jamais dans l'image enregistrée */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
                {(() => {
                  const box = tool === 'select' ? boundsOf(liveSelected) : null;
                  if (!box) return null;
                  const [dx, dy] = offset ?? [0, 0];
                  const pad = (6 * longSide) / 1600;
                  return (
                    <rect
                      x={box.x0 + dx - pad}
                      y={box.y0 + dy - pad}
                      width={box.x1 - box.x0 + 2 * pad}
                      height={box.y1 - box.y0 + 2 * pad}
                      fill="rgba(20,184,166,0.08)"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })()}
                {marquee && (
                  <rect
                    x={marquee.x0}
                    y={marquee.y0}
                    width={marquee.x1 - marquee.x0}
                    height={marquee.y1 - marquee.y0}
                    fill="rgba(20,184,166,0.1)"
                    stroke="#14b8a6"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {tool === 'select' && liveSelected.length > 0 && !offset && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-lg border border-slate-200 dark:border-slate-700">
                  <span className="px-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{plural(liveSelected.length, '{n} élément', '{n} éléments')}</span>
                  <button
                    type="button"
                    onClick={duplicateSelected}
                    title={t('Dupliquer (Cmd/Ctrl + D) ; copier : Cmd/Ctrl + C, coller : Cmd/Ctrl + V')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {t('Dupliquer')}
                  </button>
                  {liveSelected.some((st) => isClosedShape(st.shape)) && (
                    <button
                      type="button"
                      onClick={fillSelected}
                      title={t('Remplir de la couleur choisie (ou enlever le remplissage)')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <PaintBucket className="w-3.5 h-3.5" />
                      {t('Remplir')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={deleteSelected}
                    title={t('Supprimer la sélection (Suppr)')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('Supprimer')}
                  </button>
                </div>
              )}
              {tool === 'polygon' && polyCount > 0 && (
                // Flottant sur le canvas : la barre d'outils ne change pas de hauteur (le canvas ne bouge pas)
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={polyCount < 3}
                    onClick={finishPolygon}
                    title={t('Fermer le polygone (Entrée), ou touchez le premier point')}
                    className="px-3 py-1.5 text-xs font-bold rounded-full text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('Terminer')}
                  </button>
                  <button type="button" onClick={cancelPolygon} className="px-3 py-1.5 text-xs font-semibold rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                    {t('Annuler')}
                  </button>
                </div>
              )}
              {textEdit && (
                <textarea
                  autoFocus
                  rows={1}
                  aria-label={t('Zone de texte')}
                  placeholder={t('Texte…')}
                  onChange={(e) => {
                    textRef.current = e.target.value;
                    // la zone grandit avec ce qu'on écrit
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commitText();
                    }
                  }}
                  onBlur={commitText}
                  className="absolute m-0 p-0 bg-transparent outline-dashed outline-1 outline-teal-500 resize-none overflow-hidden font-semibold"
                  style={{
                    left: `${(textEdit.x / size.width) * 100}%`,
                    top: `${(textEdit.y / size.height) * 100}%`,
                    width: `${Math.max(12, ((size.width - textEdit.x) / size.width) * 100)}%`,
                    color,
                    // même taille que le texte tracé : pixels du canvas ramenés à l'affichage (largeur du canvas = 100 %)
                    fontSize: `${(strokeWidth(PEN_WIDTHS[widthIdx]) * TEXT_FACTOR * 100) / size.width}cqw`,
                    lineHeight: TEXT_LINE_HEIGHT,
                    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
