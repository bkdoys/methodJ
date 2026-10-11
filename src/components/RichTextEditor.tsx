import React, { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { Block, Inline, parseRichText, serializeDom } from '../utils/richText';
import { t } from '../i18n';

const MAX_LENGTH = 5000;

/** Construit le contenu du champ à partir du texte à marqueurs (nœuds DOM, jamais de HTML brut). */
function buildInline(nodes: Inline[], parent: Node) {
  for (const n of nodes) {
    if (n.type === 'text') {
      parent.appendChild(document.createTextNode(n.text));
    } else {
      const el = document.createElement(n.type === 'bold' ? 'b' : n.type === 'italic' ? 'i' : 'u');
      buildInline(n.children, el);
      parent.appendChild(el);
    }
  }
}

function fill(root: HTMLElement, text: string) {
  root.replaceChildren();
  if (!text) return;
  parseRichText(text).forEach((b: Block) => {
    if (b.type === 'p') {
      const div = document.createElement('div');
      if (b.children.length) buildInline(b.children, div);
      else div.appendChild(document.createElement('br'));
      root.appendChild(div);
    } else {
      const list = document.createElement(b.type);
      b.items.forEach((item) => {
        const li = document.createElement('li');
        buildInline(item, li);
        list.appendChild(li);
      });
      root.appendChild(list);
    }
  });
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Hauteur minimale, en lignes. */
  minRows?: number;
  /** Au-delà, la zone défile au lieu de grandir. */
  maxHeight?: string;
  /** Prend le focus à l'ouverture, curseur à la fin du texte. */
  focusAtEnd?: boolean;
  onBlur?: () => void;
  className?: string;
}

/**
 * Champ de note visuel : le gras, l'italique, le souligné et les listes s'affichent tels quels pendant la saisie.
 * La valeur reste un texte à marqueurs (voir utils/richText.ts) : ce composant ne stocke jamais de HTML.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  id,
  placeholder,
  minRows = 4,
  maxHeight = '60vh',
  focusAtEnd = false,
  onBlur,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Dernier texte produit par le champ : permet de ne reconstruire le contenu que si la valeur vient d'ailleurs
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    fill(el, value);
    lastEmitted.current = value;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!focusAtEnd || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [focusAtEnd]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const text = serializeDom(el);
    if (text.length > MAX_LENGTH) {
      // Trop long : on revient à la dernière valeur acceptée
      fill(el, lastEmitted.current ?? '');
      return;
    }
    lastEmitted.current = text;
    onChange(text);
  };

  const run = (command: string) => {
    ref.current?.focus();
    // Des balises (<b>, <i>, <u>) plutôt que des styles en ligne
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command);
    emit();
  };

  const btn =
    'p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800';
  const tool = (label: string, icon: React.ReactNode, command: string, shortcut?: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(command)}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      className={btn}
    >
      {icon}
    </button>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5" role="toolbar" aria-label={t('Mise en forme')}>
        {tool(t('Gras'), <Bold className="w-3.5 h-3.5" />, 'bold', 'Ctrl+B')}
        {tool(t('Italique'), <Italic className="w-3.5 h-3.5" />, 'italic', 'Ctrl+I')}
        {tool(t('Souligné'), <Underline className="w-3.5 h-3.5" />, 'underline', 'Ctrl+U')}
        <span className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
        {tool(t('Liste à puces'), <List className="w-3.5 h-3.5" />, 'insertUnorderedList')}
        {tool(t('Liste numérotée'), <ListOrdered className="w-3.5 h-3.5" />, 'insertOrderedList')}
      </div>
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={onBlur}
        onPaste={(e) => {
          // Texte seul : pas de styles venus d'ailleurs
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        style={{ minHeight: `${minRows * 1.6}em`, maxHeight }}
        className={`overflow-y-auto whitespace-pre-wrap break-words leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:empty:before:text-slate-500 ${className}`}
      />
    </div>
  );
};
