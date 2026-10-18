import { htmlToText } from '../cardsImport';

// Champs de notes Anki : du HTML, avec des images (`<img src="nom.png">`) et des sons (`[sound:nom.mp3]`).

/** Résultat de l'analyse d'un champ : le texte, les images dans l'ordre et le nombre de sons ignorés. */
export interface FieldContent {
  text: string;
  /** Noms de fichiers d'images, dans l'ordre d'apparition (doublons conservés). */
  images: string[];
  sounds: number;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Nom de fichier tel qu'écrit dans le HTML (entités et pourcentages décodés). */
function fileName(raw: string): string {
  const withoutEntities = htmlToText(raw);
  try {
    return decodeURIComponent(withoutEntities);
  } catch {
    return withoutEntities;
  }
}

/** Images d'un champ (adresses web et données `data:` écartées : seuls les médias du paquet comptent). */
export function extractImages(html: string): string[] {
  const names: string[] = [];
  for (const tag of html.matchAll(IMG_TAG)) {
    const m = SRC_ATTR.exec(tag[0]);
    const raw = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    if (!raw || /^(https?:|data:|\/\/)/i.test(raw)) continue;
    names.push(fileName(raw));
  }
  return names;
}

/** Texte, images et sons d'un champ HTML. */
export function parseField(html: string): FieldContent {
  const images = extractImages(html);
  const sounds = (html.match(/\[sound:[^\]]*\]/g) ?? []).length;
  return { text: htmlToText(html.replace(IMG_TAG, '')), images, sounds };
}
