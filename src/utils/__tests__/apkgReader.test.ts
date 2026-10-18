import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { ApkgError, readApkg } from '../apkg/reader';
import { isClozeNotetypeConfig, mediaNamesFromProtobuf, packageVersion, readProtobuf } from '../apkg/protobuf';

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'src/utils/__tests__/fixtures', `${name}.apkg`)));
const open = (name: string) => readApkg(fixture(name), () => initSqlJs());

describe('protobuf', () => {
  it('reads varints and length-delimited fields', () => {
    const fields = readProtobuf(new Uint8Array([0x08, 0x03, 0x12, 0x02, 0x68, 0x69]));
    expect(fields[0]).toEqual({ field: 1, value: 3 });
    expect(fields[1].field).toBe(2);
    expect([...(fields[1].value as Uint8Array)]).toEqual([0x68, 0x69]);
  });

  it('reads the package version and tolerates a missing or broken meta', () => {
    expect(packageVersion(new Uint8Array([8, 3]))).toBe(3);
    expect(packageVersion(new Uint8Array([8, 2]))).toBe(2);
    expect(packageVersion(undefined)).toBe(0);
    expect(packageVersion(new Uint8Array([0x12, 0x09]))).toBe(0);
  });

  it('lists the media names in order', () => {
    // MediaEntries { entries: [ { name: "a.png" }, { name: "b.jpg" } ] }
    const entry = (name: string) => {
      const n = new TextEncoder().encode(name);
      const inner = [0x0a, n.length, ...n];
      return [0x0a, inner.length, ...inner];
    };
    expect(mediaNamesFromProtobuf(new Uint8Array([...entry('a.png'), ...entry('b.jpg')]))).toEqual(['a.png', 'b.jpg']);
  });

  it('recognises a cloze notetype by its config', () => {
    expect(isClozeNotetypeConfig(new Uint8Array([0x08, 0x01, 0x1a, 0x00]))).toBe(true);
    expect(isClozeNotetypeConfig(new Uint8Array([0x1a, 0x02, 0x00, 0x00]))).toBe(false);
    expect(isClozeNotetypeConfig(null)).toBe(false);
  });
});

describe.each(['sm2-legacy', 'sm2-latest', 'fsrs-latest'])('readApkg(%s)', (name) => {
  it('reads decks with their hierarchy, notetypes, notes and cards', async () => {
    const pkg = await open(name);
    expect(pkg.format).toBe(name.endsWith('legacy') ? 'legacy' : 'latest');
    const deckNames = [...pkg.decks.values()].map((d) => d.name);
    expect(deckNames).toContain('Biologie::Cellule');
    expect(deckNames).toContain('Anatomie');
    const types = [...pkg.notetypes.values()];
    expect(types.find((t) => t.name === 'Cloze')?.cloze).toBe(true);
    expect(types.find((t) => t.name === 'Image Occlusion')?.cloze).toBe(true);
    expect(types.find((t) => t.name === 'Basic')?.cloze).toBe(false);
    expect(pkg.notes).toHaveLength(7);
    expect(pkg.cards).toHaveLength(11);
    const basic = pkg.notes.find((n) => n.fields[0].startsWith('Quelle organelle'));
    expect(basic?.fields).toEqual(["Quelle organelle produit l'ATP ?", 'La <b>mitochondrie</b>']);
    pkg.close();
  });

  it('reads the media by their original name, decompressed', async () => {
    const pkg = await open(name);
    expect([...pkg.mediaNames].sort()).toEqual(['cell.png', 'diagram.png', 'extra.png']);
    const png = pkg.readMedia('cell.png');
    expect(png).not.toBeNull();
    // Signature PNG, que le média ait été stocké brut (ancien format) ou compressé en zstd (récent)
    expect([...png!.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(pkg.readMedia('absent.png')).toBeNull();
    pkg.close();
  });
});

describe('readApkg errors', () => {
  it('refuses a file that is not a zip', async () => {
    await expect(readApkg(new Uint8Array([1, 2, 3, 4]), () => initSqlJs())).rejects.toBeInstanceOf(ApkgError);
  });
});
