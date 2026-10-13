import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { PHONE_QUERY } from '../screen';

// La variante CSS `phone:` (src/index.css) et la requête JS doivent viser exactement les mêmes écrans.
// Une seule règle `@media A, B` dans la variante perd silencieusement B : d'où un bloc par moitié.
describe('phone screen detection', () => {
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
  const variant = css.slice(css.indexOf('@custom-variant phone'));
  const blocks = [...variant.slice(0, variant.indexOf('\n}')).matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim());

  it('has one CSS media block per part of the JS query', () => {
    expect(blocks).toEqual(PHONE_QUERY.split(/,\s*/));
  });

  it('never targets an iPad or a desktop window', () => {
    expect(PHONE_QUERY).toContain('(max-width: 639.98px)');
    expect(PHONE_QUERY).toContain('(max-height: 500px) and (pointer: coarse)');
  });
});
