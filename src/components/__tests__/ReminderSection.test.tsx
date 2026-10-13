// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const r = vi.hoisted(() => ({
  support: 'ok' as string,
  saved: null as string | null,
  enableReminder: vi.fn(),
  disableReminder: vi.fn(),
}));
vi.mock('../../utils/reminders', () => ({
  ReminderError: class extends Error {},
  currentReminderEnv: () => ({}),
  reminderSupport: () => r.support,
  loadReminderTime: async () => r.saved,
  enableReminder: r.enableReminder,
  disableReminder: r.disableReminder,
}));

import { ReminderSection } from '../settings/ReminderSection';
import { setLang } from '../../i18n';

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  setLang('fr'); // jsdom annonce un navigateur anglais
  r.support = 'ok';
  r.saved = null;
  r.enableReminder.mockReset().mockResolvedValue(undefined);
  r.disableReminder.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('ReminderSection', () => {
  it('asks to install the app on an iPad browser tab', () => {
    r.support = 'install-ios';
    render(<ReminderSection uid="u1" lang="fr" />);
    expect(screen.getByText(/ajoutez d'abord l'application à l'écran d'accueil/)).toBeTruthy();
    expect(screen.queryByText('Activer le rappel')).toBeNull();
  });

  it('subscribes this device at the chosen time', async () => {
    render(<ReminderSection uid="u1" lang="fr" />);
    await flush();
    fireEvent.change(screen.getByLabelText('Heure du rappel'), { target: { value: '06:45' } });
    expect(r.enableReminder).not.toHaveBeenCalled(); // not subscribed yet: a time change alone saves nothing
    fireEvent.click(screen.getByText('Activer le rappel'));
    await flush();
    expect(r.enableReminder).toHaveBeenCalledWith('u1', '06:45', 'fr');
    expect(screen.getByText('Activé sur cet appareil')).toBeTruthy();
  });

  it('saves a new time at once and turns off when subscribed', async () => {
    r.saved = '07:30';
    render(<ReminderSection uid="u1" lang="en" />);
    await flush();
    fireEvent.change(screen.getByLabelText('Heure du rappel'), { target: { value: '08:00' } });
    await flush();
    expect(r.enableReminder).toHaveBeenCalledWith('u1', '08:00', 'en');
    fireEvent.click(screen.getByText('Désactiver'));
    await flush();
    expect(r.disableReminder).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Activer le rappel')).toBeTruthy();
  });
});
