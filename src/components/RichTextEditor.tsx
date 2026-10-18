import React, { useEffect, useRef } from 'react';
import { Bold, EyeOff, Italic, List, ListOrdered, Subscript, Superscript, Underline } from 'lucide-react';
import { Block, Inline, parseRichText, serializeDom } from '../utils/richText';
import { clozeNumbers } from '../utils/flashcards';
import { t } from '../i18n';

const MAX_LENGTH = 5000;

/** Construit le contenu du champ à partir du texte à marqueurs (nœuds DOM, jamais de HTML brut). */
function buildInline(nodes: Inline[], parent: Node) {
  for (const n of nodes) {
    if (n.type === 'text') {
      parent.appendChild(document.createTextNode(n.text));
    } else if (n.type === 'sup' || n.type === 'sub') {
      const el = document.createElement(n.type);
      el.appendChild(document.createTextNode(n.text));
      parent.appendChild(el);
    } else if (n.type === 'frac') {
      // Dans le champ, la fraction reste telle qu'elle s'écrit : ⟦numérateur/dénominateur⟧
      parent.appendChild(document.createTextNode('\u27e6'));
      buildInline(n.num, parent);
      parent.appendChild(document.createTextNode('/'));
      buildInline(n.den, parent);
      parent.appendChild(document.createTextNode('\u27e7'));
    } else if (n.type === 'cloze') {
      // Le champ montre le trou tel qu'il s'écrit ({{c1::…}}), sans le lire comme un trou
      parent.appendChild(document.createTextNode(`{{c${n.n}::`));
      buildInline(n.children, parent);
      if (n.hint) parent.appendChild(document.createTextNode(`::${n.hint}`));
      parent.appendChild(document.createTextNode('}}'));
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
  /** Longueur maximale du texte à marqueurs (notes : 5 000, cartes : 2 000). */
  maxLength?: number;
  /** Texte à trous : ajoute le bouton « Cacher la sélection ». */
  cloze?: boolean;
  /** Pour mettre le focus depuis l'extérieur. */
  editorRef?: React.RefObject<HTMLDivElement | null>;
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
  maxLength = MAX_LENGTH,
  cloze = false,
  editorRef,
}) => {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? ownRef;
  // Dernière sélection non vide du champ : sur iPad, toucher un bouton peut la faire perdre avant le clic
  const lastRange = useRef<Range | null>(null);
  useEffect(() => {
    const keep = () => {
      const sel = window.getSelection();
      const el = ref.current;
      if (!sel || sel.rangeCount === 0 || !el) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed && el.contains(range.commonAncestorContainer)) lastRange.current = range.cloneRange();
    };
    document.addEventListener('selectionchange', keep);
    return () => document.removeEventListener('selectionchange', keep);
  }, [ref]);
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
    if (text.length > maxLength) {
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

  // Entoure la sélection (une seule ligne) d'un nouveau trou : numéro suivant le plus grand présent. La mise en forme
  // de la sélection est conservée : on ajoute seulement `{{cN::` avant et `}}` après.
  const hideSelection = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const live = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const range = live && !live.collapsed && el.contains(live.commonAncestorContainer) ? live : lastRange.current;
    if (!range || range.collapsed || !el.contains(range.commonAncestorContainer)) return;
    const selected = range.toString();
    if (!selected.trim() || selected.includes('\n')) return;
    const n = Math.max(0, ...clozeNumbers(serializeDom(el))) + 1;
    const endRange = range.cloneRange();
    endRange.collapse(false);
    const startRange = range.cloneRange();
    startRange.collapse(true);
    const closing = document.createTextNode('}}');
    endRange.insertNode(closing);
    startRange.insertNode(document.createTextNode(`{{c${n}::`));
    const after = document.createRange();
    after.setStartAfter(closing);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    lastRange.current = null;
    el.focus();
    emit();
  };

  // Fraction : la sélection devient le numérateur (curseur dans le dénominateur) ; sans sélection, ⟦/⟧ avec le curseur avant la barre
  const insertFraction = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    el.focus();
    const live = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const chosen = live && !live.collapsed && el.contains(live.commonAncestorContainer) ? live.toString() : '';
    if (chosen.includes('\n')) return;
    document.execCommand('insertText', false, chosen ? `\u27e6${chosen}/\u27e7` : '\u27e6/\u27e7');
    // curseur avant « ⟧ » (dénominateur) ou avant « / » (numérateur)
    const back = chosen ? 1 : 2;
    for (let i = 0; i < back; i++) sel.modify?.('move', 'backward', 'character');
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
        {tool(t('Exposant'), <Superscript className="w-3.5 h-3.5" />, 'superscript')}
        {tool(t('Indice'), <Subscript className="w-3.5 h-3.5" />, 'subscript')}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onClick={insertFraction}
          title={t('Fraction ⟦a/b⟧ : sélectionnez le numérateur puis cliquez')}
          aria-label={t('Fraction')}
          className={btn}
        >
          <span className="inline-flex flex-col items-center leading-none text-[0.5625rem] font-bold" aria-hidden="true">
            <span className="border-b border-current px-0.5">a</span>
            <span>b</span>
          </span>
        </button>
        <span className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
        {tool(t('Liste à puces'), <List className="w-3.5 h-3.5" />, 'insertUnorderedList')}
        {tool(t('Liste numérotée'), <ListOrdered className="w-3.5 h-3.5" />, 'insertOrderedList')}
        {cloze && (
          <button
            type="button"
            // garde la sélection du champ au clic
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={hideSelection}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-semibold rounded-md text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/15 hover:bg-teal-100 dark:hover:bg-teal-500/25"
          >
            <EyeOff className="w-3.5 h-3.5" />
            {t('Cacher la sélection')}
          </button>
        )}
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
