import { describe, expect, it } from 'vitest';
import { DomLike, parseInline, parseRichText, serializeDom, stripRichText } from '../richText';

describe('parseInline', () => {
  it('reconnaît gras, souligné et italique', () => {
    expect(parseInline('a **b** ++c++ _d_')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'underline', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'd' }] },
    ]);
  });

  it('imbrique les styles', () => {
    expect(parseInline('**a _b_**')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'a ' }, { type: 'italic', children: [{ type: 'text', text: 'b' }] }] },
    ]);
  });

  it('laisse le texte ordinaire intact (snake_case, marqueur isolé)', () => {
    expect(parseInline('taux_de_base et 2 ** 3 ++')).toEqual([{ type: 'text', text: 'taux_de_base et 2 ** 3 ++' }]);
  });
});

describe('parseRichText', () => {
  it('regroupe les puces et les numéros', () => {
    const blocks = parseRichText('titre\n- un\n- deux\n3. trois\n4. quatre');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'ol']);
    expect(blocks[2]).toMatchObject({ type: 'ol', start: 3 });
  });

  it('une note sans marqueur reste inchangée par stripRichText', () => {
    expect(stripRichText('Critères de Framingham\n\nposologies')).toBe('Critères de Framingham\n\nposologies');
  });

  it('stripRichText retire les marqueurs', () => {
    expect(stripRichText('**gras** et ++souligné++\n- puce')).toBe('gras et souligné\n• puce');
  });
});

const text = (t: string): DomLike => ({ nodeName: '#text', nodeType: 3, textContent: t, childNodes: [] });
const el = (name: string, ...children: DomLike[]): DomLike => ({ nodeName: name, nodeType: 1, textContent: null, childNodes: children });

describe('serializeDom', () => {
  it('sérialise styles et paragraphes', () => {
    const root = el('DIV', text('a '), el('B', text('gras')), el('BR'), el('DIV', el('U', text('sous'))), el('DIV', el('BR')), el('DIV', text('fin')));
    expect(serializeDom(root)).toBe('a **gras**\n++sous++\n\nfin');
  });

  it('sérialise les listes à puces et numérotées', () => {
    const root = el('DIV', el('UL', el('LI', text('un')), el('LI', el('I', text('deux')))), el('OL', el('LI', text('x')), el('LI', text('y'))));
    expect(serializeDom(root)).toBe('- un\n- _deux_\n1. x\n2. y');
  });

  it('ignore un style sans contenu et revient au texte d\'origine', () => {
    expect(serializeDom(el('DIV', el('B', text(''))))).toBe('');
    const src = 'titre **gras** ++s++\n- un\n- deux\n1. a\n2. b';
    const root = el(
      'DIV',
      el('DIV', text('titre '), el('B', text('gras')), text(' '), el('U', text('s'))),
      el('UL', el('LI', text('un')), el('LI', text('deux'))),
      el('OL', el('LI', text('a')), el('LI', text('b')))
    );
    expect(serializeDom(root)).toBe(src);
  });
});

describe('serializeDom : styles en ligne', () => {
  it('lit un <span style> comme un marqueur', () => {
    const span = (style: NonNullable<DomLike['style']>, t: string): DomLike => ({ ...el('SPAN', text(t)), style });
    const root = el(
      'DIV',
      span({ textDecoration: 'underline' }, 'a'),
      text(' '),
      span({ textDecorationLine: 'underline' }, 'b'),
      text(' '),
      span({ fontWeight: '700' }, 'c'),
      text(' '),
      span({ fontStyle: 'italic' }, 'd')
    );
    expect(serializeDom(root)).toBe('++a++ ++b++ **c** _d_');
  });
});
