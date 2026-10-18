import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  /** Hauteur de départ, en lignes (le champ ne descend jamais en dessous). */
  minRows?: number;
  /** Au-delà, le champ défile au lieu de grandir encore (valeur CSS). */
  maxHeight?: string;
};

/**
 * Zone de texte qui grandit avec son contenu, dans la limite de `maxHeight`, puis défile. La hauteur est recalculée à
 * chaque frappe et quand la largeur change (retour à la ligne différent après un redimensionnement de la fenêtre).
 */
export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, Props>(function AutoTextarea(
  { minRows = 3, maxHeight = 'min(24rem, 50vh)', style, className = '', value, onChange, ...rest },
  forwardedRef
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    },
    [forwardedRef]
  );

  const fit = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    // « auto » d'abord : sinon la hauteur ne pourrait que croître
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(fit, [fit, value, minRows]);

  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <textarea
      {...rest}
      ref={setRef}
      value={value}
      rows={minRows}
      onChange={onChange}
      className={`resize-none overflow-y-auto ${className}`}
      style={{ maxHeight, ...style }}
    />
  );
});
