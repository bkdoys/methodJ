import React from 'react';
import { Block, Inline, parseRichText } from '../utils/richText';

const renderInline = (nodes: Inline[]): React.ReactNode =>
  nodes.map((n, i) => {
    if (n.type === 'text') return <React.Fragment key={i}>{n.text}</React.Fragment>;
    if (n.type === 'bold') return <strong key={i}>{renderInline(n.children)}</strong>;
    if (n.type === 'italic') return <em key={i}>{renderInline(n.children)}</em>;
    return <u key={i}>{renderInline(n.children)}</u>;
  });

const renderBlock = (b: Block, i: number): React.ReactNode => {
  if (b.type === 'ul') {
    return (
      <ul key={i} className="list-disc pl-5">
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ul>
    );
  }
  if (b.type === 'ol') {
    return (
      <ol key={i} start={b.start} className="list-decimal pl-5">
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ol>
    );
  }
  return (
    <div key={i} className="min-h-[1em] whitespace-pre-wrap">
      {renderInline(b.children)}
    </div>
  );
};

/** Affiche une note avec sa mise en forme légère (gras, italique, souligné, listes). */
export const RichNote: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <div className={`leading-relaxed ${className}`}>{parseRichText(text).map(renderBlock)}</div>
);
