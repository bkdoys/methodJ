import { addDrawingBlob, loadDrawingBlob } from './media';
import { decodeDrawingSource, DrawingSource, encodeDrawingSource } from './drawingCodec';

/**
 * Un dessin enregistré n'est qu'une image à plat ; pour pouvoir le modifier ensuite, ses éléments (et la photo dessous,
 * recopiée) sont gardés à côté du fichier de l'image : sur l'appareil (clé `draw:<id de l'image>` du magasin de
 * médias) et, connecté, dans Firebase Storage (`users/{uid}/drawings/{id}`, voir storage.rules), par la même file
 * d'envoi que les images. Un dessin trop gros pour la règle (3 Mo) reste sur l'appareil.
 */
export type { DrawingSource } from './drawingCodec';

export async function saveDrawingSource(imageId: string, source: DrawingSource): Promise<void> {
  await addDrawingBlob(imageId, await encodeDrawingSource(source));
}

export async function loadDrawingSource(imageId: string): Promise<DrawingSource | null> {
  const blob = await loadDrawingBlob(imageId);
  return blob ? decodeDrawingSource(blob) : null;
}
