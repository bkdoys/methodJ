// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BreaksEditor, BreaksValue } from '../BreaksEditor';
import { setLang } from '../../i18n';

const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const lunch = { start: '12:00', end: '13:00' };

function setup(value: BreaksValue) {
  const onChange = vi.fn();
  render(<BreaksEditor value={value} onChange={onChange} weekdayLabels={days} />);
  return onChange;
}

beforeEach(() => setLang('fr')); // jsdom annonce un navigateur anglais
afterEach(() => cleanup());

describe('BreaksEditor', () => {
  it('puts a day back on the common breaks when its last break is removed', () => {
    const onChange = setup({ all: [lunch], '6': [{ start: '15:00', end: '16:00' }] });
    fireEvent.click(screen.getByLabelText('Dimanche : début de la pause').parentElement!.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith({ all: [lunch] });
  });

  it('keeps the day customized when one of several breaks is removed', () => {
    const onChange = setup({ all: [lunch], '6': [lunch, { start: '15:00', end: '16:00' }] });
    fireEvent.click(screen.getAllByLabelText('Supprimer la pause').at(-1)!);
    expect(onChange).toHaveBeenCalledWith({ all: [lunch], '6': [lunch] });
  });

  it('offers « no break this day » as an explicit choice', () => {
    const onChange = setup({ all: [lunch], '6': [lunch] });
    fireEvent.click(screen.getByText('Aucune pause ce jour'));
    expect(onChange).toHaveBeenCalledWith({ all: [lunch], '6': [] });
  });

  it('explains an empty day and can put it back on the common breaks', () => {
    const onChange = setup({ all: [lunch], '6': [] });
    expect(screen.getByText(/les pauses communes ne s'appliquent pas/)).toBeTruthy();
    fireEvent.click(screen.getByText('comme les autres jours'));
    expect(onChange).toHaveBeenCalledWith({ all: [lunch] });
  });
});
