/**
 * Mise en forme légère des notes : du texte avec quelques marqueurs, sans HTML.
 *   **gras**   _italique_   ++souligné++   « - » puce   « 1. » liste numérotée
 * Une note sans marqueur reste lisible telle quelle (notes existantes, export JSON, recherche).
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'underline'; children: Inline[] };

export type Block =
  | { type: 'p'; children: Inline[] } // une ligne ; vide = espace entre paragraphes
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; start: number; items: Inline[][] };

const INLINE = /\*\*(.+?)\*\*|\+\+(.+?)\+\+|(?<![\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu;
const BULLET = /^(\s*)[-•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)\.\s+(.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: 'text', text: text.slice(last, index) });
    if (m[1] !== undefined) out.push({ type: 'bold', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: 'underline', children: parseInline(m[2]) });
    else out.push({ type: 'italic', children: parseInline(m[3]) });
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const prev = blocks[blocks.length - 1];
    if (bullet) {
      const item = parseInline(bullet[2]);
      if (prev?.type === 'ul') prev.items.push(item);
      else blocks.push({ type: 'ul', items: [item] });
    } else if (numbered) {
      const item = parseInline(numbered[3]);
      if (prev?.type === 'ol') prev.items.push(item);
      else blocks.push({ type: 'ol', start: Number(numbered[2]), items: [item] });
    } else {
      blocks.push({ type: 'p', children: parseInline(line) });
    }
  }
  return blocks;
}

/** Texte brut sans marqueurs (aperçu sur un bloc de la timeline, par exemple). */
export function stripRichText(text: string): string {
  const plain = (nodes: Inline[]): string => nodes.map((n) => (n.type === 'text' ? n.text : plain(n.children))).join('');
  return parseRichText(text)
    .map((b) =>
      b.type === 'p'
        ? plain(b.children)
        : b.items.map((it, i) => `${b.type === 'ul' ? '•' : `${b.start + i}.`} ${plain(it)}`).join('\n')
    )
    .join('\n');
}

// ---------------------------------------------------------------------------------------------
// Éditeur visuel : du DOM (champ « contenteditable ») vers le texte à marqueurs
// ---------------------------------------------------------------------------------------------

/** Ce que le sérialiseur lit d'un nœud DOM (un vrai nœud convient ; des objets simples servent aux tests). */
export interface DomLike {
  nodeName: string;
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<DomLike>;
  /** Style en ligne (certains navigateurs mettent un <span style="…"> au lieu de <b>, <i>, <u>). */
  style?: { textDecoration?: string; textDecorationLine?: string; fontWeight?: string; fontStyle?: string };
}

const TEXT_NODE = 3;
const MARKERS: Record<string, string> = { B: '**', STRONG: '**', I: '_', EM: '_', U: '++' };
const BLOCKS = new Set(['DIV', 'P', 'UL', 'OL', 'LI']);

/** Contenu en ligne (texte, gras, italique, souligné, retours à la ligne) d'un nœud. */
function inlineText(node: DomLike): string {
  if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/g, ' ');
  if (node.nodeName === 'BR') return '\n';
  const inner = Array.from(node.childNodes).map(inlineText).join('');
  if (!inner.trim()) return inner;
  // Balise de style, puis style en ligne (ordre fixe pour des marqueurs stables)
  const marks = new Set<string>();
  if (MARKERS[node.nodeName]) marks.add(MARKERS[node.nodeName]);
  const st = node.style;
  if (st) {
    const weight = st.fontWeight ?? '';
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) marks.add('**');
    if ((st.fontStyle ?? '').includes('italic')) marks.add('_');
    if (`${st.textDecoration ?? ''} ${st.textDecorationLine ?? ''}`.includes('underline')) marks.add('++');
  }
  return [...marks].reduce((acc, m) => `${m}${acc}${m}`, inner);
}

/** Sérialise le contenu d'un champ visuel en texte à marqueurs (l'inverse de parseRichText). */
export function serializeDom(root: DomLike): string {
  const lines: string[] = [];
  let buffer = '';
  const flush = () => {
    // un seul retour final est la fin de la ligne, pas une ligne vide
    if (buffer !== '') lines.push(...buffer.replace(/\n$/, '').split('\n'));
    buffer = '';
  };
  const block = (node: DomLike) => {
    // « <div><br></div> » est une ligne vide, pas deux
    const text = Array.from(node.childNodes).map(inlineText).join('').replace(/\n$/, '');
    lines.push(...text.split('\n'));
  };
  const list = (node: DomLike) => {
    let n = 0;
    for (const li of Array.from(node.childNodes)) {
      if (li.nodeName !== 'LI') continue;
      n += 1;
      const text = Array.from(li.childNodes).map(inlineText).join('').replace(/\n$/, '');
      lines.push(`${node.nodeName === 'UL' ? '- ' : `${n}. `}${text.replace(/\n/g, ' ')}`);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeName === 'UL' || child.nodeName === 'OL') {
      flush();
      list(child);
    } else if (BLOCKS.has(child.nodeName)) {
      flush();
      block(child);
    } else {
      buffer += inlineText(child);
    }
  }
  flush();
  return lines.join('\n').replace(/\n+$/, '');
}
