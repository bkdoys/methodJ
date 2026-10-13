import { lazy, useState } from 'react';

// Vues et fenêtres secondaires, chargées à la demande pour alléger le démarrage.
// Les composants sont des exports nommés : React.lazy attend un export par défaut.
const loaders = {
  SettingsModal: () => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
  StatsProgressView: () => import('./components/StatsProgressView').then((m) => ({ default: m.StatsProgressView })),
  DashboardView: () => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })),
  StudySessionTimer: () => import('./components/StudySessionTimer').then((m) => ({ default: m.StudySessionTimer })),
  NewCourseModal: () => import('./components/NewCourseModal').then((m) => ({ default: m.NewCourseModal })),
  CourseDetailModal: () => import('./components/CourseDetailModal').then((m) => ({ default: m.CourseDetailModal })),
  SlotDetailModal: () => import('./components/SlotDetailModal').then((m) => ({ default: m.SlotDetailModal })),
  QuickShiftModal: () => import('./components/QuickShiftModal').then((m) => ({ default: m.QuickShiftModal })),
  CompleteRevisionModal: () => import('./components/CompleteRevisionModal').then((m) => ({ default: m.CompleteRevisionModal })),
  SyncConflictModal: () => import('./components/SyncConflictModal').then((m) => ({ default: m.SyncConflictModal })),
  DeckEditor: () => import('./components/DeckEditor').then((m) => ({ default: m.DeckEditor })),
  FlashcardPlayer: () => import('./components/FlashcardPlayer').then((m) => ({ default: m.FlashcardPlayer })),
  FlashcardsView: () => import('./components/FlashcardsView').then((m) => ({ default: m.FlashcardsView })),
  CardsImportModal: () => import('./components/CardsImportModal').then((m) => ({ default: m.CardsImportModal })),
  CardCoursePicker: () => import('./components/CardCoursePicker').then((m) => ({ default: m.CardCoursePicker })),
};

export const SettingsModal = lazy(loaders.SettingsModal);
export const StatsProgressView = lazy(loaders.StatsProgressView);
export const DashboardView = lazy(loaders.DashboardView);
export const StudySessionTimer = lazy(loaders.StudySessionTimer);
export const NewCourseModal = lazy(loaders.NewCourseModal);
export const CourseDetailModal = lazy(loaders.CourseDetailModal);
export const SlotDetailModal = lazy(loaders.SlotDetailModal);
export const QuickShiftModal = lazy(loaders.QuickShiftModal);
export const CompleteRevisionModal = lazy(loaders.CompleteRevisionModal);
export const SyncConflictModal = lazy(loaders.SyncConflictModal);
export const DeckEditor = lazy(loaders.DeckEditor);
export const FlashcardPlayer = lazy(loaders.FlashcardPlayer);
export const FlashcardsView = lazy(loaders.FlashcardsView);
export const CardsImportModal = lazy(loaders.CardsImportModal);
export const CardCoursePicker = lazy(loaders.CardCoursePicker);

/**
 * Précharge tous les morceaux après le démarrage, quand le navigateur est libre : l'ouverture d'une vue
 * reste instantanée et le service worker les met en cache pour l'usage hors ligne.
 */
export function prefetchLazyViews(): void {
  const run = () => Object.values(loaders).forEach((load) => load().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  // Safari n'a pas requestIdleCallback
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** Vrai dès que `open` a été vrai une fois : la fenêtre reste ensuite montée (son brouillon est conservé). */
export function useMountedOnce(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted || open;
}
