/**
 * Petit écran (téléphone) : moins de 640 px de large, ou écran tactile peu haut (téléphone en paysage).
 * Jamais un iPad (820 px de large au plus étroit) ni un ordinateur. Même requête que la variante CSS `phone:`
 * de src/index.css : changer l'une, changer l'autre.
 */
export const PHONE_QUERY = '(max-width: 639.98px), (max-height: 500px) and (pointer: coarse)';

export function isPhoneScreen(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;
  } catch {
    return false;
  }
}
