/**
 * Met un créneau du planning en évidence quelques secondes (halo clignotant) et le fait défiler dans la vue.
 * Le bloc est repéré par `data-rev-id` ; il peut n'être monté qu'après le changement de vue ou de jour,
 * on réessaie donc brièvement.
 */
export function flashSlot(revisionId: string, attempts = 12): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-rev-id="${CSS.escape(revisionId)}"]`);
  if (!el) {
    if (attempts > 0) window.setTimeout(() => flashSlot(revisionId, attempts - 1), 80);
    return;
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('slot-flash');
  void el.offsetWidth; // relance l'animation si on clique deux fois de suite
  el.classList.add('slot-flash');
  window.setTimeout(() => el.classList.remove('slot-flash'), 2600);
}
