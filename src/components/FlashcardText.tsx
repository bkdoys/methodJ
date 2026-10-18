import React from 'react';
import { RenderCloze, renderInline, RichBlocks } from './RichNote';
import { parseRichText } from '../utils/richText';

const ANSWER = 'rounded px-1 bg-teal-100 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100 font-semibold';
const MASK = 'rounded px-1.5 bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 font-semibold';

/**
 * Texte d'une carte avec sa mise en forme (gras, italique, souligné, exposant, indice, listes ; voir utils/richText.ts),
 * retours à la ligne conservés. Texte à trous : `clozeNumber` absent = tous les trous révélés (liste de l'éditeur) ;
 * présent = ce trou masqué ou révélé selon `revealed`, les autres en clair (lecteur).
 */
export const FlashcardText: React.FC<{
  text: string;
  cloze?: boolean;
  clozeNumber?: number;
  revealed?: boolean;
  className?: string;
}> = ({ text, cloze = false, clozeNumber, revealed = false, className = '' }) => {
  const cls = `whitespace-pre-wrap break-words ${className}`;

  const renderCloze: RenderCloze = (node, inner, key) => {
    if (clozeNumber === undefined) {
      return (
        <mark key={key} className={ANSWER} title={`c${node.n}`}>
          {inner}
        </mark>
      );
    }
    if (node.n !== clozeNumber) return <React.Fragment key={key}>{inner}</React.Fragment>;
    if (revealed) {
      return (
        <mark key={key} className={ANSWER}>
          {inner}
        </mark>
      );
    }
    return (
      <mark key={key} className={MASK}>
        {`[${node.hint ?? '…'}]`}
      </mark>
    );
  };

  // Un seul paragraphe (le cas courant) : rendu en ligne, comme avant la mise en forme
  const blocks = parseRichText(text, { cloze });
  if (blocks.length === 1 && blocks[0].type === 'p') {
    return <span className={cls}>{renderInline(blocks[0].children, cloze ? renderCloze : undefined)}</span>;
  }
  return (
    <span className={cls}>
      <RichBlocks text={text} cloze={cloze} renderCloze={cloze ? renderCloze : undefined} />
    </span>
  );
};
