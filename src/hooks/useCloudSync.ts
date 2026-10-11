import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  isCloudConfigured,
  fetchCloudData,
  mirrorLocalToCloud,
  syncLocalDataToCloud,
} from '../utils/firebase';
import { ToastMessage } from '../types';
import { loadStoredData, saveStoredData, setLastUid } from '../utils/storage';
import {
  SafetyBackup,
  SyncData,
  cloudToData,
  decideReconcile,
  getSyncMeta,
  hasUnsyncedChanges,
  loadSafetyBackups,
  markSynced,
  saveSafetyBackup,
} from '../utils/cloudSync';
import { T, t } from '../i18n';

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'conflict';

export interface SyncConflict {
  cloud: SyncData;
  cloudStamp: string | null;
  localSyncedAt?: string;
}

interface UseCloudSyncOptions {
  /** Les données locales ont été chargées : la synchro peut démarrer. */
  dataLoaded: boolean;
  /** État courant des données (déclenche l'envoi automatique quand il change). */
  data: SyncData;
  /** Dernier état des données (évite les valeurs périmées dans les callbacks asynchrones). */
  stateRef: MutableRefObject<SyncData>;
  /** Remplace l'état de l'application par ces données. */
  applyData: (d: SyncData) => void;
  notify: (toast: ToastMessage) => void;
}

/**
 * Compte Firebase + synchronisation cloud avec garde-fou anti-écrasement.
 * La logique de décision pure est dans utils/cloudSync.ts (testée).
 */
export function useCloudSync({ dataLoaded, data, stateRef, applyData, notify }: UseCloudSyncOptions) {
  const { courses, revisions, subjects, settings } = data;
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isSyncingFromCloudRef = useRef(false);

  // ---------- Synchronisation cloud avec garde-fou anti-écrasement ----------
  // Principe : on retient l'état local au moment de la dernière synchro réussie (empreinte)
  // et la dernière estampille du cloud vue. En relisant le cloud :
  //  - rien d'en attente localement -> on adopte le cloud
  //  - modifications locales et cloud inchangé -> on envoie le local (rattrapage hors ligne)
  //  - modifications locales ET cloud modifié ailleurs -> boîte de dialogue (conflit)
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const syncConflictRef = useRef<SyncConflict | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [hasUnsynced, setHasUnsynced] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [safetyBackups, setSafetyBackups] = useState<SafetyBackup[]>([]);
  const reconcilingRef = useRef(false);

  const setConflict = useCallback((c: SyncConflict | null) => {
    syncConflictRef.current = c;
    setSyncConflict(c);
    setConflictDialogOpen(c !== null);
  }, []);

  const refreshSafetyBackups = useCallback((uid?: string | null) => {
    setSafetyBackups(uid ? loadSafetyBackups(uid) : []);
  }, []);

  const reconcileWithCloud = useCallback(
    async (user: User, source: 'login' | 'visible' | 'online' | 'manual') => {
      if (reconcilingRef.current || syncConflictRef.current) return;
      reconcilingRef.current = true;
      isSyncingFromCloudRef.current = true;
      const announce = source === 'login' || source === 'manual';
      if (announce) setIsSyncing(true);
      try {
        const cloud = await fetchCloudData(user.uid);
        if (!cloud) return;
        const meta = getSyncMeta(user.uid);
        // À la connexion, le travail fait hors ligne est dans le stockage propre au compte
        const local: SyncData =
          source === 'login' && meta.hash !== undefined ? loadStoredData(user.uid) : stateRef.current;
        const who = user.email || t('votre compte');

        if (cloud.courses.length === 0) {
          // Cloud vide : à la connexion (ou synchro manuelle), on y envoie les données locales
          if (source === 'login' || source === 'manual') {
            const base = local.courses.length > 0 ? local : loadStoredData(user.uid);
            applyData(base);
            saveStoredData(base.courses, base.revisions, base.subjects, base.settings, user.uid);
            const stamp = await syncLocalDataToCloud(user.uid, base.courses, base.revisions, base.subjects, base.settings);
            markSynced(user.uid, base, stamp);
            setHasUnsynced(false);
            notify({
              title: t('Espace Cloud initialisé'),
              description: t('Vos cours ({n}) sont synchronisés avec votre compte ({who}).', { n: base.courses.length, who }),
              type: 'success',
            });
          }
          return;
        }

        const decision = decideReconcile(local, cloud, meta);
        const cloudData = cloudToData(cloud, local);

        if (decision === 'in-sync') {
          if (local !== stateRef.current) applyData(local);
          markSynced(user.uid, local, cloud.stamp);
          setHasUnsynced(false);
          if (announce) {
            notify({
              title: t('Cloud à jour'),
              description: t('{n} cours synchronisés pour {who}.', { n: local.courses.length, who }),
              type: 'success',
            });
          }
        } else if (decision === 'adopt-cloud') {
          if (meta.hash === undefined && local.courses.length > 0) {
            saveSafetyBackup(user.uid, local, T('Données de cet appareil avant remplacement par le cloud'));
            refreshSafetyBackups(user.uid);
          }
          applyData(cloudData);
          saveStoredData(cloudData.courses, cloudData.revisions, cloudData.subjects, cloudData.settings, user.uid);
          markSynced(user.uid, cloudData, cloud.stamp);
          setHasUnsynced(false);
          if (announce) {
            notify({
              title: source === 'login' ? t('Base Cloud Connectée') : t('Données rechargées depuis le Cloud'),
              description: t('{n} cours synchronisés pour {who}.', { n: cloudData.courses.length, who }),
              type: 'success',
            });
          }
        } else if (decision === 'push-local') {
          if (local !== stateRef.current) applyData(local);
          const stamp = await mirrorLocalToCloud(user.uid, local);
          markSynced(user.uid, local, stamp);
          setHasUnsynced(hasUnsyncedChanges(user.uid, stateRef.current));
          // Synchro automatique : la pastille Cloud suffit, pas de toast (sauf demande explicite de l'utilisateur)
          if (announce) {
            notify({
              title: t('Modifications envoyées'),
              description: t('Les changements faits sur cet appareil ont été synchronisés avec le Cloud.'),
              type: 'success',
            });
          }
        } else {
          if (local !== stateRef.current) applyData(local);
          setConflict({ cloud: cloudData, cloudStamp: cloud.stamp, localSyncedAt: meta.syncedAt });
        }
      } catch (err: any) {
        console.warn('Cloud reconcile failed:', err);
        if (announce) {
          notify({
            title: t('Erreur de synchronisation'),
            description: err?.message || t('Une erreur est survenue lors de la synchronisation.'),
            type: 'error',
          });
        }
      } finally {
        reconcilingRef.current = false;
        isSyncingFromCloudRef.current = false;
        setIsSyncing(false);
      }
    },
    [applyData, notify, refreshSafetyBackups, setConflict]
  );

  useEffect(() => {
    // Sans config Firebase (usage local), il n'y a pas de compte à suivre
    if (!isCloudConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLastUid(user?.uid ?? null);
      setCurrentUser(user);
      if (user) {
        refreshSafetyBackups(user.uid);
        await reconcileWithCloud(user, 'login');
      } else {
        setConflict(null);
        setHasUnsynced(false);
        refreshSafetyBackups(null);
      }
    });

    return () => unsubscribe();
  }, [reconcileWithCloud, refreshSafetyBackups, setConflict]);

  // Suivi de la connexion réseau
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Envoi automatique vers le cloud (3 s après la dernière modification), uniquement s'il y a
  // des modifications en attente, en ligne, sans conflit non résolu.
  useEffect(() => {
    if (!dataLoaded || !currentUser) return;
    const uid = currentUser.uid;
    const current: SyncData = { courses, revisions, subjects, settings };
    const dirty = hasUnsyncedChanges(uid, current);
    setHasUnsynced(dirty);
    if (!dirty || isOffline || syncConflictRef.current || isSyncingFromCloudRef.current) return;
    const timeout = setTimeout(async () => {
      if (isSyncingFromCloudRef.current || syncConflictRef.current) return;
      try {
        const stamp = await syncLocalDataToCloud(uid, courses, revisions, subjects, settings);
        markSynced(uid, current, stamp);
        setHasUnsynced(hasUnsyncedChanges(uid, stateRef.current));
      } catch (err) {
        console.warn('Silent cloud auto-sync error:', err);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [courses, revisions, subjects, settings, currentUser, dataLoaded, isOffline]);

  // Relecture du cloud au retour sur l'app ou au retour du réseau (avec garde-fou)
  useEffect(() => {
    if (!dataLoaded || !currentUser) return;
    const run = (source: 'visible' | 'online') => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      reconcileWithCloud(currentUser, source);
    };
    const onVisible = () => run('visible');
    const onOnline = () => run('online');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [currentUser, dataLoaded, reconcileWithCloud]);

  // Résolution d'un conflit : « garder le cloud »
  const keepCloud = () => {
    const c = syncConflictRef.current;
    if (!c || !currentUser) return;
    const uid = currentUser.uid;
    saveSafetyBackup(uid, stateRef.current, T('Données de cet appareil avant remplacement par le cloud'));
    applyData(c.cloud);
    saveStoredData(c.cloud.courses, c.cloud.revisions, c.cloud.subjects, c.cloud.settings, uid);
    markSynced(uid, c.cloud, c.cloudStamp);
    setHasUnsynced(false);
    setConflict(null);
    refreshSafetyBackups(uid);
    notify({
      title: t('Cloud conservé'),
      description: t('Vos données locales ont été mises de côté (Réglages › Cloud & Sauvegardes) si besoin de les récupérer.'),
      type: 'info',
    });
  };

  // Résolution d'un conflit : « écrire mon appareil sur le cloud »
  const keepLocal = async () => {
    const c = syncConflictRef.current;
    if (!c || !currentUser) return;
    if (isOffline) {
      notify({ title: t('Hors ligne'), description: t('Reconnectez-vous au réseau pour écrire sur le Cloud.'), type: 'error' });
      return;
    }
    const uid = currentUser.uid;
    setIsResolvingConflict(true);
    try {
      saveSafetyBackup(uid, c.cloud, T('Données du cloud avant écrasement par cet appareil'));
      const local = stateRef.current;
      const stamp = await mirrorLocalToCloud(uid, local);
      markSynced(uid, local, stamp);
      setHasUnsynced(hasUnsyncedChanges(uid, stateRef.current));
      setConflict(null);
      refreshSafetyBackups(uid);
      notify({
        title: t('Cloud mis à jour'),
        description: t('Le cloud contient maintenant les données de cet appareil. L\'ancienne version est mise de côté.'),
        type: 'success',
      });
    } catch (err: any) {
      notify({
        title: t('Écriture impossible'),
        description: err?.message || t('Le cloud n\'a pas pu être mis à jour. Rien n\'a été modifié.'),
        type: 'error',
      });
    } finally {
      setIsResolvingConflict(false);
    }
  };

  // Restaure une version mise de côté (la version actuelle est à son tour conservée)
  const restoreSafetyBackup = async (index: number) => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const backup = loadSafetyBackups(uid)[index];
    if (!backup) return;
    saveSafetyBackup(uid, stateRef.current, T('Données avant restauration d\'une version mise de côté'));
    applyData(backup.data);
    saveStoredData(backup.data.courses, backup.data.revisions, backup.data.subjects, backup.data.settings, uid);
    refreshSafetyBackups(uid);
    if (!isOffline) {
      try {
        const stamp = await mirrorLocalToCloud(uid, backup.data);
        markSynced(uid, backup.data, stamp);
        setHasUnsynced(false);
      } catch (err) {
        console.warn('Restored data could not be pushed to Cloud yet:', err);
      }
    }
    notify({
      title: t('Version restaurée'),
      description: t('{courses} cours et {slots} créneaux restaurés.', { courses: backup.data.courses.length, slots: backup.data.revisions.length }),
      type: 'success',
    });
  };

  // Synchro manuelle (même garde-fou que les synchros automatiques)
  const syncNow = async () => {
    if (!currentUser) return;
    if (syncConflictRef.current) {
      setConflictDialogOpen(true);
      return;
    }
    if (isOffline) {
      notify({
        title: t('Hors ligne'),
        description: t('Vos modifications sont gardées sur cet appareil et seront envoyées au retour du réseau.'),
        type: 'info',
      });
      return;
    }
    await reconcileWithCloud(currentUser, 'manual');
  };

  // Import d'un fichier JSON : sauvegarde de sécurité avant remplacement, puis envoi au cloud
  const backupBeforeImport = () => {
    if (!currentUser) return;
    saveSafetyBackup(currentUser.uid, stateRef.current, T('Données avant import d\'un fichier JSON'));
    refreshSafetyBackups(currentUser.uid);
  };

  const pushImportedData = async (imported: SyncData) => {
    if (!currentUser) return;
    const stamp = await mirrorLocalToCloud(currentUser.uid, imported);
    markSynced(currentUser.uid, imported, stamp);
    setHasUnsynced(false);
  };

  const syncStatus: SyncStatus = syncConflict ? 'conflict' : isOffline ? 'offline' : hasUnsynced ? 'pending' : 'synced';

  return {
    currentUser,
    isSyncing,
    setIsSyncing,
    syncStatus,
    syncConflict,
    conflictDialogOpen,
    openConflictDialog: () => setConflictDialogOpen(true),
    closeConflictDialog: () => setConflictDialogOpen(false),
    isResolvingConflict,
    safetyBackups,
    syncNow,
    keepCloud,
    keepLocal,
    restoreSafetyBackup,
    backupBeforeImport,
    pushImportedData,
  };
}
