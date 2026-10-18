// Lecture minimale de protobuf : les paquets Anki n'en contiennent que deux petits messages (la version du paquet et la
// liste des médias), pas besoin d'une bibliothèque.

export interface PbField {
  field: number;
  /** Entier (varint) ou octets (champ à longueur, imbriqué ou texte). */
  value: number | Uint8Array;
}

/** Champs d'un message, dans l'ordre ; ceux de largeur fixe (types 1 et 5) sont sautés. Lève une erreur si le message est tronqué. */
export function readProtobuf(bytes: Uint8Array): PbField[] {
  const out: PbField[] = [];
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let scale = 1;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined) throw new Error('protobuf tronqué');
      result += (b & 0x7f) * scale;
      if (!(b & 0x80)) return result;
      scale *= 128;
    }
  };
  while (i < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) out.push({ field, value: varint() });
    else if (wire === 2) {
      const length = varint();
      if (i + length > bytes.length) throw new Error('protobuf tronqué');
      out.push({ field, value: bytes.subarray(i, i + length) });
      i += length;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else throw new Error(`type de champ protobuf inconnu (${wire})`);
  }
  return out;
}

const utf8 = new TextDecoder('utf-8');

/** Version du paquet (champ 1 du fichier `meta`) : 1 et 2 = anciens formats, 3 = format récent ; 0 si absente. */
export function packageVersion(meta: Uint8Array | undefined): number {
  if (!meta) return 0;
  try {
    const f = readProtobuf(meta).find((x) => x.field === 1);
    return typeof f?.value === 'number' ? f.value : 0;
  } catch {
    return 0;
  }
}

/** Noms des fichiers médias du format récent : le n-ième nom est celui du fichier `n` de l'archive. */
export function mediaNamesFromProtobuf(bytes: Uint8Array): string[] {
  const names: string[] = [];
  for (const entry of readProtobuf(bytes)) {
    if (entry.field !== 1 || typeof entry.value === 'number') continue;
    const name = readProtobuf(entry.value).find((f) => f.field === 1);
    names.push(name && typeof name.value !== 'number' ? utf8.decode(name.value) : '');
  }
  return names;
}

/** Type de note « à trous » ? C'est le champ 1 (`kind`) de la configuration du type de note : 1 = trous. */
export function isClozeNotetypeConfig(config: Uint8Array | null | undefined): boolean {
  if (!config) return false;
  try {
    const kind = readProtobuf(config).find((f) => f.field === 1);
    return kind?.value === 1;
  } catch {
    return false;
  }
}
