import { describe, expect, it } from 'vitest';
import { ReminderEnv, reminderSupport } from '../reminderSupport';

const desktop: ReminderEnv = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  standalone: false,
  hasNotification: true,
  hasPush: true,
  hasServiceWorker: true,
  permission: 'default',
};
// iPadOS se présente comme un Mac, mais tactile ; dans un onglet Safari, pas d'API de notification
const ipadSafari: ReminderEnv = {
  ...desktop,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  maxTouchPoints: 5,
  hasNotification: false,
  hasPush: false,
};

describe('reminderSupport', () => {
  it('works in a desktop browser', () => {
    expect(reminderSupport(desktop)).toBe('ok');
  });

  it('asks to install the app on an iPad or iPhone browser tab', () => {
    expect(reminderSupport(ipadSafari)).toBe('install-ios');
    expect(reminderSupport({ ...ipadSafari, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone' })).toBe('install-ios');
  });

  it('works in the app installed on the iPad home screen', () => {
    expect(reminderSupport({ ...ipadSafari, standalone: true, hasNotification: true, hasPush: true })).toBe('ok');
  });

  it('reports an unsupported browser and blocked notifications', () => {
    expect(reminderSupport({ ...desktop, hasPush: false })).toBe('unsupported');
    expect(reminderSupport({ ...desktop, permission: 'denied' })).toBe('denied');
  });
});
