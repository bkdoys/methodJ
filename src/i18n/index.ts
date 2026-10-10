import { useSyncExternalStore } from 'react';
import en from './en';

/**
 * Traduction maison : le français est la langue des sources, il sert de clé.
 * `t('Texte en français')` renvoie le texte tel quel en français et sa traduction en anglais ; une clé sans
 * traduction retombe sur le français. Les valeurs variables s'écrivent `{nom}` : `t('{n} cours', { n: 3 })`.
 */
export type Lang = 'fr' | 'en';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'medj_lang_v1';

/** Une installation qui a déjà des données (même sans langue enregistrée) reste en français : on ne la bascule pas. */
function hasExistingAppData(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith('medj_courses_v1')) return true;
  }
  return false;
}

/** Langue du navigateur : le premier choix entre français et anglais, sinon français. */
function browserLang(): Lang {
  const list = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of list) {
    const code = (l ?? '').toLowerCase();
    if (code.startsWith('fr')) return 'fr';
    if (code.startsWith('en')) return 'en';
  }
  return 'fr';
}

/**
 * Langue enregistrée sur l'appareil. À la toute première ouverture (aucune donnée, aucune langue), on suit la
 * langue du navigateur puis on l'enregistre, pour que le choix ne change pas ensuite.
 */
function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'fr') return v;
    const detected = hasExistingAppData() ? 'fr' : browserLang();
    localStorage.setItem(STORAGE_KEY, detected);
    return detected;
  } catch {
    return 'fr';
  }
}

let current: Lang = readStoredLang();
const listeners = new Set<() => void>();

const applyToDocument = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
};
applyToDocument();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // stockage indisponible : la langue vaut pour la session
  }
  applyToDocument();
  listeners.forEach((fn) => fn());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** À appeler une fois à la racine : la page se redessine quand la langue change. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

/** Code de langue pour `Intl` / `toLocaleString`. */
export function getLocale(): string {
  return current === 'en' ? 'en-GB' : 'fr-FR';
}

export type TParams = Record<string, string | number>;

export function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function t(key: string, params?: TParams): string {
  const text = current === 'en' ? en[key] ?? key : key;
  return interpolate(text, params);
}

/**
 * Marque un texte français rangé dans une table de données (libellés d'options, etc.) : renvoie le texte tel quel
 * et permet de le retrouver pour la traduction ; on le traduit à l'affichage avec `t(...)`.
 */
export const T = (key: string): string => key;

/** Choisit le singulier ou le pluriel selon la langue (français : 0 et 1 au singulier ; anglais : tout sauf 1 au pluriel). */
export function plural(n: number, one: string, other: string, params?: TParams): string {
  const isOne = current === 'en' ? n === 1 : n <= 1;
  return t(isOne ? one : other, { n, ...params });
}
