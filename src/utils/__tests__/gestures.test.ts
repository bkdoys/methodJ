import { describe, expect, it } from 'vitest';
import { classifySwipe, pinchSteps } from '../gestures';

describe('classifySwipe', () => {
  const swipe = (dx: number, dy = 0, dt = 200, holdMs = 0) => classifySwipe({ dx, dy, dt, holdMs });

  it('doigt vers la gauche = suivant, vers la droite = précédent', () => {
    expect(swipe(-80)).toBe('next');
    expect(swipe(80)).toBe('prev');
  });

  it('ignore un mouvement trop court', () => {
    expect(swipe(-59)).toBeNull();
    expect(swipe(60)).toBe('prev');
  });

  it('ignore un geste en diagonale (défilement vertical)', () => {
    expect(swipe(-90, 70)).toBeNull();
    expect(swipe(-90, 60)).toBe('next');
  });

  it('ignore un geste lent', () => {
    expect(swipe(-120, 0, 701)).toBeNull();
    expect(swipe(-120, 0, 700)).toBe('next');
  });

  it("ignore un appui long avant le mouvement (glisser d'un créneau)", () => {
    expect(swipe(-120, 0, 500, 250)).toBeNull();
    expect(swipe(-120, 0, 500, 249)).toBe('next');
  });
});

describe('pinchSteps', () => {
  it('compte un palier tous les ×1,5', () => {
    expect(pinchSteps(100, 100)).toBe(0);
    expect(pinchSteps(100, 149)).toBe(0);
    expect(pinchSteps(100, 150)).toBe(1);
    expect(pinchSteps(100, 225)).toBe(2);
  });

  it('négatif quand les doigts se rapprochent, et retour à zéro', () => {
    expect(pinchSteps(150, 100)).toBe(-1);
    expect(pinchSteps(225, 100)).toBe(-2);
    expect(pinchSteps(100, 70)).toBe(0);
  });

  it('ignore des distances invalides', () => {
    expect(pinchSteps(0, 100)).toBe(0);
    expect(pinchSteps(100, 0)).toBe(0);
  });
});
