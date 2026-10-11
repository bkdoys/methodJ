import { Dispatch, SetStateAction } from 'react';
import { AppSettings, Course, CourseLink, LinkType, MasteryLevel, RevisionItem, Subject, ToastMessage } from '../types';
import { applyCascadeShift, generateRevisionsForCourse } from '../utils/jMethod';
import {
  assignStartTimes,
  getDayBreaks,
  getDayWindow,
  placeRevisionAtTime,
  placementsToUpdates,
  resizeSlotInLayout,
} from '../utils/dayLayout';
import { getTodayIso, formatFrenchDate } from '../utils/dateUtils';
import {
  syncRevisionToCloud,
  syncRevisionsBatchToCloud,
  syncCourseToCloud,
  deleteCourseFromCloud,
  deleteSubjectsFromCloud,
} from '../utils/firebase';
import { plural, t } from '../i18n';

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
      folderId?: string;
      links?: CourseLink[];
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
      ...(courseData.folderId ? { folderId: courseData.folderId } : {}),
      ...(courseData.links?.length ? { links: courseData.links } : {}),
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
  };

  // Cœur d'un décalage, sur des tableaux passés en argument (et non l'état React) : il sert au décalage d'un créneau
  // comme à l'application d'un plan complet, où plusieurs décalages s'enchaînent sur un état à jour.
  // Les créneaux qui changent de jour sont replacés dans la plage autorisée de leur nouveau jour
  // (en gardant leur heure si elle y est libre).
  const shiftOnce = (
    revs: RevisionItem[],
    crs: Course[],
    revisionId: string,
    newDate: string,
    autoCascade: boolean,
    exactStartMinutes?: number
  ) => {
    const targetRev = revs.find((r) => r.id === revisionId);
    if (!targetRev) return null;

    const shifted = applyCascadeShift(revs, revisionId, newDate, autoCascade);
    const originalDate = new Map(revs.map((r) => [r.id, r.scheduledDate]));
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

    // Déplacer un J0 déplace aussi la date de départ du cours
    const course = crs.find((c) => c.id === targetRev.courseId);
    const updatedCourse: Course | undefined =
      targetRev.jIndex === 0 && course ? { ...course, j0Date: newDate } : undefined;
    return { targetRev, shifted, finalRevisions, course, updatedCourse };
  };

  // Handler: Cascade shift. `exactStartMinutes` (glisser-déposer entre jours) pose le créneau à cette heure ;
  // sinon il est replacé là où il y a de la place dans la plage du nouveau jour.
  const handleConfirmShift = (
    revisionId: string,
    newDate: string,
    autoCascade: boolean,
    exactStartMinutes?: number
  ) => {
    const result = shiftOnce(revisions, courses, revisionId, newDate, autoCascade, exactStartMinutes);
    if (!result) return;
    const { targetRev, shifted, finalRevisions, course, updatedCourse } = result;

    // Tout ce qui a bougé (jour, heure ou rang), y compris les créneaux repoussés sur le jour d'arrivée
    const before = new Map(revisions.map((r) => [r.id, r]));
    const changed = finalRevisions.filter((r) => {
      const o = before.get(r.id);
      return !o || o.scheduledDate !== r.scheduledDate || o.startTime !== r.startTime || o.slotOrder !== r.slotOrder;
    });
    const originals = changed.map((r) => before.get(r.id)).filter((r): r is RevisionItem => !!r);
    setRevisions(finalRevisions);

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

  // Handler: applique un plan (lissage ou rattrapage) : les décalages s'enchaînent sur un tableau de travail,
  // puis une seule mise à jour d'état, une seule synchro ciblée et un seul message avec « Annuler ».
  const handleApplyShifts = (moves: { revisionId: string; toDate: string }[]) => {
    if (moves.length === 0) return;
    let workRevs = revisions;
    let workCourses = courses;
    let applied = 0;
    for (const m of moves) {
      const res = shiftOnce(workRevs, workCourses, m.revisionId, m.toDate, settings.autoCascadeShift);
      if (!res) continue;
      workRevs = res.finalRevisions;
      if (res.updatedCourse) {
        const updated = res.updatedCourse;
        workCourses = workCourses.map((c) => (c.id === updated.id ? updated : c));
      }
      applied++;
    }
    if (applied === 0) return;

    const before = new Map(revisions.map((r) => [r.id, r]));
    const changed = workRevs.filter((r) => {
      const o = before.get(r.id);
      return !o || o.scheduledDate !== r.scheduledDate || o.startTime !== r.startTime || o.slotOrder !== r.slotOrder;
    });
    const originals = changed.map((r) => before.get(r.id)).filter((r): r is RevisionItem => !!r);
    const courseBefore = new Map(courses.map((c) => [c.id, c]));
    const changedCourses = workCourses.filter((c) => courseBefore.get(c.id) !== c);
    const originalCourses = changedCourses.map((c) => courseBefore.get(c.id)).filter((c): c is Course => !!c);

    setRevisions(workRevs);
    if (changedCourses.length > 0) {
      const byId = new Map(changedCourses.map((c) => [c.id, c]));
      setCourses((prev) => prev.map((c) => byId.get(c.id) ?? c));
    }
    if (cloudUid) {
      syncRevisionsBatchToCloud(cloudUid, changed).catch((e) => console.warn('Plan sync error:', e));
      changedCourses.forEach((c) => syncCourseToCloud(cloudUid, c).catch((e) => console.warn('Plan course sync error:', e)));
    }

    const undo = () => {
      const revById = new Map(originals.map((r) => [r.id, r]));
      setRevisions((prev) => prev.map((r) => revById.get(r.id) ?? r));
      if (originalCourses.length > 0) {
        const courseById = new Map(originalCourses.map((c) => [c.id, c]));
        setCourses((prev) => prev.map((c) => courseById.get(c.id) ?? c));
      }
      if (cloudUid) {
        syncRevisionsBatchToCloud(cloudUid, originals).catch((e) => console.warn('Undo plan sync error:', e));
        originalCourses.forEach((c) => syncCourseToCloud(cloudUid, c).catch((e) => console.warn('Undo plan course sync error:', e)));
      }
    };
    notify({
      title: t('Plan appliqué'),
      description: plural(
        applied,
        '{n} déplacement appliqué ({total} créneau au total).',
        '{n} déplacements appliqués ({total} créneaux au total).',
        { total: changed.length }
      ),
      type: 'info',
      action: { label: t('Annuler'), onClick: undo },
    });
  };

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
    return true;
  };

  // Handler: Update Course (title, itemCode, subjectId, notes, mastery)
  const handleUpdateCourse = (
    courseId: string,
    updates: {
      title?: string;
      itemCode?: string;
      subjectId?: string;
      /** Clé présente avec `undefined` = sortir le cours de son dossier. */
      folderId?: string;
      links?: CourseLink[];
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
  };

  // Types de liens (liste commune à tous les cours, dans les réglages)
  const handleChangeLinkTypes = (linkTypes: LinkType[]) => {
    setSettings((prev) => ({ ...prev, linkTypes }));
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
      // Les dossiers appartiennent à l'ancienne discipline : les cours arrivent à la racine de la nouvelle
      setCourses((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, subjectId: to, folderId: undefined } : c)));
      setSelectedCourseForDetail((prev) => (prev && ids.has(prev.id) ? { ...prev, subjectId: to, folderId: undefined } : prev));
      if (cloudUid) {
        attached.forEach((c) =>
          syncCourseToCloud(cloudUid, { ...c, subjectId: to, folderId: undefined }).catch((err) =>
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
  };

  // Handler: arborescence de rangement d'une discipline (ajout / renommage / suppression de dossiers).
  // `moveCourses` : les cours d'un dossier supprimé passent dans `to` (undefined = racine de la discipline).
  const handleUpdateSubjectFolders = (
    updated: Subject,
    moveCourses?: { from: string; to: string | undefined }
  ) => {
    setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (!moveCourses) return;
    const moved = courses.filter((c) => c.subjectId === updated.id && c.folderId === moveCourses.from);
    if (moved.length === 0) return;
    const ids = new Set(moved.map((c) => c.id));
    setCourses((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, folderId: moveCourses.to } : c)));
    setSelectedCourseForDetail((prev) => (prev && ids.has(prev.id) ? { ...prev, folderId: moveCourses.to } : prev));
    if (cloudUid) {
      moved.forEach((c) =>
        syncCourseToCloud(cloudUid, { ...c, folderId: moveCourses.to }).catch((err) =>
          console.warn('Cloud course update error:', err)
        )
      );
    }
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

  // Handler: edit the preparation note of a slot that is not done yet (empty text removes it)
  const handleUpdateSlotNotes = (id: string, notes: string) => {
    const target = revisions.find((r) => r.id === id);
    const text = notes.trim();
    if (!target || target.completed || (target.notes ?? '') === text) return;
    const updated: RevisionItem = { ...target, notes: text };
    if (!text) delete updated.notes;
    setRevisions((prev) => prev.map((r) => (r.id === id ? updated : r)));
    if (cloudUid) {
      syncRevisionToCloud(cloudUid, updated).catch((e) => console.warn('Slot note sync error:', e));
    }
  };

  // Handler: change the duration of one slot; the slots it now overlaps are pushed later (same day)
  const handleResizeSlot = (id: string, durationMinutes: number) => {
    const target = revisions.find((r) => r.id === id);
    if (!target || target.completed || target.durationMinutes === durationMinutes) return;
    const dayRevs = revisions.filter((r) => r.scheduledDate === target.scheduledDate);
    const layout = resizeSlotInLayout(
      dayRevs,
      getDayWindow(settings, target.scheduledDate).start,
      id,
      durationMinutes,
      getDayBreaks(settings, target.scheduledDate)
    );
    if (!layout) {
      notify({
        title: t('Durée non modifiée'),
        description: t('Ce créneau déborderait après minuit.'),
        type: 'error',
      });
      return;
    }
    const updates = new Map(placementsToUpdates(layout).map((u) => [u.id, u]));
    const changed: RevisionItem[] = [];
    revisions.forEach((r) => {
      const u = updates.get(r.id);
      if (!u) return;
      const next = { ...r, startTime: u.startTime, slotOrder: u.slotOrder, durationMinutes: r.id === id ? durationMinutes : r.durationMinutes };
      if (next.startTime !== r.startTime || next.slotOrder !== r.slotOrder || next.durationMinutes !== r.durationMinutes) {
        changed.push(next);
      }
    });
    const changedById = new Map(changed.map((r) => [r.id, r]));
    setRevisions((prev) => prev.map((r) => changedById.get(r.id) ?? r));
    if (cloudUid) {
      syncRevisionsBatchToCloud(cloudUid, changed).catch((e) => console.warn('Slot resize sync error:', e));
    }
  };

  return {
    handleSaveNewCourse,
    handleConfirmShift,
    handleApplyShifts,
    handleConfirmComplete,
    handleUndoComplete,
    handleUpdateCourse,
    handleUpdateCourseMastery,
    handleChangeLinkTypes,
    handleUpdateCourseNotes,
    handleDeleteCourse,
    handleSaveSubjects,
    handleResolveSubjectCourses,
    handleUpdateSubjectFolders,
    handleMoveSlots,
    handleResizeSlot,
    handleUpdateSlotNotes,
    handleMoveSlotToDay,
  };
}
