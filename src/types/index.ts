export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

/** Sous-dossier de rangement d'une discipline (2 niveaux max : `parentId` absent = niveau 1). Sans propriété propre. */
export interface SubjectFolder {
  id: string;
  name: string;
  parentId?: string;
}

/** Lien externe d'un cours (Drive, flashcards…). Le type pointe vers `AppSettings.linkTypes` ; un type supprimé s'affiche comme « Autre ». */
export interface CourseLink {
  id: string;
  url: string;           // http(s) uniquement
  label?: string;        // absent = nom du site
  typeId: string;
}

/** Type de lien défini par l'utilisateur (liste commune à tous les cours). */
export interface LinkType {
  id: string;
  name: string;
  icon: string;          // clé de LINK_ICONS (utils/courseLinks)
  color: string;         // hex
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;       // Primary hex color
  bgColor: string;     // Tailwind bg class for badge
  textColor: string;   // Tailwind text class
  borderColor: string; // Tailwind border class
  accentBg: string;    // Light tint
  folders?: SubjectFolder[]; // Arborescence de rangement des cours dans la discipline
}

export interface RevisionItem {
  id: string;
  courseId: string;
  jIndex: number;          // 0, 1, 3, 7, 15, 30, 60, etc.
  scheduledDate: string;   // YYYY-MM-DD
  durationMinutes: number; // 90 min for J0 and J1, 60 min for J >= 2
  completed: boolean;
  completedDate?: string;
  rating?: MasteryLevel;
  notes?: string;
  slotOrder: number;       // Order in the day stack
  startTime?: string;      // HH:MM chosen on the day timeline; absent = stacked from the day start
}

export interface Course {
  id: string;
  title: string;
  itemCode: string;        // e.g. "EDN-228"
  subjectId: string;
  folderId?: string;       // Sous-dossier de la discipline où le cours est rangé ; absent = à la racine de la discipline
  links?: CourseLink[];    // Liens externes (cours, notes, flashcards…) affichés dans les fiches du cours et des J
  customColor?: string;    // Custom color override for this course (defaults to subject.color)
  j0Date: string;          // YYYY-MM-DD
  activeJList: number[];   // e.g. [0, 1, 3, 7, 15, 30, 60]
  mastery: MasteryLevel;
  notes?: string;
  createdAt: string;
}

export interface AppSettings {
  defaultJPattern: number[];
  /** Intervalles J proposés à la création d'un cours (modifiable) ; absent = liste d'origine. J0 y est toujours. */
  jPool?: number[];
  autoCascadeShift: boolean;
  dailyTargetHours: number;
  slotDurationJ0J1: number;    // default 90 minutes
  slotDurationOthers: number;  // default 60 minutes
  /** Durée par défaut d'un créneau (minutes) ; absent = `slotDurationOthers`. */
  slotDurationDefault?: number;
  /** Durée propre à certains J (clé = J, valeur = minutes) ; elle l'emporte sur la durée par défaut. */
  slotDurationByJ?: Record<string, number>;
  dayStartTime: string;        // e.g. "08:00"
  timelineStartHour: number;   // first hour shown on the day timeline (0-23)
  timelineEndHour: number;     // last hour shown on the day timeline (1-24)
  timelineStepMinutes: number; // drag snapping step: 5, 10, 15, 30 or 60
  /** Allowed hours per weekday ("0" = Monday … "6" = Sunday); a missing day uses the default window. */
  dayWindows?: Record<string, { start: string; end: string }>;
  /**
   * Non-work breaks (e.g. lunch). Key "all" = every day; a weekday key ("0" = Monday … "6") replaces "all" for that
   * day (an empty list = no break that day). Absent = no break.
   */
  breaks?: Record<string, { start: string; end: string }[]>;
  /** Days (YYYY-MM-DD) where the user chose to ignore breaks and the allowed-hours window (manual placement allowed anywhere on the scale). */
  forcedDates?: string[];
  /** Number of days of the multi-day view (2-6). */
  multiDayCount?: number;
  /** What the full-size timeline blocks show; a missing flag uses its default. */
  blockDetails?: { subject?: boolean | 'none' | 'code' | 'name'; code?: boolean; notes?: boolean; rating?: boolean };
  /** Types de liens des cours ; absent = liste d'origine (voir DEFAULT_LINK_TYPES). */
  linkTypes?: LinkType[];
  /** Agenda Google créé par l'application pour les créneaux (envoi direct) ; absent = pas encore créé. */
  googleCalendarId?: string;
  /** Date (ISO) du dernier envoi réussi vers cet agenda ; affichée dans le tableau de bord. */
  googleCalendarSyncedAt?: string;
  /** Langue de l'interface ; absent = français. */
  language?: 'fr' | 'en';
  splitView: boolean;
  theme: 'light' | 'dark';
}

export type ViewMode = 'agenda' | 'week' | 'month' | 'courses' | 'session' | 'stats' | 'dashboard';

export interface ToastMessage {
  title: string;
  description: string;
  type: 'success' | 'info' | 'error';
  /** Bouton facultatif (ex. « Annuler »). Le message reste plus longtemps affiché. */
  action?: { label: string; onClick: () => void };
}
