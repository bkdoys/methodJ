import React, { TextareaHTMLAttributes, useEffect, useLayoutEffect, useRef } from 'react';

interface AutoGrowTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Hauteur minimale, en lignes. */
  minRows?: number;
  /** Au-delà, la zone défile au lieu de grandir. */
  maxHeight?: string;
  /** Prend le focus à l'ouverture, curseur à la fin du texte. */
  focusAtEnd?: boolean;
}

/** Zone de saisie qui s'agrandit avec son contenu (utile pour les notes longues). */
export const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  minRows = 5,
  maxHeight = '60vh',
  focusAtEnd = false,
  value,
  style,
  ...props
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, minRows]);

  useEffect(() => {
    const el = ref.current;
    if (!focusAtEnd || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusAtEnd]);

  return <textarea ref={ref} rows={minRows} value={value} style={{ maxHeight, ...style }} {...props} />;
};
