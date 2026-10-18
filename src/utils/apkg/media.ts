import type { ApkgPlan } from './convert';

// Images d'un paquet Anki : lues dans l'archive, puis confiées à la chaîne habituelle de l'appli (compression,
// stockage sur l'appareil, envoi dans le cloud) par la fonction `store` de l'appelant.

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/** Type MIME d'après l'extension du nom de fichier ; undefined si ce n'est pas une image connue. */
export function imageMime(name: string): string | undefined {
  return TYPES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
}

/** Noms des images citées par les cours choisis du plan, sans doublon. */
export function imagesOfPlan(plan: ApkgPlan, selected: ReadonlySet<string>): string[] {
  const names = new Set<string>();
  for (const course of plan.courses) {
    if (!selected.has(course.key)) continue;
    for (const card of course.cards) {
      if (card.frontImageRef) names.add(card.frontImageRef);
      if (card.backImageRef) names.add(card.backImageRef);
    }
  }
  return [...names];
}

export interface StoreImagesOptions {
  /** Images traitées en même temps (défaut 3 : la compression décode des images entières). */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  /** Passe à `true` pour s'arrêter après les images en cours. */
  isCancelled?: () => boolean;
}

export interface StoredImages {
  /** Nom de fichier du paquet → id de média. */
  ids: Map<string, string>;
  /** Images illisibles, absentes ou refusées. */
  failed: string[];
  cancelled: boolean;
}

export async function storePackageImages(
  names: string[],
  read: (name: string) => Uint8Array | null,
  store: (blob: Blob) => Promise<string | null>,
  options: StoreImagesOptions = {}
): Promise<StoredImages> {
  const ids = new Map<string, string>();
  const failed: string[] = [];
  const total = names.length;
  let next = 0;
  let done = 0;
  let cancelled = false;

  const worker = async () => {
    while (next < total) {
      if (options.isCancelled?.()) {
        cancelled = true;
        return;
      }
      const name = names[next++];
      const type = imageMime(name);
      const bytes = type ? read(name) : null;
      let id: string | null = null;
      if (bytes && type) {
        try {
          id = await store(new Blob([bytes as BlobPart], { type }));
        } catch {
          id = null;
        }
      }
      if (id) ids.set(name, id);
      else failed.push(name);
      options.onProgress?.(++done, total);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 3, total || 1)) }, worker));
  return { ids, failed, cancelled };
}
