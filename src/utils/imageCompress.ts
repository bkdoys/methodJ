/**
 * Compression d'une image avant de l'ajouter à une carte : réduite à `MAX_SIDE` px sur le grand côté, encodée en
 * WebP (JPEG si le navigateur ne sait pas encoder le WebP), qualité baissée jusqu'à passer sous `TARGET_BYTES`.
 * Une photo d'iPad (plusieurs Mo) tombe ainsi vers 150-300 Ko ; la règle Storage refuse tout au-delà de 1 Mo.
 */

export const MAX_SIDE = 1600;
export const TARGET_BYTES = 900 * 1024;
/** Qualités essayées dans l'ordre, puis on réduit encore la taille si ça ne suffit pas. */
export const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5];

/** Dimensions après réduction (jamais agrandie), arrondies au pixel. */
export function fitSize(width: number, height: number, maxSide: number = MAX_SIDE): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export type CompressedImage = { blob: Blob; width: number; height: number };

export class ImageCompressError extends Error {}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Safari ancien, ou format que createImageBitmap refuse : on passe par <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new ImageCompressError('decode');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Image compressée prête à enregistrer ; `ImageCompressError` si le fichier n'est pas une image lisible. */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const img = await decode(file);
  try {
    let maxSide = MAX_SIDE;
    let last: CompressedImage | null = null;
    // Deux passes au plus : la taille normale, puis plus petite si même la qualité basse dépasse
    for (let pass = 0; pass < 2; pass++) {
      const { width, height } = fitSize(img.width, img.height, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageCompressError('canvas');
      // Fond blanc : un schéma PNG transparent ne devient pas noir en JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0, width, height);
      for (const q of QUALITY_STEPS) {
        let blob = await toBlob(canvas, 'image/webp', q);
        // Safari sans encodeur WebP renvoie un PNG : on repasse en JPEG
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q + 0.02);
        if (!blob || blob.type !== 'image/jpeg' && blob.type !== 'image/webp') throw new ImageCompressError('encode');
        last = { blob, width, height };
        if (blob.size <= TARGET_BYTES) return last;
      }
      maxSide = Math.round(maxSide * 0.7);
    }
    if (last && last.blob.size <= 1024 * 1024) return last;
    throw new ImageCompressError('too-big');
  } finally {
    img.close();
  }
}
