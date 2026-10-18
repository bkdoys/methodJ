import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutsideClick } from '../hooks/useOutsideClick';

export interface MenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Action destructrice : texte rouge. */
  danger?: boolean;
  onSelect: () => void;
}

interface ActionMenuProps {
  /** Le bouton qui a ouvert le menu : il se place contre lui. */
  anchor: HTMLElement;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
}

const WIDTH = 224;
const GAP = 6;

/**
 * Petite palette d'outils ouverte par un bouton discret : des lignes avec icône et libellé, assez hautes pour le doigt.
 * Se ferme au clic à côté, avec Échap, ou après le choix d'une action. Même placement que la palette de couleurs.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ anchor, title, actions, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 180;
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

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
      className="z-[90] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5"
    >
      <p className="px-3 pb-1 pt-0.5 text-[0.6875rem] font-bold text-slate-500 dark:text-slate-400 truncate">{title}</p>
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            a.onSelect();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 ${
            a.danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">{a.icon}</span>
          <span className="min-w-0 break-words">{a.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
};
