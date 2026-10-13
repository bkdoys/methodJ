import { useEffect, useState } from 'react';
import { getMediaUrl } from '../utils/media';

export type MediaState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' };

/**
 * URL affichable d'une image de carte. `missing` : ni sur l'appareil ni dans le cloud pour l'instant (envoyée
 * depuis un autre appareil resté hors ligne) ; on réessaie au retour du réseau ou sur l'app.
 */
export function useMediaUrl(id: string | undefined): MediaState {
  const [state, setState] = useState<{ id?: string; value: MediaState }>({ value: { status: 'loading' } });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMediaUrl(id).then((url) => {
      if (!cancelled) setState({ id, value: url ? { status: 'ready', url } : { status: 'missing' } });
    });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const current: MediaState = !id ? { status: 'missing' } : state.id === id ? state.value : { status: 'loading' };

  useEffect(() => {
    if (current.status !== 'missing' || !id) return;
    const retry = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [current.status, id]);

  return current;
}
