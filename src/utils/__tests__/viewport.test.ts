import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// Zoom à deux doigts permis partout. `maximum-scale=1` bloque le pincement dans l'app installée sur iPad (vérifié
// sur l'appareil), `user-scalable=no` sur Android : ni l'un ni l'autre.
describe('viewport zoom', () => {
  it('keeps index.html zoomable on every device', () => {
    const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
    const meta = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
    expect(meta).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover');
  });
});
