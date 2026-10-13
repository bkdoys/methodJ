import React from 'react';
import { parseCloze, renderCloze } from '../utils/flashcards';

const ANSWER = 'rounded px-1 bg-teal-100 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100 font-semibold';
const MASK = 'rounded px-1.5 bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 font-semibold';

/**
 * Texte d'une carte, retours à la ligne conservés. Texte à trous : `clozeNumber` absent = tous les trous révélés
 * (liste de l'éditeur) ; présent = ce trou masqué ou révélé selon `revealed`, les autres en clair (lecteur).
 */
export const FlashcardText: React.FC<{
  text: string;
  cloze?: boolean;
  clozeNumber?: number;
  revealed?: boolean;
  className?: string;
}> = ({ text, cloze = false, clozeNumber, revealed = false, className = '' }) => {
  const cls = `whitespace-pre-wrap break-words ${className}`;
  if (!cloze) return <span className={cls}>{text}</span>;

  if (clozeNumber === undefined) {
    return (
      <span className={cls}>
        {parseCloze(text).map((p, i) =>
          p.kind === 'text' ? (
            <React.Fragment key={i}>{p.text}</React.Fragment>
          ) : (
            <mark key={i} className={ANSWER} title={`c${p.n}`}>
              {p.answer}
            </mark>
          )
        )}
      </span>
    );
  }

  return (
    <span className={cls}>
      {renderCloze(text, clozeNumber, revealed).map((s, i) =>
        s.role === 'plain' ? (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ) : (
          <mark key={i} className={s.role === 'answer' ? ANSWER : MASK}>
            {s.role === 'mask' ? `[${s.text}]` : s.text}
          </mark>
        )
      )}
    </span>
  );
};
