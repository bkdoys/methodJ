import { useCallback, useEffect, useRef, useState } from 'react';
import { addEntry, mergeLogDays, removeEntry, ReviewEntry, ReviewLog, sameLogDay } from '../utils/reviewLog';
import { getLogLastPull, loadLogDays, saveLogDays, setLogLastPull } from '../utils/reviewLogStore';
import { fetchLogDaysSince, pushLogDayToCloud } from '../utils/firebase';

interface UseReviewLogOptions {
  /** Compte dont on lit le journal sur l'appareil (null = usage sans compte). */
  storageUid: string | null;
  /** Compte connecté au cloud ; absent = pas de synchro. */
  cloudUid?: string;
}

/**
 * Journal des notes de cartes (voir `utils/reviewLog.ts`) : sur l'appareil, et connecté dans `users/{uid}/cardLogs`.
 * Mêmes principes que `useDecks` : on relit les jours modifiés ailleurs (démarrage, retour sur l'app ou du réseau),
 * on envoie les jours modifiés ici par union. Pas de minuterie : l'envoi se fait à la fin d'une séance (`flushReviewLog`,
 * une note annulée n'est alors pas déjà partie) et aux relectures.
 */
export function useReviewLog({ storageUid, cloudUid }: UseReviewLogOptions) {
  const [log, setLog] = useState<ReviewLog>({});
  const [loaded, setLoaded] = useState(false);
  const logRef = useRef(log);
  const dirtyRef = useRef(new Set<string>());
  const scopeRef = useRef(storageUid);
  const busyRef = useRef(false);

  const commit = useCallback((next: ReviewLog, changedIds: string[]) => {
    logRef.current = next;
    setLog(next);
    const present = changedIds.filter((id) => next[id]);
    saveLogDays(
      scopeRef.current,
      present.map((id) => ({ day: next[id], dirty: dirtyRef.current.has(id) })),
      changedIds.filter((id) => !next[id])
    );
  }, []);

  const pull = useCallback(async () => {
    if (!cloudUid || busyRef.current || !navigator.onLine) return;
    busyRef.current = true;
    try {
      const { days, latest } = await fetchLogDaysSince(cloudUid, getLogLastPull(cloudUid));
      if (scopeRef.current !== cloudUid) return;
      const next = { ...logRef.current };
      const changed: string[] = [];
      days.forEach((remote) => {
        const local = next[remote.id];
        const merged = local ? mergeLogDays(local, remote) : remote;
        if (!sameLogDay(merged, remote)) dirtyRef.current.add(remote.id);
        if (!sameLogDay(merged, local)) {
          next[remote.id] = merged;
          changed.push(remote.id);
        }
      });
      if (changed.length > 0) commit(next, changed);
      setLogLastPull(cloudUid, latest);
    } catch (err) {
      console.warn('Review log pull error:', err);
    } finally {
      busyRef.current = false;
    }
  }, [cloudUid, commit]);

  const flush = useCallback(async () => {
    if (!cloudUid || busyRef.current || !navigator.onLine || dirtyRef.current.size === 0) return;
    busyRef.current = true;
    try {
      for (const id of [...dirtyRef.current]) {
        const sent = logRef.current[id];
        if (!sent) {
          dirtyRef.current.delete(id);
          continue;
        }
        const merged = await pushLogDayToCloud(cloudUid, sent);
        if (scopeRef.current !== cloudUid) return;
        // Ce qui a pu être noté pendant l'envoi reste à envoyer
        const current = logRef.current[id] ?? sent;
        const next = current === sent ? merged : mergeLogDays(current, merged);
        if (sameLogDay(next, merged)) dirtyRef.current.delete(id);
        commit({ ...logRef.current, [id]: next }, [id]);
      }
    } catch (err) {
      console.warn('Review log push error:', err);
    } finally {
      busyRef.current = false;
    }
  }, [cloudUid, commit]);

  useEffect(() => {
    let cancelled = false;
    scopeRef.current = storageUid;
    setLoaded(false);
    loadLogDays(storageUid).then((stored) => {
      if (cancelled) return;
      const next: ReviewLog = {};
      dirtyRef.current = new Set();
      Object.values(stored).forEach(({ day, dirty }) => {
        next[day.id] = day;
        if (dirty) dirtyRef.current.add(day.id);
      });
      logRef.current = next;
      setLog(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageUid]);

  useEffect(() => {
    if (!loaded || !cloudUid || cloudUid !== storageUid) return;
    pull().then(() => flush());
    const run = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) pull().then(() => flush());
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('online', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('online', run);
    };
  }, [loaded, cloudUid, storageUid, pull, flush]);

  /** Une note vient d'être donnée. */
  const recordReview = useCallback(
    (entry: ReviewEntry) => {
      const next = addEntry(logRef.current, entry);
      if (next === logRef.current) return;
      const id = Object.keys(next).find((k) => next[k] !== logRef.current[k]);
      if (!id) return;
      dirtyRef.current.add(id);
      commit(next, [id]);
    },
    [commit]
  );

  /** La dernière note est annulée (retour arrière dans la séance). */
  const undoReview = useCallback(
    (ref: Pick<ReviewEntry, 't' | 'c' | 'k'>) => {
      const next = removeEntry(logRef.current, ref);
      if (next === logRef.current) return;
      const changed = [...new Set([...Object.keys(next), ...Object.keys(logRef.current)])].filter((k) => next[k] !== logRef.current[k]);
      changed.forEach((id) => (next[id] ? dirtyRef.current.add(id) : dirtyRef.current.delete(id)));
      commit(next, changed);
    },
    [commit]
  );

  return { reviewLog: log, recordReview, undoReview, flushReviewLog: flush };
}
