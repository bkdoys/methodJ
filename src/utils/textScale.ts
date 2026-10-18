import { AppSettings } from '../types';
import { t } from '../i18n';

/**
 * Taille du texte de l'interface : quatre paliers appliqués à la taille de base de la page (`html`). Tous les textes
 * sont en rem (aucune taille en pixels : un test le garde), donc tout suit, des étiquettes de 9 px au titre.
 * Les points de rupture en rem des media queries ne bougent pas (ils suivent la taille par défaut du navigateur).
 */
export type TextScale = NonNullable<AppSettings['textScale']>;

export const TEXT_SCALES: { id: TextScale; factor: number; label: string }[] = [
  { id: 'small', factor: 0.9, get label() { return t('Petite'); } },
  { id: 'normal', factor: 1, get label() { return t('Normale'); } },
  { id: 'large', factor: 1.15, get label() { return t('Grande'); } },
  { id: 'xlarge', factor: 1.3, get label() { return t('Très grande'); } },
];

/** Palier enregistré, ramené à une valeur valide (réglages anciens ou cloud sans ce champ = normal). */
export function getTextScale(settings: Partial<Pick<AppSettings, 'textScale'>>): TextScale {
  return TEXT_SCALES.some((s) => s.id === settings.textScale) ? (settings.textScale as TextScale) : 'normal';
}

/** Valeur CSS de `font-size` pour `html` : vide pour le palier normal (taille choisie par le navigateur). */
export function textScaleCss(scale: TextScale): string {
  const factor = TEXT_SCALES.find((s) => s.id === scale)?.factor ?? 1;
  return factor === 1 ? '' : `${Math.round(factor * 100)}%`;
}

// Copie sur l'appareil, lue au démarrage avant que les réglages ne soient chargés (pas de saut de taille au lancement)
const STORAGE_KEY = 'medj_text_scale_v1';

/** Applique le palier à la page ; `remember` le garde pour le prochain démarrage. */
export function applyTextScale(scale: TextScale, remember = true): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = textScaleCss(scale);
  // Lu par la variante `nav-full:` (voir index.css) : les seuils de la barre du haut suivent le palier
  if (scale === 'normal') delete document.documentElement.dataset.textScale;
  else document.documentElement.dataset.textScale = scale;
  if (!remember) return;
  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch {
    // stockage indisponible (navigation privée…) : la taille suit les réglages une fois chargés
  }
}

/** Au démarrage : reprend le dernier palier appliqué sur cet appareil. */
export function applyStoredTextScale(): void {
  try {
    applyTextScale(getTextScale({ textScale: localStorage.getItem(STORAGE_KEY) as TextScale | null as TextScale }), false);
  } catch {
    // rien à reprendre
  }
}
