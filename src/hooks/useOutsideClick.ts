import { useEffect, useRef } from 'react';

export interface OutsideClickConfig<T> {
  isInside: (target: T) => boolean;
  onOutside: () => void;
  /** Identifie ce qui est en cours d'édition (ex. l'id du cours). */
  key?: unknown;
}

/**
 * Appelle `onOutside` quand un clic commence ET finit hors de la zone.
 * Exiger les deux évite de fermer à la fin d'une sélection de texte commencée dans la zone.
 * Si `key` a changé entre l'appui et le clic (le clic vient d'ouvrir un autre éditeur),
 * on ne ferme rien. Logique pure, testée sans navigateur.
 */
export function createOutsideClickTracker<T>(getConfig: () => OutsideClickConfig<T>) {
  let pressedOutside = false;
  let pressedKey: unknown;
  return {
    down(target: T) {
      const cfg = getConfig();
      pressedOutside = !cfg.isInside(target);
      pressedKey = cfg.key;
    },
    click(target: T) {
      const cfg = getConfig();
      if (pressedOutside && !cfg.isInside(target) && cfg.key === pressedKey) cfg.onOutside();
      pressedOutside = false;
    },
  };
}

export function useOutsideClick(
  enabled: boolean,
  isInside: (target: Element) => boolean,
  onOutside: () => void,
  key?: unknown
) {
  // Toujours la dernière version des callbacks, sans ré-abonner les écouteurs à chaque rendu
  const latest = useRef<OutsideClickConfig<Element>>({ isInside, onOutside, key });
  latest.current = { isInside, onOutside, key };

  useEffect(() => {
    if (!enabled) return;
    const tracker = createOutsideClickTracker<Element>(() => latest.current);
    const onDown = (e: Event) => {
      if (e.target instanceof Element) tracker.down(e.target);
    };
    const onClick = (e: Event) => {
      if (e.target instanceof Element) tracker.click(e.target);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick);
    };
  }, [enabled]);
}
