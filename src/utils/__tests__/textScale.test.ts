import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getTextScale, TEXT_SCALES, textScaleCss } from '../textScale';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('text scale', () => {
  it('falls back to normal for a missing or unknown value', () => {
    expect(getTextScale({})).toBe('normal');
    expect(getTextScale({ textScale: 'large' })).toBe('large');
    expect(getTextScale({ textScale: 'huge' as never })).toBe('normal');
  });

  it('leaves the browser base size alone at normal, scales the page otherwise', () => {
    expect(textScaleCss('normal')).toBe('');
    expect(textScaleCss('small')).toBe('90%');
    expect(textScaleCss('large')).toBe('115%');
    expect(textScaleCss('xlarge')).toBe('130%');
  });

  it('offers four steps in increasing order, one of them normal', () => {
    expect(TEXT_SCALES.map((s) => s.id)).toEqual(['small', 'normal', 'large', 'xlarge']);
    expect(TEXT_SCALES.map((s) => s.factor)).toEqual([...TEXT_SCALES.map((s) => s.factor)].sort((a, b) => a - b));
    expect(TEXT_SCALES.find((s) => s.id === 'normal')?.factor).toBe(1);
  });

  // La taille du texte agit sur la taille de base de la page : un texte fixé en pixels n'en suivrait rien
  // (et les plus petites étiquettes sont justement les plus dures à lire). On écrit donc les tailles en rem.
  it('has no text size written in pixels (use rem, 0.6875rem = 11 px)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/text-\[[0-9.]+px\]/g)) offenders.push(`${file.replace(process.cwd(), '')}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
