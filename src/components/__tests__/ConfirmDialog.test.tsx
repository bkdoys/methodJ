// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfirmOptions, ConfirmProvider, useConfirm } from '../ConfirmDialog';
import { setLang } from '../../i18n';

let results: boolean[] = [];

const Harness: React.FC<{ options: ConfirmOptions; label?: string }> = ({ options, label = 'ouvrir' }) => {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => results.push(await confirm(options))}>
      {label}
    </button>
  );
};

const open = async (options: ConfirmOptions) => {
  render(
    <ConfirmProvider>
      <Harness options={options} />
    </ConfirmProvider>
  );
  fireEvent.click(screen.getByText('ouvrir'));
  await act(async () => {});
};

beforeEach(() => {
  setLang('fr'); // jsdom annonce un navigateur anglais
  results = [];
});
afterEach(() => cleanup());

describe('ConfirmDialog', () => {
  it('shows the title and message and resolves true on confirm', async () => {
    await open({ title: 'Supprimer le dossier ?', message: 'Ses cours remontent.', confirmLabel: 'Supprimer' });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Supprimer le dossier ?')).toBeTruthy();
    expect(screen.getByText('Ses cours remontent.')).toBeTruthy();
    fireEvent.click(screen.getByText('Supprimer'));
    await act(async () => {});
    expect(results).toEqual([true]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false on cancel, Escape and a click outside the card', async () => {
    await open({ title: 'T' });
    fireEvent.click(screen.getByText('Annuler'));
    await act(async () => {});

    fireEvent.click(screen.getByText('ouvrir'));
    await act(async () => {});
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    await act(async () => {});

    fireEvent.click(screen.getByText('ouvrir'));
    await act(async () => {});
    fireEvent.mouseDown(screen.getByRole('alertdialog'));
    await act(async () => {});

    expect(results).toEqual([false, false, false]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does not close when the click starts inside the card', async () => {
    await open({ title: 'Titre', message: 'Message' });
    fireEvent.mouseDown(screen.getByText('Message'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(results).toEqual([]);
  });

  it('focuses Cancel for a dangerous action and Confirm otherwise', async () => {
    await open({ title: 'T', tone: 'danger', confirmLabel: 'Supprimer' });
    expect(document.activeElement).toBe(screen.getByText('Annuler'));
    cleanup();
    await open({ title: 'T' });
    expect(document.activeElement).toBe(screen.getByText('Confirmer'));
  });

  it('keeps Tab inside the card and gives the focus back to the opener', async () => {
    render(
      <ConfirmProvider>
        <Harness options={{ title: 'T', tone: 'danger', confirmLabel: 'Supprimer' }} />
      </ConfirmProvider>
    );
    screen.getByText('ouvrir').focus(); // un clic de souris donne le focus au bouton, pas jsdom
    fireEvent.click(screen.getByText('ouvrir'));
    await act(async () => {});
    const dialog = screen.getByRole('alertdialog');
    const cancel = screen.getByText('Annuler');
    const confirm = screen.getByText('Supprimer');
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    cancel.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.click(cancel);
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByText('ouvrir'));
  });

  it('cancels a pending dialog when another one is requested', async () => {
    render(
      <ConfirmProvider>
        <Harness options={{ title: 'Premier' }} label="un" />
        <Harness options={{ title: 'Second' }} label="deux" />
      </ConfirmProvider>
    );
    fireEvent.click(screen.getByText('un'));
    await act(async () => {});
    fireEvent.click(screen.getByText('deux'));
    await act(async () => {});
    expect(results).toEqual([false]);
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('Premier')).toBeNull();
  });

  it('complains when used outside the provider', () => {
    const Bad = () => {
      useConfirm();
      return null;
    };
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Bad />)).toThrow(/ConfirmProvider/);
    console.error = spy;
  });
});
