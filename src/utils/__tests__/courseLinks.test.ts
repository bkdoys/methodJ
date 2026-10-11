import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINK_TYPES,
  addCourseLink,
  addLinkType,
  getLinkTypes,
  guessLinkTypeId,
  hostLabel,
  linkLabel,
  normalizeUrl,
  resolveLinkType,
} from '../courseLinks';

describe('normalizeUrl', () => {
  it('accepts http(s) and assumes https without a scheme', () => {
    expect(normalizeUrl('https://drive.google.com/file/d/abc/view')).toBe('https://drive.google.com/file/d/abc/view');
    expect(normalizeUrl('  quizlet.com/fr/xyz ')).toBe('https://quizlet.com/fr/xyz');
    expect(normalizeUrl('http://exemple.fr')).toBe('http://exemple.fr/');
  });
  it('rejects dangerous or malformed addresses', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://a.b/c', 'pas une url', 'mot', '', 'https://']) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe('labels and guesses', () => {
  it('names well-known hosts and strips www', () => {
    expect(hostLabel('https://drive.google.com/x')).toBe('Google Drive');
    expect(hostLabel('https://docs.google.com/document/d/1')).toBe('Google Docs');
    expect(hostLabel('https://www.monsite.fr/page')).toBe('monsite.fr');
    expect(linkLabel({ id: '1', url: 'https://ankiweb.net/x', typeId: 'lt_cards', label: ' Mes cartes ' })).toBe('Mes cartes');
    expect(linkLabel({ id: '1', url: 'https://ankiweb.net/x', typeId: 'lt_cards' })).toBe('AnkiWeb');
  });
  it('suggests a type from the address', () => {
    expect(guessLinkTypeId('https://www.youtube.com/watch?v=1')).toBe('lt_video');
    expect(guessLinkTypeId('https://quizlet.com/x')).toBe('lt_cards');
    expect(guessLinkTypeId('https://drive.google.com/x')).toBeUndefined();
  });
});

describe('course links', () => {
  it('adds a valid link once and keeps the label optional', () => {
    const a = addCourseLink(undefined, { url: 'drive.google.com/x', typeId: 'lt_course', label: '  ' });
    expect(a).toHaveLength(1);
    expect(a[0].url).toBe('https://drive.google.com/x');
    expect('label' in a[0]).toBe(false);
    expect(addCourseLink(a, { url: 'https://drive.google.com/x', typeId: 'lt_notes' })).toBe(a);
    expect(addCourseLink(a, { url: 'javascript:alert(1)', typeId: 'lt_notes' })).toBe(a);
  });
});

describe('link types', () => {
  it('falls back to the defaults and to « Autre » for an unknown type', () => {
    expect(getLinkTypes({})).toBe(DEFAULT_LINK_TYPES);
    expect(getLinkTypes({ linkTypes: [] })).toBe(DEFAULT_LINK_TYPES);
    expect(resolveLinkType(DEFAULT_LINK_TYPES, 'supprime').id).toBe('lt_other');
    expect(resolveLinkType(DEFAULT_LINK_TYPES, 'lt_cards').id).toBe('lt_cards');
  });
  it('adds a type once, reusing a same-name one', () => {
    const r = addLinkType(DEFAULT_LINK_TYPES, { name: 'Résumé', icon: 'doc', color: '#000000' });
    expect(r.types).toHaveLength(DEFAULT_LINK_TYPES.length + 1);
    const again = addLinkType(r.types, { name: ' résumé ', icon: 'doc', color: '#000000' });
    expect(again.types).toBe(r.types);
    expect(again.id).toBe(r.id);
    expect(addLinkType(DEFAULT_LINK_TYPES, { name: '  ', icon: 'doc', color: '#000' }).id).toBeNull();
    expect(addLinkType(DEFAULT_LINK_TYPES, { name: 'Flashcards', icon: 'doc', color: '#000' }).id).toBe('lt_cards');
  });
});
