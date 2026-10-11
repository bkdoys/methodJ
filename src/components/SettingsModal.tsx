import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, Course, LinkType, RevisionItem, Subject } from '../types';
import { DEFAULT_J_PATTERNS, getJPool, getSlotDurationMinutes } from '../utils/jMethod';
import { formatMinutes } from '../utils/dateUtils';
import { LANGUAGES, Lang, getLang, getLocale, plural } from '../i18n';
import { PRESET_COURSE_COLORS } from '../utils/colorUtils';
import { TimeSelect } from './TimeSelect';
import { BreaksEditor, BreaksValue } from './BreaksEditor';
import { DurationSelect } from './DurationSelect';
import { JIntervalAdder } from './JIntervalAdder';
import {
  BlockDetails,
  defaultDayWindowStrings,
  getBlockDetails,
  SubjectDisplay,
  getMultiDayCount,
  MULTI_DAY_MAX,
  MULTI_DAY_MIN,
  formatTime,
  getDayWindow,
  getTimelineConfig,
  parseTime,
  STEP_OPTIONS,
} from '../utils/dayLayout';
import { parseSubjectsImport } from '../utils/subjectsImport';
import { LinkTypesManager } from './LinkTypesManager';
import { CalendarExportSection } from './CalendarExportSection';
import { PlanningRules } from './PlanningRules';
import { getLinkTypes } from '../utils/courseLinks';
import {
  Settings,
  Save,
  Download,
  Upload,
  RotateCcw,
  X,
  Plus,
  Trash2,
  Edit2,
  Sun,
  Moon,
  AlertTriangle,
  Palette,
  Layers,
  Clock,
  Cloud,
  LogOut,
  LogIn,
  RefreshCw,
  Brain,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';

import { MASTERY_CONFIG } from './MasteryBadge';
import { MasteryLevel } from '../types';
import { t } from '../i18n';
import { APP_NAME } from '../appInfo';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  /** Enregistre aussitôt la liste des types de liens (commune à tous les cours). */
  onChangeLinkTypes: (types: LinkType[]) => void;
  /** Faux sans configuration Firebase : l'onglet Cloud explique comment la brancher. */
  cloudAvailable?: boolean;
  subjects: Subject[];
  onSaveSubjects: (newSubjects: Subject[]) => void;
  /** Sort des cours d'une matière qu'on supprime : les rattacher à une autre matière ou les supprimer. */
  onResolveSubjectCourses?: (
    subjectId: string,
    resolution: { kind: 'reassign'; toSubjectId: string } | { kind: 'delete' }
  ) => void;
  courses: Course[];
  revisions: RevisionItem[];
  onExportBackup: () => void;
  onImportBackup: (jsonContent: string) => void;
  onResetSeedData: () => void;
  currentUser?: { uid?: string | null; email?: string | null; displayName?: string | null; isAnonymous?: boolean } | null;
  onLoginWithEmail?: (email: string, pass: string) => Promise<void>;
  onRegisterWithEmail?: (email: string, pass: string) => Promise<void>;
  onLoginWithGoogle?: () => void;
  onLoginWithGoogleRedirect?: () => void;
  onLogout?: () => void;
  onSyncCloudNow?: () => void;
  isSyncing?: boolean;
  /** Versions mises de côté avant un écrasement local/cloud (la plus récente d'abord). */
  safetyBackups?: { at: string; reason: string; courses: number; revisions: number }[];
  onRestoreSafetyBackup?: (index: number) => void;
  initialTab?: 'subjects' | 'planning' | 'preferences' | 'backup' | 'help';
  authError?: { code?: string; message: string; resolution?: string } | null;
  onClearAuthError?: () => void;
}

const weekdayLabels = () => [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];
/** Le n-ième jour d'une semaine de référence (0 = lundi) : sert à lire la plage d'un jour de la semaine. */
const referenceDay = (index: number) => {
  const d = new Date(2026, 9, 5 + index);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Pauses valides seulement (fin après début) ; la liste commune vide est omise, un jour vide reste (= aucune pause ce jour-là). */
function cleanBreaks(breaks: BreaksValue): BreaksValue {
  const out: BreaksValue = {};
  Object.entries(breaks).forEach(([key, list]) => {
    const valid = list.filter((b) => {
      const s = parseTime(b.start);
      const e = b.end === '23:59' ? 24 * 60 : parseTime(b.end);
      return s !== null && e !== null && e > s;
    });
    if (key !== 'all' || valid.length) out[key] = valid;
  });
  return out;
}

/** Plages personnalisées déjà enregistrées (seuls les jours modifiés y figurent). */
function customWindowsFromSettings(s: AppSettings): Record<string, { start: string; end: string }> {
  const out: Record<string, { start: string; end: string }> = {};
  weekdayLabels().forEach((_, i) => {
    if (s.dayWindows?.[String(i)]) {
      const w = getDayWindow(s, referenceDay(i));
      out[String(i)] = { start: formatTime(w.start), end: w.end >= 24 * 60 ? '23:59' : formatTime(w.end) };
    }
  });
  return out;
}

/** Bloc repliable des réglages : un en-tête cliquable, le contenu apparaît dessous. */
const SettingsSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="text-xs font-bold text-slate-900 dark:text-white">{title}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </section>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onChangeLinkTypes,
  cloudAvailable = true,
  subjects,
  onSaveSubjects,
  onResolveSubjectCourses,
  courses,
  revisions,
  onExportBackup,
  onImportBackup,
  onResetSeedData,
  currentUser,
  onLoginWithEmail,
  onRegisterWithEmail,
  onLoginWithGoogle,
  onLoginWithGoogleRedirect,
  onLogout,
  onSyncCloudNow,
  isSyncing = false,
  safetyBackups = [],
  onRestoreSafetyBackup,
  initialTab = 'subjects',
  authError,
  onClearAuthError,
}) => {
  // Local settings state
  const [defaultPattern, setDefaultPattern] = useState<number[]>(settings.defaultJPattern);
  const [jPool, setJPool] = useState<number[]>(getJPool(settings));
  // Durée des créneaux : valeur par défaut + réglages propres à certains J
  const slotDurationsFromSettings = () => ({
    def: getSlotDurationMinutes(99, settings),
    byJ: Object.fromEntries(
      getJPool(settings)
        .concat(settings.defaultJPattern)
        .filter((j) => settings.slotDurationByJ?.[String(j)] !== undefined || (!settings.slotDurationByJ && j <= 1))
        .map((j) => [String(j), getSlotDurationMinutes(j, settings)])
    ) as Record<string, number>,
  });
  const [slotDefault, setSlotDefault] = useState<number>(() => slotDurationsFromSettings().def);
  const [slotByJ, setSlotByJ] = useState<Record<string, number>>(() => slotDurationsFromSettings().byJ);
  const [newSlotJ, setNewSlotJ] = useState('');
  const [isAddingException, setIsAddingException] = useState(false);
  const [newSlotMinutes, setNewSlotMinutes] = useState<number>(60);
  const [jToRemove, setJToRemove] = useState<{ val: number; used: number } | null>(null);
  const [autoCascade, setAutoCascade] = useState<boolean>(settings.autoCascadeShift);
  const [dailyTargetHours, setDailyTargetHours] = useState<number>(settings.dailyTargetHours);
  const [dayStartTime, setDayStartTime] = useState<string>(settings.dayStartTime);
  const [timelineStartHour, setTimelineStartHour] = useState<number>(getTimelineConfig(settings).startHour);
  const [timelineEndHour, setTimelineEndHour] = useState<number>(getTimelineConfig(settings).endHour);
  const [timelineStepMinutes, setTimelineStepMinutes] = useState<number>(getTimelineConfig(settings).stepMinutes);
  const [customWindows, setCustomWindows] = useState(() => customWindowsFromSettings(settings));
  const [breaks, setBreaks] = useState<BreaksValue>(() => settings.breaks ?? {});
  const [multiDayCount, setMultiDayCount] = useState<number>(getMultiDayCount(settings));
  const [blockDetails, setBlockDetails] = useState<BlockDetails>(getBlockDetails(settings));
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme || 'light');
  const [language, setLanguage] = useState<Lang>(settings.language ?? getLang());

  // Cloud auth UI sub-tab state
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Local subjects state
  const [localSubjects, setLocalSubjects] = useState<Subject[]>(subjects);
  // Suppression d'une matière qui a des cours : choix du sort de ces cours
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deleteMode, setDeleteMode] = useState<'reassign' | 'delete'>('reassign');
  const [reassignToId, setReassignToId] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subNameInput, setSubNameInput] = useState('');
  const [subCodeInput, setSubCodeInput] = useState('');
  const [subColorInput, setSubColorInput] = useState('#0d9488');

  // Add subject state
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubColor, setNewSubColor] = useState('#0d9488');

  // Active tab in settings modal
  const [activeTab, setActiveTab] = useState<'subjects' | 'planning' | 'preferences' | 'backup' | 'help'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen) {
      setDefaultPattern(settings.defaultJPattern);
      setJPool(getJPool(settings));
      setSlotDefault(slotDurationsFromSettings().def);
      setSlotByJ(slotDurationsFromSettings().byJ);
      setAutoCascade(settings.autoCascadeShift);
      setDailyTargetHours(settings.dailyTargetHours);
      setDayStartTime(settings.dayStartTime);
      const tl = getTimelineConfig(settings);
      setTimelineStartHour(tl.startHour);
      setTimelineEndHour(tl.endHour);
      setTimelineStepMinutes(tl.stepMinutes);
      setCustomWindows(customWindowsFromSettings(settings));
      setBreaks(settings.breaks ?? {});
      setMultiDayCount(getMultiDayCount(settings));
      setBlockDetails(getBlockDetails(settings));
      setTheme(settings.theme || 'light');
      setLanguage(settings.language ?? getLang());
      setLocalSubjects(subjects);
    }
  }, [isOpen, settings, subjects]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const subjectsFileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // J toggle handlers
  const toggleJ = (val: number) => {
    if (val === 0) return;
    if (defaultPattern.includes(val)) {
      setDefaultPattern(defaultPattern.filter((j) => j !== val));
    } else {
      setDefaultPattern([...defaultPattern, val].sort((a, b) => a - b));
    }
  };

  // Retire un intervalle de la liste (J0 est obligatoire) et des répétitions par défaut
  const removeFromPool = (val: number) => {
    if (val === 0) return;
    // Information seulement : les cours existants gardent leurs révisions, on peut retirer quand même
    const used = courses.filter((c) => c.activeJList?.includes(val)).length;
    if (used > 0) {
      setJToRemove({ val, used });
      return;
    }
    setJPool(jPool.filter((j) => j !== val));
    setDefaultPattern(defaultPattern.filter((j) => j !== val));
  };

  // Subject management handlers
  const handleStartEditSubject = (sub: Subject) => {
    setEditingSubjectId(sub.id);
    setSubNameInput(sub.name);
    setSubCodeInput(sub.code);
    setSubColorInput(sub.color);
  };

  const handleSaveEditSubject = (subjectId: string) => {
    if (!subNameInput.trim()) return;
    const updated = localSubjects.map((s) => {
      if (s.id === subjectId) {
        return {
          ...s,
          name: subNameInput.trim(),
          code: subCodeInput.trim() || 'MED',
          color: subColorInput,
          accentBg: `${subColorInput}15`,
        };
      }
      return s;
    });
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setEditingSubjectId(null);
  };

  const handleAddNewSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const newSub: Subject = {
      id: `sub_${Date.now()}`,
      name: newSubName.trim(),
      code: newSubCode.trim().toUpperCase() || 'MED',
      color: newSubColor,
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-200',
      accentBg: `${newSubColor}15`,
    };
    const updated = [...localSubjects, newSub];
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setNewSubName('');
    setNewSubCode('');
    setIsAddingSubject(false);
  };

  // Suppression : simple confirmation sans cours ; sinon on demande ce que deviennent les cours rattachés
  const handleDeleteSubject = (subject: Subject) => {
    const attachedCourses = courses.filter((c) => c.subjectId === subject.id);
    const count = attachedCourses.length;

    if (count === 0) {
      if (window.confirm(t('Supprimer la matière « {name} » ?', { name: subject.name }))) {
        const updated = localSubjects.filter((s) => s.id !== subject.id);
        setLocalSubjects(updated);
        onSaveSubjects(updated);
      }
      return;
    }

    const others = localSubjects.filter((s) => s.id !== subject.id);
    setDeleteMode(others.length > 0 ? 'reassign' : 'delete');
    setReassignToId(others[0]?.id ?? '');
    setSubjectToDelete(subject);
  };

  const confirmDeleteSubject = () => {
    if (!subjectToDelete) return;
    onResolveSubjectCourses?.(
      subjectToDelete.id,
      deleteMode === 'reassign' ? { kind: 'reassign', toSubjectId: reassignToId } : { kind: 'delete' }
    );
    const updated = localSubjects.filter((s) => s.id !== subjectToDelete.id);
    setLocalSubjects(updated);
    onSaveSubjects(updated);
    setSubjectToDelete(null);
  };

  const handleImportSubjects = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file) return;
    if (file.size > 1_000_000) {
      setImportMsg({ type: 'error', text: t('Fichier trop volumineux (max 1 Mo).') });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { added, updated: enriched, foldersAdded, duplicates, invalid } = parseSubjectsImport(
          String(ev.target?.result ?? ''),
          localSubjects
        );
        const changed = added.length > 0 || enriched.length > 0;
        if (changed) {
          const enrichedById = new Map(enriched.map((s) => [s.id, s]));
          const updated = [...localSubjects.map((s) => enrichedById.get(s.id) ?? s), ...added];
          setLocalSubjects(updated);
          onSaveSubjects(updated);
        }
        const extra = [
          duplicates ? t('{n} doublon(s) ignoré(s)', { n: duplicates }) : '',
          invalid ? t('{n} ligne(s) invalide(s)', { n: invalid }) : '',
        ].filter(Boolean).join(', ');
        setImportMsg({
          type: changed ? 'ok' : 'error',
          text: `${t('{n} matière(s) importée(s)', { n: added.length })}${foldersAdded ? ` · ${t('{n} dossier(s) créé(s)', { n: foldersAdded })}` : ''}${extra ? ` · ${extra}` : ''}.`,
        });
      } catch (err) {
        setImportMsg({
          type: 'error',
          text: err instanceof Error ? t('Import impossible : {msg}', { msg: err.message }) : t('Fichier illisible.'),
        });
      }
    };
    reader.readAsText(file);
  };

  // Plage affichée pour un jour : la sienne si elle a été modifiée, sinon la plage par défaut
  const defaultWindow = defaultDayWindowStrings({
    dayStartTime,
    timelineStartHour,
    timelineEndHour,
    timelineStepMinutes,
  });
  const windowFor = (i: number) => customWindows[String(i)] ?? defaultWindow;
  const editWindow = (i: number, patch: Partial<{ start: string; end: string }>) =>
    setCustomWindows((prev) => ({ ...prev, [String(i)]: { ...(prev[String(i)] ?? defaultWindow), ...patch } }));

  const clampSlot = (m: number) => Math.min(600, Math.max(5, Math.round((Number(m) || 60) / 5) * 5));

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    // Valide la plage (fin après début) et le pas ; retombe sur les valeurs par défaut sinon
    const timeline = getTimelineConfig({
      timelineStartHour: Number(timelineStartHour),
      timelineEndHour: Number(timelineEndHour),
      timelineStepMinutes: Number(timelineStepMinutes),
    });
    // On ne mémorise que les jours modifiés (les autres suivent la plage par défaut) ; une plage invalide est ignorée
    const defaults = defaultDayWindowStrings({
      dayStartTime,
      timelineStartHour: timeline.startHour,
      timelineEndHour: timeline.endHour,
      timelineStepMinutes: timeline.stepMinutes,
    });
    const dayWindows: Record<string, { start: string; end: string }> = {};
    Object.entries(customWindows).forEach(([day, w]) => {
      const s = parseTime(w.start);
      const e = w.end === '23:59' ? 24 * 60 : parseTime(w.end);
      const valid = s !== null && e !== null && e > s;
      if (valid && (w.start !== defaults.start || w.end !== defaults.end)) dayWindows[day] = { start: w.start, end: w.end };
    });
    onSaveSettings({
      ...settings,
      dayWindows,
      breaks: cleanBreaks(breaks),
      multiDayCount: getMultiDayCount({ multiDayCount: Number(multiDayCount) }),
      blockDetails,
      defaultJPattern: defaultPattern.includes(0) ? defaultPattern : [0, ...defaultPattern],
      jPool: [...new Set([...jPool, ...defaultPattern, 0])].sort((a, b) => a - b),
      slotDurationDefault: clampSlot(slotDefault),
      slotDurationByJ: Object.fromEntries(Object.entries(slotByJ).map(([j, m]) => [j, clampSlot(m)])),
      // Anciens champs gardés cohérents (autres versions de l'app)
      slotDurationOthers: clampSlot(slotDefault),
      slotDurationJ0J1: clampSlot(slotByJ['0'] ?? slotDefault),
      autoCascadeShift: autoCascade,
      dailyTargetHours: Number(dailyTargetHours),
      dayStartTime,
      timelineStartHour: timeline.startHour,
      timelineEndHour: timeline.endHour,
      timelineStepMinutes: timeline.stepMinutes,
      theme,
      language,
    });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportBackup(content);
        onClose();
      }
    };
    reader.readAsText(file);
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={handleSaveAll}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('Préférences & Réglages {app}', { app: APP_NAME })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('Disciplines, planning, affichage et sauvegardes')}
                </p>
              </div>
            </div>
            <button
              aria-label={t('Fermer')}
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs in Modal : tous les onglets visibles, sans défilement horizontal */}
          <div className="grid grid-cols-5 gap-1 px-3 sm:px-6 pt-3 border-b border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs font-bold">
            {(
              [
                { id: 'preferences', icon: Layers, label: t('Affichage'), title: t('Langue, thème, types de liens') },
                { id: 'subjects', icon: Palette, label: t('Disciplines'), title: t('Disciplines & Couleurs ({n})', { n: localSubjects.length }) },
                { id: 'planning', icon: Clock, label: t('Planning'), title: t('Répétitions, créneaux, journée de travail') },
                { id: 'backup', icon: Cloud, label: t('Cloud'), title: t('Cloud & Sauvegardes') },
                { id: 'help', icon: HelpCircle, label: t('Aide'), title: t('Aide') },
              ] as const
            ).map(({ id, icon: Icon, label, title }) => (
              <button
                key={id}
                type="button"
                title={title}
                aria-label={title}
                onClick={() => setActiveTab(id)}
                className={`pb-2.5 px-1 border-b-2 transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center leading-tight ${
                  activeTab === id
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5 max-h-[68vh] overflow-y-auto">
            {/* ======================================================== */}
            {/* TAB 1: DISCIPLINES & COULEURS */}
            {/* ======================================================== */}
            {activeTab === 'subjects' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('Matières médicales enregistrées')}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('Modifiez le libellé, le code et le code couleur de chaque matière.')}
                    </p>
                  </div>

                  {!isAddingSubject && (
                    <button
                      type="button"
                      onClick={() => setIsAddingSubject(true)}
                      className="px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-xl hover:bg-teal-100 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('Ajouter une matière')}</span>
                    </button>
                  )}
                </div>

                {/* Form to add a new subject */}
                {isAddingSubject && (
                  <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 space-y-3 animate-in fade-in">
                    <span className="text-xs font-bold text-teal-900 dark:text-teal-300 block">
                      {t('Nouvelle matière médicale')}
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                          {t('Nom de la matière')}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={t('Ex: Ophtalmologie, Dermatologie...')}
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                          {t('Code court')}
                        </label>
                        <input
                          type="text"
                          placeholder={t('OPHTALMO')}
                          value={newSubCode}
                          onChange={(e) => setNewSubCode(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Color selection */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        {t('Couleur associée')}
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {PRESET_COURSE_COLORS.map((col) => (
                          <button
                            key={col.hex}
                            type="button"
                            onClick={() => setNewSubColor(col.hex)}
                            className={`w-6 h-6 rounded-full transition-transform ${
                              newSubColor === col.hex ? 'ring-2 ring-offset-2 ring-teal-500 scale-110' : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: col.hex }}
                          />
                        ))}
                        <input
                          type="color"
                          value={newSubColor}
                          onChange={(e) => setNewSubColor(e.target.value)}
                          className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingSubject(false)}
                        className="px-3 py-1 text-xs text-slate-500"
                      >
                        {t('Annuler')}
                      </button>
                      <button
                        type="button"
                        onClick={handleAddNewSubject}
                        className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                      >
                        {t('Créer la matière')}
                      </button>
                    </div>
                  </div>
                )}

                {/* List of existing subjects */}
                <div className="space-y-2">
                  {localSubjects.map((sub) => {
                    const attachedCount = courses.filter((c) => c.subjectId === sub.id).length;
                    const isEditing = editingSubjectId === sub.id;

                    return (
                      <div
                        key={sub.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        {isEditing ? (
                          <div className="space-y-2 flex-1">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={subNameInput}
                                onChange={(e) => setSubNameInput(e.target.value)}
                                className="sm:col-span-2 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white font-bold"
                              />
                              <input
                                type="text"
                                value={subCodeInput}
                                onChange={(e) => setSubCodeInput(e.target.value)}
                                className="px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {PRESET_COURSE_COLORS.map((col) => (
                                <button
                                  key={col.hex}
                                  type="button"
                                  onClick={() => setSubColorInput(col.hex)}
                                  className={`w-5 h-5 rounded-full ${
                                    subColorInput === col.hex ? 'ring-2 ring-offset-1 ring-teal-500 scale-110' : ''
                                  }`}
                                  style={{ backgroundColor: col.hex }}
                                />
                              ))}
                              <input
                                type="color"
                                value={subColorInput}
                                onChange={(e) => setSubColorInput(e.target.value)}
                                className="w-6 h-6 rounded border-0 cursor-pointer p-0 bg-transparent"
                              />
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingSubjectId(null)}
                                className="text-xs text-slate-500"
                              >
                                {t('Annuler')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditSubject(sub.id)}
                                className="px-3 py-1 text-xs font-bold text-white bg-teal-600 rounded-md"
                              >
                                {t('Enregistrer')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <span
                                className="w-4 h-4 rounded-full shrink-0 shadow-2xs"
                                style={{ backgroundColor: sub.color }}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                                    {sub.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded">
                                    {sub.code}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {attachedCount === 0 ? (
                                    <span className="text-slate-400">{t('Aucun cours rattaché')}</span>
                                  ) : (
                                    <span className="font-medium text-teal-700 dark:text-teal-400">
                                      {plural(attachedCount, '{n} cours rattaché', '{n} cours rattachés')}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleStartEditSubject(sub)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title={t('Modifier le nom ou la couleur')}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteSubject(sub)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                title={
                                  attachedCount > 0
                                    ? t('Supprimer ({n} cours rattachés : à rattacher ailleurs ou supprimer)', { n: attachedCount })
                                    : t('Supprimer cette matière')
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Import en bas de liste */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <input
                    ref={subjectsFileRef}
                    type="file"
                    accept=".json,.csv,.txt"
                    onChange={handleImportSubjects}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => subjectsFileRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    <span>{t('Importer des matières')}</span>
                  </button>
                  {importMsg && (
                    <p
                      className={`text-[11px] font-medium ${
                        importMsg.type === 'ok'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {importMsg.text}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {t('Formats acceptés :')}{' '}<strong>{t('CSV/TXT')}</strong> {t('(une matière par ligne :')}{' '}
                    <code className="font-mono">{t('Nom;CODE;#couleur')}</code>{t(', code et couleur optionnels ; une ligne décalée par des espaces ou une tabulation devient un dossier de la matière au-dessus, un second décalage un sous-dossier) ou')}{' '}
                    <strong>{t('JSON')}</strong>{' '}{t('(liste de matières, ou un fichier de sauvegarde {app}).', { app: APP_NAME })}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pt-1">{t('Exemple de fichier .txt :')}</p>
                  <pre className="text-[11px] leading-relaxed font-mono p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 overflow-x-auto">{`Cardiologie;CARDIO;#e11d48
  Rythmologie
    ECG
    Fibrillation atriale
  Insuffisance cardiaque
ICM;ICM;#2563eb
  Intro Médicaments
    Pharmacocinétique
Pneumologie`}</pre>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: PLANNING (répétitions, créneaux, journée de travail, affichage du planning) */}
            {/* ======================================================== */}
            {activeTab === 'planning' && (
              <div className="space-y-3">
                <SettingsSection title={t('Répétitions')} defaultOpen>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('Répétitions par défaut')}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('Appliquées à chaque nouveau cours.')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-500">{t('Préréglages :')}</span>
                    <button
                      type="button"
                      onClick={() => setDefaultPattern([...DEFAULT_J_PATTERNS.ednClassique])}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                    >
                      {t('EDN Classique')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultPattern([...DEFAULT_J_PATTERNS.passIntensif])}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                    >
                      {t('PASS Intensif')}
                    </button>
                  </div>
                </div>

                {/* J chips : la liste est modifiable ; un chip coché = répétition par défaut */}
                <div className="flex flex-wrap gap-1.5 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl">
                  {[...new Set([...jPool, ...defaultPattern])].sort((a, b) => a - b).map((jVal) => {
                    const isChecked = defaultPattern.includes(jVal);
                    return (
                      <span
                        key={jVal}
                        className={`inline-flex items-stretch rounded-xl border transition-all overflow-hidden ${
                          isChecked
                            ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={jVal === 0}
                          aria-pressed={isChecked}
                          onClick={() => toggleJ(jVal)}
                          className="pl-3 pr-2 py-1.5 text-xs font-bold flex items-center gap-1 hover:brightness-95"
                        >
                          <span>J{jVal}</span>
                          <span className="text-[10px] opacity-75 font-normal">({formatMinutes(slotByJ[String(jVal)] ?? slotDefault)})</span>
                        </button>
                        {jVal !== 0 && (
                          <button
                            type="button"
                            aria-label={t('Retirer J{j} de la liste', { j: jVal })}
                            title={(() => {
                              const used = courses.filter((c) => c.activeJList?.includes(jVal)).length;
                              return used > 0
                                ? t('Retirer J{j} de la liste (utilisé par {n} cours)', { j: jVal, n: used })
                                : t('Retirer J{j} de la liste (inutilisé)', { j: jVal });
                            })()}
                            onClick={() => removeFromPool(jVal)}
                            className="px-1.5 opacity-70 hover:opacity-100 hover:bg-black/10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-teal-600" />
                    {t('Par défaut')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                    {t('Proposé seulement')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <X className="w-3 h-3" />
                    {t('Retirer de la liste')}
                  </span>
                </div>

                {/* Ajout d'un intervalle à la liste */}
                <JIntervalAdder
                  label={t('Ajouter un intervalle :')}
                  existing={[...jPool, ...defaultPattern]}
                  onAdd={(num) => setJPool((prev) => [...new Set([...prev, num])].sort((x, y) => x - y))}
                />

                </SettingsSection>

                <SettingsSection title={t('Créneaux')}>
                {/* Durée des créneaux : valeur par défaut + exceptions par J (rangées en grille) */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Durée des créneaux')}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('Une durée pour tous les J, puis des exceptions pour certains. Appliqué aux nouveaux créneaux.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="slot-default" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t('Par défaut')}
                      </label>
                      <DurationSelect id="slot-default" value={slotDefault} onChange={setSlotDefault} />
                    </div>
                  </div>

                  {(
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {Object.keys(slotByJ)
                        .map(Number)
                        .sort((a, b) => a - b)
                        .map((j) => (
                          <div
                            key={j}
                            className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/30"
                          >
                            <label
                              htmlFor={`slot-j-${j}`}
                              className="text-xs font-bold text-teal-700 dark:text-teal-400 shrink-0"
                            >
                              J{j}
                            </label>
                            <DurationSelect
                              id={`slot-j-${j}`}
                              value={slotByJ[String(j)]}
                              onChange={(m) =>
                                setSlotByJ((prev) => {
                                  const next = { ...prev };
                                  // Identique à la durée par défaut : ce n'est plus une exception
                                  if (m === slotDefault) delete next[String(j)];
                                  else next[String(j)] = m;
                                  return next;
                                })
                              }
                              className="flex-1 min-w-0 border-0 bg-transparent font-medium"
                            />
                            <button
                              type="button"
                              aria-label={t('Supprimer l\'exception J{j}', { j })}
                              title={t('Revenir à la durée par défaut')}
                              onClick={() =>
                                setSlotByJ((prev) => {
                                  const next = { ...prev };
                                  delete next[String(j)];
                                  return next;
                                })
                              }
                              className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      <button
                        type="button"
                        onClick={() => {
                          setNewSlotJ('');
                          setNewSlotMinutes(slotDefault === 60 ? 90 : 60);
                          setIsAddingException(true);
                        }}
                        title={t('Ajouter une exception de durée pour un J')}
                        aria-label={t('Ajouter une exception de durée pour un J')}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:text-teal-700 dark:hover:text-teal-400 hover:border-teal-400"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('Exception')}</span>
                      </button>
                    </div>
                  )}

                </div>

                {/* Cascade shifting toggle */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-start gap-2.5">
                    <input
                      id="settings-cascade"
                      type="checkbox"
                      checked={autoCascade}
                      onChange={(e) => setAutoCascade(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                    />
                    <div>
                      <label htmlFor="settings-cascade" className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer block">
                        {t('Décalage automatique en cascade des révisions suivantes')}
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t('Si vous décalez un créneau (ex: J1 repoussé de 2 jours), tous les créneaux suivants non faits (J3, J7, J15...) sont décalés du même nombre de jours pour préserver la courbe de mémorisation.')}
                      </p>
                    </div>
                  </div>
                </div>
                </SettingsSection>

                <SettingsSection title={t('Journée de travail')}>
                {/* Target Hours & Start Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                      {t('Objectif journalier de travail')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="14"
                        value={dailyTargetHours}
                        onChange={(e) => setDailyTargetHours(Number(e.target.value))}
                        className="w-24 px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold dark:bg-slate-800 dark:text-white"
                      />
                      <span className="text-xs text-slate-500">{t('heures / jour')}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                      {t('Heure de début suggérée')}
                    </label>
                    <TimeSelect
                      ariaLabel={t('Heure de début suggérée')}
                      value={dayStartTime}
                      onChange={setDayStartTime}
                      className="px-3 py-1.5"
                    />
                  </div>
                </div>


                {/* Plages horaires autorisées par jour de la semaine */}
                <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      {t('Plages horaires par jour')}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('Heures pendant lesquelles vous acceptez de travailler. Les nouveaux créneaux (J0, J1…) se placent là où il y a de la place dans la plage du jour, et on ne peut pas les déplacer hors de cette plage. Le reste de la journée apparaît grisé.')}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {weekdayLabels().map((label, i) => {
                      const shown = windowFor(i);
                      const startMin = parseTime(shown.start);
                      const endMin = shown.end === '23:59' ? 24 * 60 : parseTime(shown.end);
                      const invalid = startMin === null || endMin === null || endMin <= startMin;
                      return (
                        <div key={label} className="flex items-center gap-2 flex-wrap">
                          <span className="w-20 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                          <TimeSelect
                            ariaLabel={t('{day} : début', { day: label })}
                            value={shown.start}
                            onChange={(v) => editWindow(i, { start: v })}
                          />
                          <span className="text-xs text-slate-400">{t('à')}</span>
                          <TimeSelect
                            ariaLabel={t('{day} : fin', { day: label })}
                            value={shown.end}
                            onChange={(v) => editWindow(i, { end: v })}
                            fromMinutes={30}
                            allowMidnight
                          />
                          {/* Aperçu : la plage sur 24 h */}
                          {!invalid && (
                            <span
                              className="hidden sm:block flex-1 min-w-[60px] max-w-[160px] h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden"
                              aria-hidden="true"
                            >
                              <span
                                className="absolute inset-y-0 rounded-full bg-teal-500/70"
                                style={{ left: `${(startMin! / 1440) * 100}%`, width: `${((endMin! - startMin!) / 1440) * 100}%` }}
                              />
                            </span>
                          )}
                          {invalid && (
                            <span className="text-[11px] text-rose-600 dark:text-rose-400">{t('la fin doit suivre le début')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const monday = windowFor(0);
                        setCustomWindows(Object.fromEntries(weekdayLabels().map((_, i) => [String(i), { ...monday }])));
                      }}
                      className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      {t('Appliquer le lundi à tous les jours')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomWindows({})}
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      {t('Rétablir la plage par défaut')}
                    </button>
                  </div>
                </div>

                <BreaksEditor value={breaks} onChange={setBreaks} weekdayLabels={weekdayLabels()} />

                </SettingsSection>

                <SettingsSection title={t('Affichage du planning')}>
                {/* Échelle de la vue Journée */}
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      {t('Échelle de la vue Journée')}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('Plage d\'heures affichée et pas de déplacement des créneaux (glisser-déposer).')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="tl-start" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        {t('De')}
                      </label>
                      <select
                        id="tl-start"
                        value={timelineStartHour}
                        onChange={(e) => setTimelineStartHour(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="tl-end" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        {t('À')}
                      </label>
                      <select
                        id="tl-end"
                        value={timelineEndHour}
                        onChange={(e) => setTimelineEndHour(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={h}>
                            {String(h % 24).padStart(2, '0')}:00{h === 24 ? ` ${t('(minuit)')}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="tl-step" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        {t('Pas de déplacement')}
                      </label>
                      <select
                        id="tl-step"
                        value={timelineStepMinutes}
                        onChange={(e) => setTimelineStepMinutes(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono dark:bg-slate-800 dark:text-white"
                      >
                        {STEP_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m === 60 ? t('1 h') : t('{n} min', { n: m })}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>


                {/* Vue sur plusieurs jours + détails affichés dans les créneaux */}
                <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      {t('Vue sur plusieurs jours et affichage des créneaux')}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('La vue « N jours » se place entre Jour et Semaine. Quand les colonnes sont assez larges, les créneaux affichent les détails cochés ci-dessous.')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="multi-days" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {t('Nombre de jours')}
                    </label>
                    <select
                      id="multi-days"
                      value={multiDayCount}
                      onChange={(e) => setMultiDayCount(Number(e.target.value))}
                      className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800 dark:text-white"
                    >
                      {Array.from({ length: MULTI_DAY_MAX - MULTI_DAY_MIN + 1 }, (_, i) => MULTI_DAY_MIN + i).map((n) => (
                        <option key={n} value={n}>
                          {t('{n} jours', { n })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="block-subject" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {t('Matière dans les créneaux')}
                    </label>
                    <select
                      id="block-subject"
                      value={blockDetails.subject}
                      onChange={(e) => setBlockDetails((prev) => ({ ...prev, subject: e.target.value as SubjectDisplay }))}
                      className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white"
                    >
                      <option value="code">{t('Code court (CARDIO…)')}</option>
                      <option value="name">{t('Nom complet')}</option>
                      <option value="none">{t('Aucune (couleur seule)')}</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 max-w-md">
                    {(
                      [
                        ['code', t('Code de l\'item')],
                        ['notes', t('Texte de la note du créneau')],
                        ['rating', t('Étoiles de la note')],
                      ] as ['code' | 'notes' | 'rating', string][]
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={blockDetails[key]}
                          onChange={(e) => setBlockDetails((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                </SettingsSection>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 3: AFFICHAGE (langue, thème, types de liens) */}
            {/* ======================================================== */}
            {activeTab === 'preferences' && (
              <div className="space-y-4">
                {/* Langue de l'interface */}
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                    {t('Langue / Language')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setLanguage(l.id)}
                        aria-pressed={language === l.id}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                          language === l.id
                            ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>


                {/* Theme Selector (Clair / Sombre) */}
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                    {t('Apparence & Thème visuel')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                        theme === 'light'
                          ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-500 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                        <Sun className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">{t('Thème Clair')}</span>
                        <span className="text-[10px] text-slate-500">{t('Pour le travail de jour')}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                        theme === 'dark'
                          ? 'border-teal-600 bg-slate-800 text-teal-300 ring-2 ring-teal-500 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-indigo-900/60 text-indigo-300">
                        <Moon className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">{t('Thème Sombre')}</span>
                        <span className="text-[10px] text-slate-400">{t('Pour les gardes et révisions tardives')}</span>
                      </div>
                    </button>
                  </div>
                </div>


                {/* Types de liens des cours */}
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    {t('Types de liens')}
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                    {t('Pour classer les liens (Drive, flashcards…) ajoutés aux cours. Les modifications sont enregistrées tout de suite.')}
                  </p>
                  <LinkTypesManager linkTypes={getLinkTypes(settings)} courses={courses} onChange={onChangeLinkTypes} />
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 4: CLOUD & SAUVEGARDE */}
            {/* ======================================================== */}
            {activeTab === 'backup' && (
              <div className="space-y-4">
                {/* Cloud Firebase Firestore Sync Section */}
                {!cloudAvailable ? (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{t('Cloud non configuré')}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t('Cette installation fonctionne en local : vos données restent dans ce navigateur. Pour les synchroniser entre vos appareils, branchez votre propre projet Firebase en suivant')}{' '}
                      <code className="font-mono text-[10px]">docs/CLOUD_SETUP.md</code>{t('. En attendant, la sauvegarde JSON ci-dessous permet de transférer vos données.')}
                    </p>
                  </div>
                ) : (
                  <>
                <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/40 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-teal-600 text-white shadow-xs">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          {t('Synchronisation Cloud')}
                        </span>
                        <span className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
                          {t('Retrouvez vos cours sur tous vos appareils')}
                        </span>
                      </div>
                    </div>

                    {currentUser ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{t('Connecté au Cloud')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                        <span>{t('Local uniquement')}</span>
                      </span>
                    )}
                  </div>

                  {/* Erreur de connexion : message simple, détails techniques repliés */}
                  {authError && (
                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <span className="text-xs font-bold">{t('Connexion impossible, réessayez.')}</span>
                        </div>
                        {onClearAuthError && (
                          <button
                            aria-label={t('Masquer l\'erreur')}
                            type="button"
                            onClick={onClearAuthError}
                            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <details className="text-[11px] text-rose-700 dark:text-rose-300">
                        <summary className="cursor-pointer font-semibold">{t('Détails')}</summary>
                        <p className="mt-1 leading-relaxed">
                          {authError.code ? `${authError.code} : ` : ''}
                          {authError.message}
                        </p>
                        {authError.resolution && <p className="mt-1 leading-relaxed">{authError.resolution}</p>}
                        <p className="mt-1">
                          {t('Domaine :')}{' '}<span className="font-mono select-all">{window.location.hostname}</span>
                        </p>
                      </details>
                    </div>
                  )}

                  {currentUser ? (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-teal-200 dark:border-teal-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {currentUser.isAnonymous
                              ? t('Session temporaire (non liée à un compte)')
                              : t('Compte : {name}', { name: currentUser.email || currentUser.displayName || t('Utilisateur Cloud') })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {currentUser.isAnonymous
                            ? t('Cette session n\'existe que sur cet appareil. Déconnectez-vous puis connectez-vous avec Google pour synchroniser vos appareils.')
                            : t('Synchronisation automatique en temps réel active avec votre compte.')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onSyncCloudNow && (
                          <button
                            type="button"
                            onClick={onSyncCloudNow}
                            disabled={isSyncing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-300 dark:border-teal-700 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span>{isSyncing ? t('Synchronisation...') : t('Synchroniser')}</span>
                          </button>
                        )}

                        {onLogout && (
                          <button
                            type="button"
                            onClick={onLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{t('Déconnexion')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-teal-100 dark:border-teal-900 space-y-3 shadow-2xs">
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t('Connectez-vous pour retrouver vos cours sur tous vos appareils. Sans connexion, tout reste sur cet appareil.')}
                      </p>

                      {(onLoginWithGoogle || onLoginWithGoogleRedirect) && (
                        <button
                          type="button"
                          onClick={() => {
                            // Sur tablette / app installée, la fenêtre pop-up est souvent bloquée : on passe par la redirection
                            const useRedirect =
                              !onLoginWithGoogle ||
                              (!!onLoginWithGoogleRedirect &&
                                (window.matchMedia('(pointer: coarse)').matches ||
                                  window.matchMedia('(display-mode: standalone)').matches));
                            (useRedirect ? onLoginWithGoogleRedirect : onLoginWithGoogle)?.();
                          }}
                          className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>{t('Continuer avec Google')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowEmailLogin((v) => !v)}
                        aria-expanded={showEmailLogin}
                        className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        {showEmailLogin ? t('Masquer') : t('Utiliser un e-mail à la place')}
                      </button>

                      {showEmailLogin && (
                        <div className="space-y-2 pt-1">
                          <input
                            type="email"
                            aria-label={t('Adresse e-mail')}
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder={t('Adresse e-mail')}
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                          />
                          <input
                            type="password"
                            aria-label={t('Mot de passe')}
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder={t('Mot de passe (6 caractères min.)')}
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                          />

                          {emailError && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{emailError}</p>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={emailLoading || !emailInput.trim() || passwordInput.length < 6}
                              onClick={async () => {
                                setEmailError(null);
                                setEmailLoading(true);
                                try {
                                  if (emailMode === 'login' && onLoginWithEmail) {
                                    await onLoginWithEmail(emailInput, passwordInput);
                                  } else if (emailMode === 'register' && onRegisterWithEmail) {
                                    await onRegisterWithEmail(emailInput, passwordInput);
                                  }
                                } catch (err: any) {
                                  setEmailError(err?.message || t('Connexion impossible, réessayez.'));
                                } finally {
                                  setEmailLoading(false);
                                }
                              }}
                              className="flex-1 py-2 px-3 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
                            >
                              {emailLoading ? t('Chargement...') : emailMode === 'login' ? t('Se connecter') : t('Créer le compte')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEmailError(null);
                                setEmailMode(emailMode === 'login' ? 'register' : 'login');
                              }}
                              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline px-2"
                            >
                              {emailMode === 'login' ? t('Créer un compte ?') : t('Déjà un compte ?')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Backup JSON */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-teal-600" />
                      <span>{t('Sauvegarde de secours JSON (Fichier local)')}</span>
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 font-medium">
                      {t('Sécurité 100% Hors-Ligne')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('Même avec le Cloud actif, vous pouvez exporter ou importer à tout moment un fichier JSON complet de votre base de révision.')}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button
                      type="button"
                      onClick={onExportBackup}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-600" />
                      <span>{t('Exporter sauvegarde JSON')}</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-teal-600" />
                      <span>{t('Importer un fichier JSON')}</span>
                    </button>
                    {/*
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t('Réinitialiser toutes les données avec les cours d’exemple ?')
                          )
                        ) {
                          onResetSeedData();
                          onClose();
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('Réinitialiser les exemples')}</span>
                    </button>
                    */}
                  </div>
                </div>

                {/* Export des créneaux vers un agenda externe */}
                <CalendarExportSection courses={courses} revisions={revisions} subjects={subjects} settings={settings} onSaveSettings={onSaveSettings} />

                {/* Sauvegardes de sécurité créées avant un écrasement local/cloud */}
                {safetyBackups.length > 0 && onRestoreSafetyBackup && (
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 space-y-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                      <span>{t('Versions mises de côté (annuler un écrasement)')}</span>
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {t('Avant de remplacer vos données par celles du cloud (ou l\'inverse), la version écrasée est conservée ici.')}
                    </p>
                    <ul className="space-y-1.5">
                      {safetyBackups.map((b, i) => (
                        <li key={b.at} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">{t(b.reason)}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {new Date(b.at).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              {' · '}{t('{courses} cours · {slots} créneaux', { courses: b.courses, slots: b.revisions })}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('Restaurer cette version ? Vos données actuelles seront à leur tour mises de côté.'))) {
                                onRestoreSafetyBackup(i);
                              }
                            }}
                            className="shrink-0 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-300 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          >
                            {t('Restaurer')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          {/* ======================================================== */}
          {/* TAB 5 : AIDE */}
          {/* ======================================================== */}
          {activeTab === 'help' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Application')}</h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('Sur l\'écran d\'accueil (iPad, téléphone), il n\'y a pas de bouton de rechargement : utilisez celui-ci pour récupérer la dernière version.')}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('Recharger l\'application')}</span>
                </button>
              </div>
              {/* Surcharge, retards et lissage de charge */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Surcharge, retards et lissage')}</h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('Un créneau qui ne trouve plus de place n\'est jamais décalé au jour suivant ni supprimé : il s\'empile après la fin de la plage de travail de son jour. L\'application le signale en ambre sur le planning et dans l\'onglet Dashboard, sans rien déplacer toute seule.')}
                </p>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('Lissage d\'un jour chargé')}</span>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    <PlanningRules kind="smooth" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t('Rattrapage des retards')}</span>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    <PlanningRules kind="catchup" />
                  </div>
                </div>
              </div>
              {/* Méthode des J & Ebbinghaus */}
              <div className="bg-gradient-to-br from-teal-50/80 via-white to-slate-50 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900 rounded-2xl border border-teal-200 dark:border-teal-800/60 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                  <h3 className="text-sm font-bold text-teal-950 dark:text-teal-200">
                    {t('Fondements de la Méthode des J en Médecine (Courbe d\'Ebbinghaus)')}
                  </h3>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {t('Sans révision, le cerveau humain oublie plus de 70% d\'un cours d\'anatomie ou de sémiologie en 48 heures. La méthode des J réactive la trace mnésique au moment exact où elle commence à décliner, aplatissant progressivement la courbe de l\'oubli.')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
                    <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
                      {t('1. Encodage Initial : J0 & J1')}
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                      {t('Créneaux longs pour comprendre la physiopathologie et ancrer les mécanismes avant l\'oubli nocturne.')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
                    <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
                      {t('2. Rappel Actif : J3, J7, J15')}
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                      {t('Créneaux plus courts basés sur l\'effort de restitution : QCM, cas cliniques et flashcards sans relire passivement.')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-teal-100 dark:border-teal-900/60 shadow-2xs space-y-1">
                    <span className="text-xs font-bold text-teal-800 dark:text-teal-300 block">
                      {t('3. Cascade Automatique')}
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                      {t('Si un J1 est reporté de 2 jours, les J3 et J7 suivants sont automatiquement décalés pour préserver l\'écart mnésique optimal.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* État d'avancement et niveau de connaissance par cours */}
              {(() => {
                const masteryCounts: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
                courses.forEach((c) => {
                  masteryCounts[c.mastery]++;
                });

                return (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {t('État d\'avancement et niveau de connaissance par cours')}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('Distribution de la solidité mnésique auto-évaluée')}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {t('{n} cours au total', { n: courses.length })}
                      </span>
                    </div>

                    {/* Barre multi-segments */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden flex">
                      {([4, 3, 2, 1, 0] as MasteryLevel[]).map((lvl) => {
                        const count = masteryCounts[lvl];
                        const pct = courses.length > 0 ? (count / courses.length) * 100 : 0;
                        const bgClass =
                          lvl === 4
                            ? 'bg-emerald-500'
                            : lvl === 3
                            ? 'bg-sky-500'
                            : lvl === 2
                            ? 'bg-amber-500'
                            : lvl === 1
                            ? 'bg-rose-500'
                            : 'bg-slate-300 dark:bg-slate-700';

                        return (
                          <div
                            key={lvl}
                            style={{ width: `${pct}%` }}
                            className={`${bgClass} h-full transition-all`}
                            title={t('{label} : {n} cours ({pct}%)', { label: MASTERY_CONFIG[lvl].label, n: count, pct: pct.toFixed(0) })}
                          />
                        );
                      })}
                    </div>

                    {/* Légende */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                      {([4, 3, 2, 1, 0] as MasteryLevel[]).map((lvl) => {
                        const cfg = MASTERY_CONFIG[lvl];
                        const count = masteryCounts[lvl];
                        const pct = courses.length > 0 ? ((count / courses.length) * 100).toFixed(0) : '0';

                        return (
                          <div
                            key={lvl}
                            className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between"
                          >
                            <div>
                              <span className={`text-xs font-bold block ${cfg.text}`}>
                                {lvl === 0 ? t('Nouveau') : `${lvl} ★`}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                {cfg.shortLabel}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-mono font-bold text-slate-900 dark:text-white block">
                                {count}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* Astuces d'utilisation */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t('Astuces')}</h4>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  <li>{t('Glissez-déposez un créneau d\'un jour à l\'autre dans la vue Semaine pour le décaler en cascade.')}</li>
                  <li>{t('Cliquez sur un cours pour ouvrir sa fiche : notes, couleur, planning et progression.')}</li>
                  <li>{t('Importez vos matières depuis l\'onglet « Disciplines & Couleurs » (JSON ou texte).')}</li>
                  <li>{t('Exportez régulièrement une sauvegarde JSON, même avec la synchronisation Cloud active.')}</li>
                </ul>
              </div>
            </div>
          )}
          </div>

          {/* Nouvelle exception de durée */}
          {isAddingException && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            >
              <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{t('Exception de durée')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="slot-new-j" className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                      {t('Intervalle')}
                    </label>
                    <select
                      id="slot-new-j"
                      value={newSlotJ}
                      onChange={(e) => setNewSlotJ(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">{t('Choisir')}</option>
                      {[...new Set([...jPool, ...defaultPattern])]
                        .sort((a, b) => a - b)
                        .filter((j) => slotByJ[String(j)] === undefined)
                        .map((j) => (
                          <option key={j} value={j}>
                            J{j}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="slot-new-min" className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                      {t('Durée')}
                    </label>
                    <DurationSelect
                      id="slot-new-min"
                      value={newSlotMinutes}
                      onChange={setNewSlotMinutes}
                      className="w-full"
                    />
                  </div>
                </div>
                {newSlotMinutes === slotDefault && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('Cette durée est déjà celle par défaut : choisissez-en une différente.')}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingException(false)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    {t('Annuler')}
                  </button>
                  <button
                    type="button"
                    disabled={newSlotJ === '' || newSlotMinutes === slotDefault}
                    onClick={() => {
                      setSlotByJ((prev) => ({ ...prev, [newSlotJ]: newSlotMinutes }));
                      setIsAddingException(false);
                    }}
                    className="px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl"
                  >
                    {t('Ajouter')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Retrait d'un intervalle J utilisé par des cours : simple information, on peut retirer quand même */}
          {jToRemove && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            >
              <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
                <div className="flex items-start gap-2">
                  <Layers className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t('Retirer J{j} de la liste ?', { j: jToRemove.val })}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t('J{j} est utilisé par {n} cours. Ils gardent leurs révisions : il ne sera simplement plus proposé pour les prochains cours.', { j: jToRemove.val, n: jToRemove.used })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setJToRemove(null)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  >
                    {t('Garder')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = jToRemove.val;
                      setJToRemove(null);
                      setJPool((p) => p.filter((j) => j !== val));
                      setDefaultPattern((p) => p.filter((j) => j !== val));
                    }}
                    className="px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl"
                  >
                    {t('Retirer')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Suppression d'une matière qui a des cours */}
          {subjectToDelete && (() => {
            const count = courses.filter((c) => c.subjectId === subjectToDelete.id).length;
            const others = localSubjects.filter((s) => s.id !== subjectToDelete.id);
            return (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
              >
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t('Supprimer « {name} » ?', { name: subjectToDelete.name })}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {plural(count, '{n} cours est rattaché à cette discipline. Que doit-il devenir ?', '{n} cours sont rattachés à cette discipline. Que doivent-ils devenir ?')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label
                      className={`flex items-start gap-2 p-3 rounded-xl border ${
                        others.length === 0
                          ? 'opacity-50 border-slate-200 dark:border-slate-700'
                          : deleteMode === 'reassign'
                          ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delete-subject-mode"
                        checked={deleteMode === 'reassign'}
                        disabled={others.length === 0}
                        onChange={() => setDeleteMode('reassign')}
                        className="mt-0.5"
                      />
                      <span className="flex-1 space-y-1.5">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">
                          {t('Les rattacher à une autre discipline')}
                        </span>
                        <select
                          aria-label={t('Discipline de remplacement')}
                          value={reassignToId}
                          disabled={deleteMode !== 'reassign'}
                          onChange={(e) => setReassignToId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white"
                        >
                          {others.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>

                    <label
                      className={`flex items-start gap-2 p-3 rounded-xl border ${
                        deleteMode === 'delete'
                          ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delete-subject-mode"
                        checked={deleteMode === 'delete'}
                        onChange={() => setDeleteMode('delete')}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-bold text-rose-700 dark:text-rose-400 block">
                          {t('Supprimer aussi les {n} cours', { n: count })}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {t('avec toutes leurs révisions. Irréversible.')}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSubjectToDelete(null)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      {t('Annuler')}
                    </button>
                    <button
                      type="button"
                      onClick={confirmDeleteSubject}
                      disabled={deleteMode === 'reassign' && !reassignToId}
                      className={`px-3 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 ${
                        deleteMode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'
                      }`}
                    >
                      {deleteMode === 'delete' ? t('Supprimer la discipline et {n} cours', { n: count }) : t('Rattacher et supprimer la discipline')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              {activeTab === 'help' ? t('Fermer') : t('Annuler')}
            </button>
            {activeTab !== 'help' && (
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('Enregistrer les préférences')}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
