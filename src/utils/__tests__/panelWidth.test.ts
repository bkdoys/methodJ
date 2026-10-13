import { describe, expect, it } from 'vitest';
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  clampPanelWidth,
  parseStoredPanelWidth,
} from '../panelWidth';

describe('clampPanelWidth', () => {
  it('keeps a width inside the bounds and rounds it', () => {
    expect(clampPanelWidth(300)).toBe(300);
    expect(clampPanelWidth(300.6)).toBe(301);
    expect(clampPanelWidth(10)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(9999)).toBe(PANEL_MAX_WIDTH);
  });

  it('never takes more than a share of the container', () => {
    expect(clampPanelWidth(500, 800)).toBe(440); // 55 % de 800
    expect(clampPanelWidth(300, 800)).toBe(300);
    expect(clampPanelWidth(500, 2000)).toBe(500);
  });

  it('keeps the minimum in a tiny container, and ignores an unknown container', () => {
    expect(clampPanelWidth(400, 200)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(400, 0)).toBe(400);
    expect(clampPanelWidth(400, undefined)).toBe(400);
  });

  it('falls back to the default for a width that is not a number', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(PANEL_DEFAULT_WIDTH);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(PANEL_DEFAULT_WIDTH);
  });
});

describe('parseStoredPanelWidth', () => {
  it('reads a stored width and bounds it', () => {
    expect(parseStoredPanelWidth('320')).toBe(320);
    expect(parseStoredPanelWidth('50')).toBe(PANEL_MIN_WIDTH);
    expect(parseStoredPanelWidth('5000')).toBe(PANEL_MAX_WIDTH);
  });

  it('uses the default for a missing or unreadable value', () => {
    expect(parseStoredPanelWidth(null)).toBe(PANEL_DEFAULT_WIDTH);
    expect(parseStoredPanelWidth('')).toBe(PANEL_DEFAULT_WIDTH);
    expect(parseStoredPanelWidth('abc')).toBe(PANEL_DEFAULT_WIDTH);
  });
});
