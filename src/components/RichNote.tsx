import React from 'react';
import { Block, Inline, parseRichText } from '../utils/richText';

/** Un trou (`{{cN::…}}`) : l'appelant décide de son rendu (carte de révision) ; absent, le contenu s'affiche tel quel. */
export type RenderCloze = (node: Extract<Inline, { type: 'cloze' }>, children: React.ReactNode, key: number) => React.ReactNode;

export const renderInline = (nodes: Inline[], renderCloze?: RenderCloze): React.ReactNode =>
  nodes.map((n, i) => {
    if (n.type === 'text') return <React.Fragment key={i}>{n.text}</React.Fragment>;
    if (n.type === 'sup') return <sup key={i}>{n.text}</sup>;
    if (n.type === 'sub') return <sub key={i}>{n.text}</sub>;
    if (n.type === 'frac') {
      // Fraction empilée, alignée sur le milieu de la ligne ; le trait prend la couleur du texte
      return (
        <span key={i} className="inline-flex flex-col items-center align-middle text-center leading-tight mx-0.5 text-[0.9em]">
          <span className="border-b border-current px-1">{renderInline(n.num, renderCloze)}</span>
          <span className="px-1">{renderInline(n.den, renderCloze)}</span>
        </span>
      );
    }
    if (n.type === 'cloze') {
      const inner = renderInline(n.children, renderCloze);
      return renderCloze ? renderCloze(n, inner, i) : <React.Fragment key={i}>{inner}</React.Fragment>;
    }
    if (n.type === 'bold') return <strong key={i}>{renderInline(n.children, renderCloze)}</strong>;
    if (n.type === 'italic') return <em key={i}>{renderInline(n.children, renderCloze)}</em>;
    return <u key={i}>{renderInline(n.children, renderCloze)}</u>;
  });

const renderBlock = (b: Block, i: number, renderCloze?: RenderCloze): React.ReactNode => {
  if (b.type === 'ul') {
    return (
      <ul key={i} className="list-disc pl-5">
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it, renderCloze)}</li>
        ))}
      </ul>
    );
  }
  if (b.type === 'ol') {
    return (
      <ol key={i} start={b.start} className="list-decimal pl-5">
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it, renderCloze)}</li>
        ))}
      </ol>
    );
  }
  return (
    <div key={i} className="min-h-[1em] whitespace-pre-wrap">
      {renderInline(b.children, renderCloze)}
    </div>
  );
};

/** Blocs d'un texte à marqueurs (sans conteneur) : notes, cartes. */
export const RichBlocks: React.FC<{ text: string; cloze?: boolean; renderCloze?: RenderCloze }> = ({ text, cloze = false, renderCloze }) => (
  <>{parseRichText(text, { cloze }).map((b, i) => renderBlock(b, i, renderCloze))}</>
);

/** Affiche une note avec sa mise en forme légère (gras, italique, souligné, exposant, indice, listes). */
export const RichNote: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <div className={`leading-relaxed ${className}`}>
    <RichBlocks text={text} />
  </div>
);
