import { Dispatch, SetStateAction } from 'react';
import { AppSettings, Course, MasteryLevel, RevisionItem, Subject, ToastMessage } from '../types';
import { applyCascadeShift, generateRevisionsForCourse } from '../utils/jMethod';
import { assignStartTimes, placeRevisionAtTime } from '../utils/dayLayout';
import { getTodayIso, formatFrenchDate } from '../utils/dateUtils';
import {
  syncRevisionToCloud,
  syncRevisionsBatchToCloud,
  syncCourseToCloud,
  deleteCourseFromCloud,
  deleteSubjectsFromCloud,
} from '../utils/firebase';
import { t } from '../i18n';

interface UseStudyDataOptions {
  courses: Course[];
  revisions: RevisionItem[];
  subjects: Subject[];
  settings: AppSettings;
  setCourses: Dispatch<SetStateAction<Course[]>>;
  setRevisions: Dispatch<SetStateAction<RevisionItem[]>>;
  setSubjects: Dispatch<SetStateAction<Subject[]>>;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  /** Utilisateur connecté : active les écritures ciblées vers le cloud. */
  cloudUid?: string;
  notify: (toast: ToastMessage) => void;
  /** Garde la fiche ouverte à jour quand son cours change. */
  setSelectedCourseForDetail: Dispatch<SetStateAction<Course | null>>;
}

/**
 * Actions sur les cours, créneaux et matières : état local + écritures ciblées vers le cloud.
 * Les règles de planification pures sont dans utils/jMethod.ts (testées).
 */
export function useStudyData({
  courses,
  revisions,
  subjects,
  settings,
  setCourses,
  setRevisions,
  setSubjects,
  setSettings,
  cloudUid,
  notify,
  setSelectedCourseForDetail,
}: UseStudyDataOptions) {
  // Handler: Add new course
  const handleSaveNewCourse = (
    courseData: {
      title: string;
      itemCode: string;
      subjectId: string;
      j0Date: string;
      activeJList: number[];
      mastery: MasteryLevel;
      notes: string;
    },
    saveAsDefaultPattern: boolean
  ) => {
    const newCourseId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCourse: Course = {
      id: newCourseId,
      title: courseData.title,
      itemCode: courseData.itemCode,
      subjectId: courseData.subjectId,
      j0Date: courseData.j0Date,
      activeJList: courseData.activeJList,
      mastery: courseData.mastery,
      notes: courseData.notes,
      createdAt: getTodayIso(),
    };

    // Chaque créneau est posé là où il y a de la place dans la plage autorisée de son jour
    const newRevisions = assignStartTimes(
      revisions,
      generateRevisionsForCourse(newCourseId, courseData.j0Date, courseData.activeJList, settings),
      settings,
      false,
      // Un J0 d'aujourd'hui se place à partir de l'heure actuelle, pas avant
      { date: getTodayIso(), minutes: new Date().getHours() * 60 + new Date().getMinutes() }
    );

    setCourses((prev) => [newCourse, ...prev]);
    setRevisions((prev) => [...prev, ...newRevisions]);

    if (saveAsDefaultPattern) {
      setSettings((prev) => ({
        ...prev,
        defaultJPattern: courseData.activeJList,
      }));
    }

    notify({
      title: t('Cours planifié avec succès'),
      description: t('{n} créneaux de révision créés pour « {title} ».', { n: newRevisions.length, title: courseData.title }),
      type: 'success',
    });
  };

  // Handler: Cascade shift. `exactStartMinutes` (glisser-déposer entre jours) pose le créneau à cette heure ;
  // sinon il est replacé là où il y a de la place dans la plage du nouveau jour.
  const handleConfirmShift = (
    revisionId: string,
    newDate: string,
    autoCascade: boolean,
    exactStartMinutes?: number
  ) => {
    const targetRev = revisions.find((r) => r.id === revisionId);
    if (!targetRev) return;

    const shifted = applyCascadeShift(revisions, revisionId, newDate, autoCascade);

    // Les créneaux qui changent de jour sont replacés dans la plage autorisée de leur nouveau jour
    // (en gardant leur heure si elle y est libre)
    const originalDate = new Map(revisions.map((r) => [r.id, r.scheduledDate]));
    const movedIds = new Set(
      shifted.updatedRevisions.filter((r) => originalDate.get(r.id) !== r.scheduledDate).map((r) => r.id)
    );
    let base = shifted.updatedRevisions;
    const exact = exactStartMinutes !== undefined && movedIds.has(revisionId);
    if (exact) base = placeRevisionAtTime(base, revisionId, exactStartMinutes!, settings);
    const toPlaceIds = new Set([...movedIds].filter((id) => !(exact && id === revisionId)));
    const placed = new Map(
      assignStartTimes(
        base.filter((r) => !toPlaceIds.has(r.id)),
        base.filter((r) => toPlaceIds.has(r.id)),
        settings,
        true
      ).map((r) => [r.id, r])
    );
    const finalRevisions = base.map((r) => placed.get(r.id) ?? r);

    // Tout ce qui a bougé (jour, heure ou rang), y compris les créneaux repoussés sur le jour d'arrivée
    const before = new Map(revisions.map((r) => [r.id, r]));
    const changed = finalRevisions.filter((r) => {
      const o = before.get(r.id);
      return !o || o.scheduledDate !== r.scheduledDate || o.startTime !== r.startTime || o.slotOrder !== r.slotOrder;
    });
    const originals = changed.map((r) => before.get(r.id)).filter((r): r is RevisionItem => !!r);
    setRevisions(finalRevisions);

    // Déplacer un J0 déplace aussi la date de départ du cours
    const course = courses.find((c) => c.id === targetRev.courseId);
    const updatedCourse: Course | undefined =
      targetRev.jIndex === 0 && course ? { ...course, j0Date: newDate } : undefined;
    if (updatedCourse) {
      setCourses((prev) => prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c)));
      setSelectedCourseForDetail((prev) => (prev && prev.id === updatedCourse.id ? updatedCourse : prev));
    }

    if (cloudUid) {
      syncRevisionsBatchToCloud(cloudUid, changed).catch((e) => console.warn('Targeted shift sync error:', e));
      if (updatedCourse) {
        syncCourseToCloud(cloudUid, updatedCourse).catch((e) => console.warn('Targeted course sync error:', e));
      }
    }

    // Annuler : remet les créneaux touchés (et la date de départ du cours) comme avant
    const undo = () => {
      const originalsById = new Map(originals.map((r) => [r.id, r]));
      setRevisions((prev) => prev.map((r) => originalsById.get(r.id) ?? r));
      if (updatedCourse && course) {
        setCourses((prev) => prev.map((c) => (c.id === course.id ? course : c)));
        setSelectedCourseForDetail((prev) => (prev && prev.id === course.id ? course : prev));
      }
      if (cloudUid) {
        syncRevisionsBatchToCloud(cloudUid, originals).catch((e) => console.warn('Undo shift sync error:', e));
        if (updatedCourse && course) {
          syncCourseToCloud(cloudUid, course).catch((e) => console.warn('Undo course sync error:', e));
        }
      }
      notify({ title: t('Déplacement annulé'), description: t('Les créneaux sont revenus à leur place.'), type: 'info' });
    };

    const targetCourseTitle = course?.title || t('le cours');
    if (shifted.shiftedCount > 0 && autoCascade) {
      notify({
        title: t('Cascade appliquée avec succès'),
        description: t('J{j} déplacé au {date}. {count} révision(s) suivante(s) ({labels}) automatiquement décalée(s) de {delta} jours pour {course}.', {
          j: targetRev.jIndex,
          date: formatFrenchDate(newDate),
          count: shifted.shiftedCount,
          labels: shifted.shiftedJLabels.slice(1).join(', '),
          delta: shifted.deltaDays > 0 ? `+${shifted.deltaDays}` : shifted.deltaDays,
          course: targetCourseTitle,
        }),
        type: 'info',
        action: { label: t('Annuler'), onClick: undo },
      });
    } else {
      notify({
        title: t('Créneau décalé'),
        description: t('J{j} déplacé au {date}.', { j: targetRev.jIndex, date: formatFrenchDate(newDate) }),
        type: 'info',
        action: { label: t('Annuler'), onClick: undo },
      });
    }
  };

  // Handler: drag a slot to another day on the week timeline (follows the automatic-cascade setting)
  const handleMoveSlotToDay = (revisionId: string, newDate: string, startMinutes: number) =>
    handleConfirmShift(revisionId, newDate, settings.autoCascadeShift, startMinutes);

  // Handler: Complete revision & update knowledge rating
  const handleConfirmComplete = (
    revisionId: string,
    rating: MasteryLevel,
    notes?: string,
    updateCourseMastery: boolean = true
  ) => {
    const targetRev = revisions.find((r) => r.id === revisionId);
    if (!targetRev) return;

    let updatedRev: RevisionItem | undefined;
    setRevisions((prev) =>
      prev.map((r) => {
        if (r.id === revisionId) {
          updatedRev = {
            ...r,
            completed: true,
            completedDate: getTodayIso(),
            rating,
            notes: notes || r.notes,
          };
          return updatedRev;
        }
        return r;
      })
    );

    let updatedCourse: Course | undefined;
    if (updateCourseMastery) {
      setCourses((prev) =>
        prev.map((c) => {
          if (c.id === targetRev.courseId) {
            updatedCourse = {
              ...c,
              mastery: rating,
            };
            return updatedCourse;
          }
          return c;
        })
      );
      setSelectedCourseForDetail((prev) =>
        prev && prev.id === targetRev.courseId && updatedCourse ? updatedCourse : prev
      );
    }

    if (cloudUid) {
      if (updatedRev) {
        syncRevisionToCloud(cloudUid, updatedRev).catch((e) =>
          console.warn('Targeted complete revision sync error:', e)
        );
      }
      if (updatedCourse) {
        syncCourseToCloud(cloudUid, updatedCourse).catch((e) =>
          console.warn('Targeted course mastery sync error:', e)
        );
      }
    }

    notify({
      title: t('Créneau validé !'),
      description: t('Séance J{j} validée avec note de maîtrise ({rating}★).', { j: targetRev.jIndex, rating }),
      type: 'success',
    });
  };

  // Handler: Undo a completed revision (annuler un "Fait")
  const handleUndoComplete = (revisionId: string): boolean => {
    const targetRev = revisions.find((r) => r.id === revisionId);
    if (!targetRev || !targetRev.completed) return false;

    // Le créneau redevient "à faire" (les notes de séance sont conservées)
    const updatedRev: RevisionItem = {
      ...targetRev,
      completed: false,
      completedDate: undefined,
      rating: undefined,
    };
    setRevisions((prev) => prev.map((r) => (r.id === revisionId ? updatedRev : r)));

    // Si c'était la dernière révision validée du cours, la maîtrise revient
    // à la note de la révision validée précédente (ou 0 = Nouveau).
    const completedOfCourse = revisions
      .filter((r) => r.courseId === targetRev.courseId && r.completed)
      .sort((a, b) => b.jIndex - a.jIndex);
    const targetCourse = courses.find((c) => c.id === targetRev.courseId);
    let updatedCourse: Course | undefined;

    if (targetCourse && completedOfCourse[0]?.id === revisionId) {
      const previousRating: MasteryLevel =
        completedOfCourse.find((r) => r.id !== revisionId && r.rating)?.rating ?? 0;
      const newCourse: Course = { ...targetCourse, mastery: previousRating };
      updatedCourse = newCourse;
      setCourses((prev) => prev.map((c) => (c.id === newCourse.id ? newCourse : c)));
      setSelectedCourseForDetail((prev) => (prev && prev.id === newCourse.id ? newCourse : prev));
    }

    if (cloudUid) {
      syncRevisionToCloud(cloudUid, updatedRev).catch((e) =>
        console.warn('Undo complete revision sync error:', e)
      );
      if (updatedCourse) {
        syncCourseToCloud(cloudUid, updatedCourse).catch((e) =>
          console.warn('Undo course mastery sync error:', e)
        );
      }
    }

    notify({
      title: t('Validation annulée'),
      description: t('Le créneau J{j} est de nouveau à faire.', { j: targetRev.jIndex }),
      type: 'success',
    });
    return true;
  };

  // Handler: Update Course (title, itemCode, subjectId, notes, mastery)
  const handleUpdateCourse = (
    courseId: string,
    updates: {
      title?: string;
      itemCode?: string;
      subjectId?: string;
      notes?: string;
      mastery?: MasteryLevel;
    }
  ) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, ...updates } : c))
    );

    setSelectedCourseForDetail((prev) =>
      prev && prev.id === courseId ? { ...prev, ...updates } : prev
    );

    notify({
      title: t('Cours mis à jour'),
      description: t('Les modifications sont synchronisées avec tous les créneaux existants.'),
      type: 'success',
    });
  };

  // Handler: Update Course Mastery directly from catalog
  const handleUpdateCourseMastery = (courseId: string, newLevel: MasteryLevel) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, mastery: newLevel } : c))
    );
  };

  // Handler: Update Course Notes
  const handleUpdateCourseNotes = (courseId: string, notes: string) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, notes } : c))
    );
  };

  const handleDeleteCourse = (courseId: string) => {
    const revisionIds = revisions
      .filter((r) => r.courseId === courseId)
      .map((r) => r.id);

    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    setRevisions((prev) => prev.filter((r) => r.courseId !== courseId));
    setSelectedCourseForDetail((prev) => (prev?.id === courseId ? null : prev));
    if (cloudUid) {
      deleteCourseFromCloud(cloudUid, courseId, revisionIds).catch((err) =>
        console.warn('Cloud delete error:', err)
      );
    }
    notify({
      title: t('Cours supprimé'),
      description: t('Le cours et ses révisions associées ont été supprimés.'),
      type: 'info',
    });
  };

  // Handler: Save subjects
  // Avant de supprimer une matière : rattacher ses cours à une autre matière, ou les supprimer avec leurs révisions
  const handleResolveSubjectCourses = (
    subjectId: string,
    resolution: { kind: 'reassign'; toSubjectId: string } | { kind: 'delete' }
  ) => {
    const attached = courses.filter((c) => c.subjectId === subjectId);
    if (attached.length === 0) return;
    const ids = new Set(attached.map((c) => c.id));

    if (resolution.kind === 'reassign') {
      const to = resolution.toSubjectId;
      setCourses((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, subjectId: to } : c)));
      setSelectedCourseForDetail((prev) => (prev && ids.has(prev.id) ? { ...prev, subjectId: to } : prev));
      if (cloudUid) {
        attached.forEach((c) =>
          syncCourseToCloud(cloudUid, { ...c, subjectId: to }).catch((err) =>
            console.warn('Cloud course update error:', err)
          )
        );
      }
      return;
    }

    setCourses((prev) => prev.filter((c) => !ids.has(c.id)));
    setRevisions((prev) => prev.filter((r) => !ids.has(r.courseId)));
    setSelectedCourseForDetail((prev) => (prev && ids.has(prev.id) ? null : prev));
    if (cloudUid) {
      attached.forEach((c) =>
        deleteCourseFromCloud(
          cloudUid,
          c.id,
          revisions.filter((r) => r.courseId === c.id).map((r) => r.id)
        ).catch((err) => console.warn('Cloud delete error:', err))
      );
    }
  };

  const handleSaveSubjects = (newSubjects: Subject[]) => {
    const removedIds = subjects
      .filter((s) => !newSubjects.some((n) => n.id === s.id))
      .map((s) => s.id);

    setSubjects(newSubjects);
    if (cloudUid && removedIds.length > 0) {
      deleteSubjectsFromCloud(cloudUid, removedIds).catch((err) =>
        console.warn('Cloud subjects delete error:', err)
      );
    }
    notify({
      title: t('Disciplines mises à jour'),
      description: t('{n} matières médicales enregistrées.', { n: newSubjects.length }),
      type: 'success',
    });
  };

  // Handler: move slots on the day timeline (start time + rank for every slot of the day)
  const handleMoveSlots = (updates: { id: string; startTime: string; slotOrder: number }[]) => {
    const byId = new Map(updates.map((u) => [u.id, u]));
    const changed: RevisionItem[] = [];
    revisions.forEach((r) => {
      const u = byId.get(r.id);
      if (u && (r.startTime !== u.startTime || r.slotOrder !== u.slotOrder)) {
        changed.push({ ...r, startTime: u.startTime, slotOrder: u.slotOrder });
      }
    });
    if (changed.length === 0) return;

    const changedById = new Map(changed.map((r) => [r.id, r]));
    setRevisions((prev) => prev.map((r) => changedById.get(r.id) ?? r));

    if (cloudUid) {
      syncRevisionsBatchToCloud(cloudUid, changed).catch((e) => console.warn('Slot move sync error:', e));
    }
  };

  return {
    handleSaveNewCourse,
    handleConfirmShift,
    handleConfirmComplete,
    handleUndoComplete,
    handleUpdateCourse,
    handleUpdateCourseMastery,
    handleUpdateCourseNotes,
    handleDeleteCourse,
    handleSaveSubjects,
    handleResolveSubjectCourses,
    handleMoveSlots,
    handleMoveSlotToDay,
  };
}
