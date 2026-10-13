import { Subject } from '../types';
import { getChildFolders, getFolders } from './folders';

// Couleur d'un dossier : celle qu'on lui a donnée, sinon une nuance automatique de la couleur de sa discipline
// (dossiers d'un même niveau répartis du plus sombre au plus clair, avec un léger décalage de teinte) ; un sous-dossier
// dérive de la couleur de son dossier parent, avec un écart plus faible.

export interface Hsl {
  /** Teinte, 0 à 360. */
  h: number;
  /** Saturation, 0 à 1. */
  s: number;
  /** Luminosité, 0 à 1. */
  l: number;
}

/** `#rrggbb` (les couleurs de l'application sont toutes dans ce format). */
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

export function hexToHsl(hex: string): Hsl | null {
  if (!isHexColor(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Écart de nuance maximal par niveau : luminosité (0 à 1) et teinte (degrés). */
export const SHADE_SPREAD = {
  folder: { l: 0.16, h: 16 },
  subfolder: { l: 0.1, h: 10 },
} as const;

/** Lisible dans un créneau (texte clair ou sombre choisi selon la couleur) : on évite le presque noir et le presque blanc. */
const MIN_LIGHTNESS = 0.22;
const MAX_LIGHTNESS = 0.78;

/**
 * Nuance de `base` pour le `index`-ième frère sur `count` : du plus sombre (premier) au plus clair (dernier), la teinte
 * suivant le même sens. Un frère unique garde la couleur de base.
 */
export function shadeColor(base: string, index: number, count: number, spread: { l: number; h: number }): string {
  const hsl = hexToHsl(base);
  if (!hsl) return base;
  const t = count <= 1 ? 0 : (2 * index) / (count - 1) - 1; // -1 … +1
  return hslToHex({
    h: (hsl.h + t * spread.h + 360) % 360,
    s: hsl.s,
    l: Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, hsl.l + t * spread.l)),
  });
}

// Les disciplines ne sont jamais modifiées en place (chaque changement en crée une nouvelle) : un calcul par objet.
const cache = new WeakMap<Subject, Map<string, string>>();

/** Couleur de chaque dossier de la discipline (id -> `#rrggbb`), calculée une fois. */
export function folderColorMap(subject: Subject): Map<string, string> {
  const cached = cache.get(subject);
  if (cached) return cached;
  const folders = getFolders(subject);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Map<string, string>();

  const resolve = (id: string, depth: number): string => {
    const known = out.get(id);
    if (known) return known;
    const folder = byId.get(id);
    if (!folder) return subject.color;
    let color: string;
    if (isHexColor(folder.color)) {
      color = folder.color;
    } else {
      // Un parent qui n'existe plus ou une boucle (données abîmées) : on retombe sur la discipline
      const parentId = folder.parentId && byId.has(folder.parentId) && depth < 2 ? folder.parentId : undefined;
      const siblings = getChildFolders(subject, folder.parentId);
      const index = Math.max(0, siblings.findIndex((f) => f.id === id));
      color = shadeColor(
        parentId ? resolve(parentId, depth + 1) : subject.color,
        index,
        siblings.length,
        parentId ? SHADE_SPREAD.subfolder : SHADE_SPREAD.folder
      );
    }
    out.set(id, color);
    return color;
  };
  folders.forEach((f) => resolve(f.id, 0));
  cache.set(subject, out);
  return out;
}

/** Couleur d'un dossier ; celle de la discipline si `folderId` est absent ou inconnu. */
export function getFolderColor(subject: Subject | undefined, folderId: string | undefined): string | undefined {
  if (!subject) return undefined;
  if (!folderId) return subject.color;
  return folderColorMap(subject).get(folderId) ?? subject.color;
}
