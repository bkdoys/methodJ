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

describe('exposant et indice', () => {
  it('lit ^exposant^ et ~indice~ sans espace à l\'intérieur', () => {
    expect(parseInline('H~2~O et m^3^')).toEqual([
      { type: 'text', text: 'H' },
      { type: 'sub', text: '2' },
      { type: 'text', text: 'O et m' },
      { type: 'sup', text: '3' },
    ]);
  });

  it('laisse le texte ordinaire intact', () => {
    for (const t of ['~5 min et ~10 min', 'a ^ b ^ c', 'x^2 et y']) {
      expect(parseInline(t)).toEqual([{ type: 'text', text: t }]);
    }
  });

  it('stripRichText les rend en texte', () => {
    expect(stripRichText('H~2~O, m^3^ et **gras**')).toBe('H2O, m3 et gras');
  });

  it('serializeDom écrit SUP et SUB, sauf avec un espace', () => {
    const text = (s: string): DomLike => ({ nodeName: '#text', nodeType: 3, textContent: s, childNodes: [] });
    const el = (nodeName: string, ...kids: DomLike[]): DomLike => ({ nodeName, nodeType: 1, textContent: null, childNodes: kids });
    expect(serializeDom(el('DIV', el('DIV', text('H'), el('SUB', text('2')), text('O'), el('SUP', text('a b')))))).toBe('H~2~Oa b');
  });
});

describe('fraction', () => {
  it('lit ⟦a/b⟧ avec mise en forme dedans', () => {
    expect(parseInline('Rapport ⟦x^2^/2⟧ ici')).toEqual([
      { type: 'text', text: 'Rapport ' },
      { type: 'frac', num: [{ type: 'text', text: 'x' }, { type: 'sup', text: '2' }], den: [{ type: 'text', text: '2' }] },
      { type: 'text', text: ' ici' },
    ]);
  });

  it('une fraction sans barre ou mal fermée reste du texte', () => {
    expect(parseInline('⟦abc⟧ et ⟦a/b')).toEqual([{ type: 'text', text: '⟦abc⟧ et ⟦a/b' }]);
  });

  it('stripRichText la rend a/b, et elle tient dans un trou', () => {
    expect(stripRichText('⟦1/3⟧ de dose')).toBe('1/3 de dose');
    expect(parseInline('{{c1::⟦1/3⟧}}', { cloze: true })).toEqual([
      { type: 'cloze', n: 1, children: [{ type: 'frac', num: [{ type: 'text', text: '1' }], den: [{ type: 'text', text: '3' }] }] },
    ]);
  });
});

describe('texte à trous', () => {
  it('lit un trou comme un nœud, avec indice et mise en forme dedans', () => {
    expect(parseInline('Le {{c1::**cœur**::organe}} bat', { cloze: true })).toEqual([
      { type: 'text', text: 'Le ' },
      { type: 'cloze', n: 1, hint: 'organe', children: [{ type: 'bold', children: [{ type: 'text', text: 'cœur' }] }] },
      { type: 'text', text: ' bat' },
    ]);
  });

  it('la mise en forme peut enjamber un trou', () => {
    expect(parseInline('**a {{c2::b}} c**', { cloze: true })).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', text: 'a ' },
          { type: 'cloze', n: 2, children: [{ type: 'text', text: 'b' }] },
          { type: 'text', text: ' c' },
        ],
      },
    ]);
  });

  it('sans l\'option, ou un trou mal fermé, reste du texte', () => {
    expect(parseInline('{{c1::a}}')).toEqual([{ type: 'text', text: '{{c1::a}}' }]);
    expect(parseInline('{{c1::a', { cloze: true })).toEqual([{ type: 'text', text: '{{c1::a' }]);
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
