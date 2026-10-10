import { describe, expect, it, vi } from 'vitest';
import { createOutsideClickTracker } from '../useOutsideClick';

// Targets are plain strings: 'in' is inside the editor, anything else is outside.
const setup = (initialKey: unknown = 'A') => {
  const onOutside = vi.fn();
  const state = { key: initialKey as unknown };
  const tracker = createOutsideClickTracker<string>(() => ({
    isInside: (t) => t === 'in',
    onOutside,
    key: state.key,
  }));
  return { tracker, onOutside, state };
};

describe('createOutsideClickTracker', () => {
  it('fires when a click starts and ends outside', () => {
    const { tracker, onOutside } = setup();
    tracker.down('page');
    tracker.click('page');
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a click inside', () => {
    const { tracker, onOutside } = setup();
    tracker.down('in');
    tracker.click('in');
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does not fire when a text selection starts inside and is released outside', () => {
    const { tracker, onOutside } = setup();
    tracker.down('in');
    tracker.click('page');
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does not fire when the press was outside but the release is inside', () => {
    const { tracker, onOutside } = setup();
    tracker.down('page');
    tracker.click('in');
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does not fire when the click opened another editor (key changed)', () => {
    const { tracker, onOutside, state } = setup('A');
    tracker.down('other-card-notes');
    state.key = 'B'; // React re-rendered with editor B before the click listener ran
    tracker.click('other-card-notes');
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('forgets the press after a click, so a stray click does not fire', () => {
    const { tracker, onOutside } = setup();
    tracker.down('page');
    tracker.click('page');
    tracker.click('page');
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});
