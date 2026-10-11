import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Brain,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Headphones,
  HelpCircle,
  Layers,
  Link2,
  NotebookPen,
  Play,
} from 'lucide-react';
import { CourseLink, LinkType } from '../types';
import { T, t } from '../i18n';
import { PRESET_COURSE_COLORS } from './colorUtils';

export const MAX_LINKS_PER_COURSE = 30;
export const MAX_LINK_TYPES = 40;
const MAX_URL_LENGTH = 2000;
const MAX_NAME_LENGTH = 40;

/** Icônes proposées pour un type de lien (clé stockée dans `LinkType.icon`). */
export const LINK_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  notes: NotebookPen,
  cards: Layers,
  quiz: HelpCircle,
  video: Play,
  doc: FileText,
  folder: Folder,
  brain: Brain,
  grad: GraduationCap,
  audio: Headphones,
  web: Globe,
  link: Link2,
};
export const LINK_ICON_KEYS = Object.keys(LINK_ICONS);
export const LINK_COLORS = PRESET_COURSE_COLORS.map((c) => c.hex);

/** Types d'origine. Les noms passent par `t()` à l'affichage (`T` marque le texte pour la traduction). */
export const DEFAULT_LINK_TYPES: LinkType[] = [
  { id: 'lt_course', name: T('Cours'), icon: 'book', color: '#0d9488' },
  { id: 'lt_notes', name: T('Notes'), icon: 'notes', color: '#d97706' },
  { id: 'lt_cards', name: T('Flashcards'), icon: 'cards', color: '#7c3aed' },
  { id: 'lt_quiz', name: T('QCM / annales'), icon: 'quiz', color: '#2563eb' },
  { id: 'lt_video', name: T('Vidéo'), icon: 'video', color: '#e11d48' },
  { id: 'lt_other', name: T('Autre'), icon: 'link', color: '#64748b' },
];

const FALLBACK_TYPE: LinkType = DEFAULT_LINK_TYPES[DEFAULT_LINK_TYPES.length - 1];

export function getLinkTypes(settings: { linkTypes?: LinkType[] }): LinkType[] {
  return settings.linkTypes && settings.linkTypes.length > 0 ? settings.linkTypes : DEFAULT_LINK_TYPES;
}

/** Type d'un lien ; un type supprimé ou inconnu s'affiche comme « Autre ». */
export function resolveLinkType(types: LinkType[], typeId: string): LinkType {
  return types.find((x) => x.id === typeId) ?? FALLBACK_TYPE;
}

export function linkTypeName(type: LinkType): string {
  return t(type.name);
}

export function getLinkIcon(type: LinkType): LucideIcon {
  return LINK_ICONS[type.icon] ?? Link2;
}

/** Adresse saisie → URL http(s) propre, ou null. Sans schéma on suppose https ; javascript:, data:, etc. sont refusés. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const HOST_LABELS: [RegExp, string][] = [
  [/^drive\.google\.com$/, 'Google Drive'],
  [/^docs\.google\.com$/, 'Google Docs'],
  [/^(www\.)?notion\.(so|site)$/, 'Notion'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)quizlet\.com$/, 'Quizlet'],
  [/(^|\.)ankiweb\.net$/, 'AnkiWeb'],
  [/(^|\.)dropbox\.com$/, 'Dropbox'],
];

/** Nom lisible du site d'un lien (« Google Drive », sinon le domaine sans « www. »). */
export function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HOST_LABELS.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Type proposé d'après l'adresse (vidéo, flashcards…) ; undefined si on ne sait pas. */
export function guessLinkTypeId(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/youtube\.com$|^youtu\.be$|vimeo\.com$/.test(host)) return 'lt_video';
    if (/quizlet\.com$|ankiweb\.net$/.test(host)) return 'lt_cards';
  } catch {
    // adresse invalide : pas de suggestion
  }
  return undefined;
}

export function linkLabel(link: CourseLink): string {
  return link.label?.trim() || hostLabel(link.url);
}

export function newLinkId(): string {
  return `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newLinkTypeId(): string {
  return `lt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Ajoute un lien (adresse validée). Renvoie la liste inchangée si l'adresse est invalide, déjà présente ou si la limite est atteinte. */
export function addCourseLink(
  links: CourseLink[] | undefined,
  input: { url: string; typeId: string; label?: string }
): CourseLink[] {
  const list = links ?? [];
  const url = normalizeUrl(input.url);
  if (!url || list.length >= MAX_LINKS_PER_COURSE || list.some((l) => l.url === url)) return list;
  const label = input.label?.trim().slice(0, 80);
  return [...list, { id: newLinkId(), url, typeId: input.typeId, ...(label ? { label } : {}) }];
}

/** Ajoute un type (nom unique, insensible à la casse). `id` est celui du type créé, ou de l'existant homonyme. */
export function addLinkType(
  types: LinkType[],
  input: { name: string; icon: string; color: string }
): { types: LinkType[]; id: string | null } {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return { types, id: null };
  const same = types.find((x) => linkTypeName(x).toLowerCase() === name.toLowerCase());
  if (same) return { types, id: same.id };
  if (types.length >= MAX_LINK_TYPES) return { types, id: null };
  const id = newLinkTypeId();
  return { types: [...types, { id, name, icon: LINK_ICONS[input.icon] ? input.icon : 'link', color: input.color }], id };
}
