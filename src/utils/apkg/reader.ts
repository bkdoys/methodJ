import { unzipSync, type Unzipped } from 'fflate';
import { decompress as unzstd } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { isClozeNotetypeConfig, mediaNamesFromProtobuf } from './protobuf';

// Lecture d'un paquet Anki (.apkg) : une archive zip avec une base SQLite, la liste des médias et les médias eux-mêmes.
//   - ancien format (versions 1 et 2) : `collection.anki21` (ou `.anki2`), base du schéma 11 (types de notes et paquets
//     en JSON dans la table `col`), `media` = JSON { "0": "nom.png", … }, médias non compressés ;
//   - format récent (version 3, défaut d'Anki depuis la 2.1.50) : `collection.anki21b` compressé en zstd, schéma 18
//     (tables `notetypes`, `decks`…), `media` = protobuf compressé en zstd, chaque média compressé en zstd.
// Dans les deux cas `collection.anki2` peut n'être qu'un leurre (« mettez Anki à jour ») : on lit toujours le meilleur.

export interface AnkiDeck {
  id: number;
  /** Chemin avec « :: » entre les niveaux. */
  name: string;
}

export interface AnkiNotetype {
  id: number;
  name: string;
  /** Type « texte à trous » (et Image Occlusion, qui en est un). */
  cloze: boolean;
}

export interface AnkiNote {
  id: number;
  /** Id du type de note. */
  mid: number;
  fields: string[];
  tags: string;
}

export interface AnkiCard {
  id: number;
  nid: number;
  did: number;
  /** Numéro de la carte dans la note : recto/verso → 0 (et 1 pour le sens inverse), trous → numéro − 1. */
  ord: number;
  /** 0 nouvelle, 1 apprentissage, 2 révision, 3 réapprentissage. */
  type: number;
  /** 0 nouvelle, 1 apprentissage, 2 révision, 3 apprentissage en jours, -1 suspendue, -2 et -3 enterrées. */
  queue: number;
  due: number;
  /** Intervalle en jours (négatif : secondes, en apprentissage). */
  ivl: number;
  /** Facilité en millièmes (2500 = 250 %). */
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  /** JSON : l'état mémoire FSRS (`s` stabilité, `d` difficulté) quand l'utilisateur l'active dans Anki. */
  data: string;
}

export interface AnkiPackage {
  format: 'legacy' | 'latest';
  /** Création de la collection (secondes) : `due` des cartes de révision en est un nombre de jours. */
  crt: number;
  decks: Map<number, AnkiDeck>;
  notetypes: Map<number, AnkiNotetype>;
  notes: AnkiNote[];
  cards: AnkiCard[];
  /** Fichiers médias du paquet (noms d'origine). */
  mediaNames: string[];
  /** Octets d'un média, ou null s'il manque. Décompresse à la demande. */
  readMedia(name: string): Uint8Array | null;
  close(): void;
}

export class ApkgError extends Error {
  constructor(public code: 'not-zip' | 'no-collection' | 'bad-collection', message: string) {
    super(message);
  }
}

type Row = (number | string | Uint8Array | null)[];

function rows(db: Database, sql: string, params: (number | string)[] = []): Row[] {
  const stmt = db.prepare(sql);
  const out: Row[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) out.push(stmt.get() as Row);
  } finally {
    stmt.free();
  }
  return out;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Ouvre un paquet. `loadSql` charge SQLite (WASM) : dans le navigateur voir `loadSqlJs.ts`, en test `initSqlJs` direct.
 * Seuls les fichiers non numériques sont décompressés ici ; les médias le sont un par un dans `readMedia`.
 */
export async function readApkg(bytes: Uint8Array, loadSql: () => Promise<SqlJsStatic>): Promise<AnkiPackage> {
  let files: Unzipped;
  try {
    files = unzipSync(bytes, { filter: (f) => !/^\d+$/.test(f.name) });
  } catch {
    throw new ApkgError('not-zip', 'Ce fichier n\'est pas un paquet Anki (archive illisible).');
  }

  let dbBytes: Uint8Array | undefined;
  let latest = false;
  try {
    if (files['collection.anki21b']) {
      dbBytes = unzstd(files['collection.anki21b']);
      latest = true;
    } else dbBytes = files['collection.anki21'] ?? files['collection.anki2'];
  } catch {
    throw new ApkgError('bad-collection', 'La collection du paquet est illisible (fichier endommagé ?).');
  }
  if (!dbBytes) throw new ApkgError('no-collection', 'Aucune collection Anki dans ce fichier.');

  const SQL = await loadSql();
  let db: Database;
  try {
    db = new SQL.Database(dbBytes);
  } catch {
    throw new ApkgError('bad-collection', 'La collection du paquet est illisible (fichier endommagé ?).');
  }

  try {
    const col = rows(db, 'select crt, models, decks from col')[0];
    if (!col) throw new Error('table col vide');
    const crt = num(col[0]);

    const notes: AnkiNote[] = rows(db, 'select id, mid, flds, tags from notes').map((r) => ({
      id: num(r[0]),
      mid: num(r[1]),
      fields: text(r[2]).split('\x1f'),
      tags: text(r[3]).trim(),
    }));
    const cards: AnkiCard[] = rows(
      db,
      'select id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, data from cards'
    ).map((r) => ({
      id: num(r[0]),
      nid: num(r[1]),
      did: num(r[2]),
      ord: num(r[3]),
      type: num(r[4]),
      queue: num(r[5]),
      due: num(r[6]),
      ivl: num(r[7]),
      factor: num(r[8]),
      reps: num(r[9]),
      lapses: num(r[10]),
      left: num(r[11]),
      data: text(r[12]),
    }));

    const decks = new Map<number, AnkiDeck>();
    const notetypes = new Map<number, AnkiNotetype>();
    if (latest) {
      // Schéma 18 : on interroge par clé primaire (les index sur les noms utilisent un tri propre à Anki, inconnu de SQLite)
      for (const did of new Set(cards.map((c) => c.did))) {
        const r = rows(db, 'select name from decks where id = ?', [did])[0];
        if (r) decks.set(did, { id: did, name: text(r[0]).split('\x1f').join('::') });
      }
      for (const mid of new Set(notes.map((n) => n.mid))) {
        const r = rows(db, 'select name, config from notetypes where id = ?', [mid])[0];
        if (r) notetypes.set(mid, { id: mid, name: text(r[0]), cloze: isClozeNotetypeConfig(r[1] as Uint8Array) });
      }
    } else {
      // Schéma 11 : tout est en JSON dans la table `col`
      const models = JSON.parse(text(col[1]) || '{}') as Record<string, { id?: number | string; name?: string; type?: number }>;
      for (const [key, m] of Object.entries(models)) {
        const id = Number(m.id ?? key);
        notetypes.set(id, { id, name: m.name ?? '', cloze: m.type === 1 });
      }
      const jsonDecks = JSON.parse(text(col[2]) || '{}') as Record<string, { id?: number | string; name?: string }>;
      for (const [key, d] of Object.entries(jsonDecks)) {
        const id = Number(d.id ?? key);
        decks.set(id, { id, name: d.name ?? '' });
      }
    }

    // Médias : numéro de l'archive → nom d'origine
    const nameByIndex = new Map<string, string>();
    const mediaFile = files['media'];
    if (mediaFile) {
      try {
        if (latest) mediaNamesFromProtobuf(unzstd(mediaFile)).forEach((name, i) => name && nameByIndex.set(String(i), name));
        else {
          const map = JSON.parse(new TextDecoder().decode(mediaFile)) as Record<string, string>;
          Object.entries(map).forEach(([i, name]) => name && nameByIndex.set(i, name));
        }
      } catch {
        // liste de médias illisible : le paquet s'importe quand même, sans images
      }
    }
    const indexByName = new Map<string, string>([...nameByIndex].map(([i, name]) => [name, i]));

    return {
      format: latest ? 'latest' : 'legacy',
      crt,
      decks,
      notetypes,
      notes,
      cards,
      mediaNames: [...nameByIndex.values()],
      readMedia(name) {
        const index = indexByName.get(name);
        if (index === undefined) return null;
        const entry = unzipSync(bytes, { filter: (f) => f.name === index })[index];
        if (!entry) return null;
        try {
          return latest ? unzstd(entry) : entry;
        } catch {
          return null;
        }
      },
      close() {
        db.close();
      },
    };
  } catch (err) {
    db.close();
    if (err instanceof ApkgError) throw err;
    throw new ApkgError('bad-collection', 'La collection du paquet est illisible (fichier endommagé ?).');
  }
}
