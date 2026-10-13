import { useEffect, useState } from 'react';
import { getTodayIso, msUntilNextDay } from '../utils/dateUtils';

/**
 * Date du jour (AAAA-MM-JJ), mise à jour au passage de minuit et au retour sur l'app
 * (les minuteurs sont suspendus quand l'app est en arrière-plan, notamment sur iPad).
 * Le composant qui l'utilise se redessine au changement de jour, et ses enfants avec lui.
 */
export function useTodayIso(): string {
  const [today, setToday] = useState(getTodayIso);

  useEffect(() => {
    const refresh = () => setToday(getTodayIso());
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextDay(new Date()));
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return today;
}
