import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../i18n/en';
import { getLang, getLocale, plural, setLang, t } from '../../i18n';

const STRLIT = "'((?:[^'\\\\\\n]|\\\\.)*)'";
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'i18n' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Tous les textes passés à t(...), T(...) ou plural(...) dans le code. */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(join(process.cwd(), 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(new RegExp(`(?<![\\w.])[tT]\\(\\s*${STRLIT}`, 'g'))) keys.add(unescape(m[1]));
    for (const m of src.matchAll(new RegExp(`(?<![\\w.])plural\\(\\s*[^,]+,\\s*${STRLIT}\\s*,\\s*${STRLIT}`, 'g'))) {
      keys.add(unescape(m[1]));
      keys.add(unescape(m[2]));
    }
  }
  return keys;
}

afterEach(() => setLang('fr'));

describe('i18n', () => {
  it('returns the French text as is, with its values filled in', () => {
    expect(t('Annuler')).toBe('Annuler');
    expect(t('{n} cours sans aucun créneau validé pour l\'instant.', { n: 3 })).toBe('3 cours sans aucun créneau validé pour l\'instant.');
  });

  it('translates to English and falls back to French for an unknown text', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(t('Annuler')).toBe('Cancel');
    expect(t('Un texte sans traduction')).toBe('Un texte sans traduction');
    expect(t('{n} en retard', { n: 2 })).toBe('2 overdue');
  });

  it('picks singular or plural by language', () => {
    expect(plural(0, '{n} créneau', '{n} créneaux')).toBe('0 créneau'); // français : 0 est singulier
    expect(plural(2, '{n} créneau', '{n} créneaux')).toBe('2 créneaux');
    setLang('en');
    expect(plural(1, '{n} créneau', '{n} créneaux')).toBe('1 slot');
    expect(plural(0, '{n} créneau', '{n} créneaux')).toBe('0 slots');
  });

  it('uses the matching locale for dates', () => {
    expect(getLocale()).toBe('fr-FR');
    setLang('en');
    expect(getLocale()).toBe('en-GB');
  });
});

describe('English dictionary', () => {
  const used = usedKeys();

  it('has a translation for every text used in the code', () => {
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('has no stale entry (a text no longer used in the code)', () => {
    const stale = Object.keys(en).filter((k) => !used.has(k));
    expect(stale).toEqual([]);
  });

  it('keeps the same {values} as the French text', () => {
    const mismatched = Object.entries(en).filter(([fr, text]) => placeholders(fr).join() !== placeholders(text).join());
    expect(mismatched).toEqual([]);
  });
});
