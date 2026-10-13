import { useCallback, useEffect, useRef, useState } from 'react';
import { Deck } from '../types';
import { collectMediaIds, emptyDeck, mergeDecks, moveCards, normalizeDeck, sameDeck } from '../utils/flashcards';
import { pruneMedia, setMediaAccount } from '../utils/media';
import { getLastPull, loadDecks, removeDecks as removeStoredDecks, saveDecks, setLastPull } from '../utils/deckStore';
import { deleteDeckFromCloud, fetchDecksSince, pushDeckToCloud } from '../utils/firebase';

interface UseDecksOptions {
  /** Compte dont on lit les paquets sur l'appareil (null = usage sans compte). */
  storageUid: string | null;
  /** Compte connecté au cloud ; absent = pas de synchro. */
  cloudUid?: string;
}

const PUSH_DELAY_MS = 3000;

/**
 * Paquets de cartes : sur l'appareil (IndexedDB) et, connecté, dans `users/{uid}/decks`. Hors de la synchro du
 * planning : on relit seulement les paquets modifiés ailleurs (au démarrage, au retour sur l'app ou du réseau) et on
 * envoie ceux modifiés ici 3 s après la dernière modification, fusionnés avec le cloud (jamais d'écrasement).
 */
export function useDecks({ storageUid, cloudUid }: UseDecksOptions) {
  const [decks, setDecks] = useState<Record<string, Deck>>({});
  const [loaded, setLoaded] = useState(false);
  const decksRef = useRef(decks);
  const dirtyRef = useRef(new Set<string>());
  const scopeRef = useRef(storageUid);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  // Compte pour lequel on a déjà fait le ménage des images inutilisées pendant cette session
  const prunedRef = useRef<string | null>(null);

  // Une seule fois par compte, et seulement avec des paquets à jour (relus du cloud si on est connecté)
  const pruneUnusedMedia = useCallback(() => {
    const key = scopeRef.current ?? '';
    if (prunedRef.current === key) return;
    prunedRef.current = key;
    pruneMedia(collectMediaIds(Object.values(decksRef.current))).catch((err) => console.warn('Media prune error:', err));
  }, []);

  const commit = useCallback((next: Record<string, Deck>, changedIds: string[]) => {
    decksRef.current = next;
    setDecks(next);
    const rows = changedIds
      .filter((id) => next[id])
      .map((id) => ({ deck: next[id], dirty: dirtyRef.current.has(id) }));
    saveDecks(scopeRef.current, rows);
  }, []);

  // Relit les paquets modifiés ailleurs depuis la dernière fois et les fusionne avec ceux de l'appareil
  const pull = useCallback(async () => {
    if (!cloudUid || busyRef.current || !navigator.onLine) return;
    busyRef.current = true;
    try {
      const { decks: remote, latest } = await fetchDecksSince(cloudUid, getLastPull(cloudUid));
      if (scopeRef.current !== cloudUid) return;
      const next = { ...decksRef.current };
      const changed: string[] = [];
      remote.forEach((r) => {
        const local = next[r.id];
        const merged = local ? mergeDecks(local, r) : r;
        if (!sameDeck(merged, r)) dirtyRef.current.add(r.id);
        if (!sameDeck(merged, local)) {
          next[r.id] = merged;
          changed.push(r.id);
        }
      });
      if (changed.length > 0) commit(next, changed);
      setLastPull(cloudUid, latest);
      pruneUnusedMedia();
    } catch (err) {
      console.warn('Deck pull error:', err);
    } finally {
      busyRef.current = false;
    }
  }, [cloudUid, commit, pruneUnusedMedia]);

  // Envoie les paquets modifiés ici (chacun fusionné avec le cloud dans une transaction)
  const flush = useCallback(async () => {
    if (pushTimer.current) {
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
    }
    if (!cloudUid || busyRef.current || !navigator.onLine || dirtyRef.current.size === 0) return;
    busyRef.current = true;
    try {
      for (const id of [...dirtyRef.current]) {
        const sent = decksRef.current[id];
        if (!sent) {
          dirtyRef.current.delete(id);
          continue;
        }
        const merged = await pushDeckToCloud(cloudUid, sent);
        if (scopeRef.current !== cloudUid) return;
        // Ce qui a pu être modifié pendant l'envoi reste à envoyer
        const current = decksRef.current[id] ?? sent;
        const next = current === sent ? merged : mergeDecks(current, merged);
        if (sameDeck(next, merged)) dirtyRef.current.delete(id);
        commit({ ...decksRef.current, [id]: next }, [id]);
      }
    } catch (err) {
      console.warn('Deck push error:', err);
    } finally {
      busyRef.current = false;
    }
  }, [cloudUid, commit]);

  const schedulePush = useCallback(() => {
    if (!cloudUid) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      flush();
    }, PUSH_DELAY_MS);
  }, [cloudUid, flush]);

  // Chargement depuis l'appareil à chaque changement de compte, puis relecture du cloud
  useEffect(() => {
    let cancelled = false;
    scopeRef.current = storageUid;
    setLoaded(false);
    loadDecks(storageUid).then((stored) => {
      if (cancelled) return;
      const now = new Date().toISOString();
      const next: Record<string, Deck> = {};
      dirtyRef.current = new Set();
      Object.values(stored).forEach(({ deck, dirty }) => {
        next[deck.id] = normalizeDeck(deck, now);
        if (dirty) dirtyRef.current.add(deck.id);
      });
      decksRef.current = next;
      setDecks(next);
      setLoaded(true);
      // Sans compte : paquets déjà à jour. Avec un compte, le ménage attend la relecture du cloud (pull)
      if (!storageUid) pruneUnusedMedia();
    });
    return () => {
      cancelled = true;
    };
  }, [storageUid, pruneUnusedMedia]);

  // Images des cartes : même compte que les paquets
  useEffect(() => {
    setMediaAccount(storageUid, cloudUid);
  }, [storageUid, cloudUid]);

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

  useEffect(
    () => () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    },
    []
  );

  /**
   * Modifie le paquet d'un cours (créé s'il n'existe pas) ; enregistré tout de suite, envoyé 3 s plus tard.
   * `defer` : pendant une séance, on attend `flushDecks` à la fin (une écriture par paquet, et une note annulée
   * n'est pas déjà partie).
   */
  const updateDeck = useCallback(
    (courseId: string, change: (deck: Deck) => Deck, options?: { defer?: boolean }) => {
      const current = decksRef.current[courseId] ?? emptyDeck(courseId);
      const next = change(current);
      if (next === current) return;
      dirtyRef.current.add(courseId);
      commit({ ...decksRef.current, [courseId]: next }, [courseId]);
      if (!options?.defer) schedulePush();
    },
    [commit, schedulePush]
  );

  /** Supprime les paquets de cours supprimés (appareil et cloud). */
  const removeDecks = useCallback(
    (courseIds: string[]) => {
      if (courseIds.length === 0) return;
      const present = courseIds.filter((id) => decksRef.current[id]);
      if (present.length > 0) {
        const next = { ...decksRef.current };
        present.forEach((id) => {
          delete next[id];
          dirtyRef.current.delete(id);
        });
        decksRef.current = next;
        setDecks(next);
        removeStoredDecks(scopeRef.current, present);
      }
      // Côté cloud aussi pour un paquet pas encore relu ici
      if (cloudUid) {
        courseIds.forEach((id) =>
          deleteDeckFromCloud(cloudUid, id).catch((err) => console.warn('Deck delete error:', err))
        );
      }
    },
    [cloudUid]
  );

  /**
   * Déplace des cartes d'un cours à un autre (historique compris). Renvoie le nombre déplacé, ou null si le cours
   * d'arrivée n'a pas la place.
   */
  const moveCardsBetween = useCallback(
    (fromId: string, toId: string, ids: string[]): number | null => {
      const res = moveCards(
        decksRef.current[fromId] ?? emptyDeck(fromId),
        decksRef.current[toId] ?? emptyDeck(toId),
        ids,
        new Date().toISOString()
      );
      if (!res) return null;
      if (res.moved === 0) return 0;
      dirtyRef.current.add(fromId);
      dirtyRef.current.add(toId);
      commit({ ...decksRef.current, [fromId]: res.from, [toId]: res.to }, [fromId, toId]);
      schedulePush();
      return res.moved;
    },
    [commit, schedulePush]
  );

  /** Paquets d'une sauvegarde importée : fusionnés avec ceux de l'appareil (aucune carte perdue), puis envoyés. */
  const importDecks = useCallback(
    (list: Deck[]) => {
      if (list.length === 0) return;
      const next = { ...decksRef.current };
      list.forEach((d) => {
        next[d.id] = next[d.id] ? mergeDecks(next[d.id], d) : d;
        dirtyRef.current.add(d.id);
      });
      commit(next, list.map((d) => d.id));
      schedulePush();
    },
    [commit, schedulePush]
  );

  return { decks, decksLoaded: loaded, updateDeck, removeDecks, importDecks, moveCardsBetween, flushDecks: flush };
}
